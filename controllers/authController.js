const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../config/db');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

/**
 * Verify Cloudflare Turnstile Token
 */
async function verifyTurnstile(token) {
    // Bypass Turnstile for development/testing
    return true;
    try {
        const formData = new URLSearchParams();
        formData.append('secret', process.env.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA');
        formData.append('response', token);
        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        return data.success;
    } catch (err) {
        console.error('[Auth] Turnstile error:', err);
        return false;
    }
}

/**
 * Generate a secure API key string
 */
function generateApiKey() {
    return 'cs_' + crypto.randomBytes(28).toString('hex'); // cs_<56 hex chars>
}

// ─────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────
const register = async (req, res) => {
    const { email, password, full_name } = req.body;

    if (!email || !password) {
        return res.status(400).json({ status: 'error', message: 'Email and password are required.' });
    }

    if (password.length < 8) {
        return res.status(400).json({ status: 'error', message: 'Password must be at least 8 characters.' });
    }

    const { cf_token } = req.body;
    const isHuman = await verifyTurnstile(cf_token);
    if (!isHuman) {
        return res.status(400).json({ status: 'error', message: 'Security check failed. Please verify you are human.' });
    }

    try {
        // Check if user already exists
        const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ status: 'error', message: 'An account with this email already exists.' });
        }

        // Detect currency from IP (basic — check X-Forwarded-For or IP-API)
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
        let currency = 'USD';
        let country_code = null;
        try {
            const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`);
            const geo = await geoRes.json();
            if (geo.countryCode === 'IN') {
                currency = 'INR';
                country_code = 'IN';
            } else {
                country_code = geo.countryCode || null;
            }
        } catch (_) { /* geo lookup failed, use defaults */ }

        const password_hash = await bcrypt.hash(password, 12);
        const userId = uuidv4();
        const verifyToken = crypto.randomBytes(32).toString('hex');

        // Insert user
        await db.query(
            `INSERT INTO users (id, email, password_hash, full_name, country_code, currency, verification_token, is_verified) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)`,
            [userId, email.toLowerCase(), password_hash, full_name || null, country_code, currency, verifyToken]
        );

        // Auto-generate first API key (they can use it once verified)
        const apiKeyValue = generateApiKey();
        await db.query(
            `INSERT INTO api_keys (user_id, key_value, name) VALUES ($1, $2, 'Default Key')`,
            [userId, apiKeyValue]
        );

        if (!process.env.SMTP_USER) {
            // Auto verify if no SMTP config is present to make dev testing easy
            await db.query(`UPDATE users SET is_verified = TRUE WHERE id = $1`, [userId]);
            return res.status(201).json({
                status: 'success',
                message: 'Account created successfully! (Since no SMTP email is configured, your account has been auto-verified. You can log in now.)',
            });
        }

        // Send Email
        await sendVerificationEmail(email.toLowerCase(), verifyToken);

        res.status(201).json({
            status: 'success',
            message: 'Account created successfully. Please check your email to verify your account.',
        });
    } catch (err) {
        console.error('[Auth] Register error:', err);
        res.status(500).json({ status: 'error', message: 'Registration failed. Please try again.' });
    }
};

// ─────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────
const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ status: 'error', message: 'Email and password are required.' });
    }

    // Turnstile check removed completely for local development

    try {
        const result = await db.query(
            'SELECT id, email, password_hash, full_name, plan, currency, role, is_active, is_verified FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ status: 'error', message: 'Invalid email or password.' });
        }

        const user = result.rows[0];

        if (!user.is_active) {
            return res.status(403).json({ status: 'error', message: 'Account is disabled. Please contact support.' });
        }
        
        if (user.is_verified === false) { // check explicitly for false
            return res.status(403).json({ status: 'error', message: 'Please verify your email address to log in.' });
        }

        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ status: 'error', message: 'Invalid email or password.' });
        }

        // Update last login timestamp
        await db.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

        // Fetch user's active API keys
        const keysResult = await db.query(
            `SELECT key_value, name, daily_limit, created_at, last_used_at 
             FROM api_keys 
             WHERE user_id = $1 AND is_active = TRUE
             ORDER BY created_at ASC`,
            [user.id]
        );

        res.json({
            status: 'success',
            message: 'Login successful.',
            data: {
                user_id: user.id,
                email: user.email,
                full_name: user.full_name,
                plan: user.plan,
                role: user.role,
                currency: user.currency,
                api_keys: keysResult.rows,
            },
        });
    } catch (err) {
        console.error('[Auth] Login error:', err);
        res.status(500).json({ status: 'error', message: 'Login failed. Please try again.' });
    }
};

// ─────────────────────────────────────────────────────
// GET /api/auth/verify/:token
// ─────────────────────────────────────────────────────
const verifyEmail = async (req, res) => {
    const { token } = req.params;

    try {
        const result = await db.query(
            'SELECT id, email, full_name, plan, currency, is_active FROM users WHERE verification_token = $1',
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Invalid or expired verification token.' });
        }

        const user = result.rows[0];

        // Mark as verified
        await db.query(
            'UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = $1',
            [user.id]
        );

        // Fetch user's active API keys to return payload for auto-login
        const keysResult = await db.query(
            `SELECT key_value, name, daily_limit, created_at, last_used_at 
             FROM api_keys 
             WHERE user_id = $1 AND is_active = TRUE
             ORDER BY created_at ASC`,
            [user.id]
        );

        res.json({
            status: 'success',
            message: 'Email verified successfully.',
            data: {
                user_id: user.id,
                email: user.email,
                full_name: user.full_name,
                plan: user.plan,
                currency: user.currency,
                api_keys: keysResult.rows,
            },
        });
    } catch (err) {
        console.error('[Auth] Verification error:', err);
        res.status(500).json({ status: 'error', message: 'Verification failed. Please try again.' });
    }
};

// ─────────────────────────────────────────────────────
// POST /api/auth/keys/generate  (requires auth middleware)
// ─────────────────────────────────────────────────────
const generateKey = async (req, res) => {
    const { name } = req.body;

    try {
        // Max 5 keys per user
        const countResult = await db.query(
            'SELECT COUNT(*) FROM api_keys WHERE user_id = $1 AND is_active = TRUE',
            [req.userId]
        );
        if (parseInt(countResult.rows[0].count) >= 5) {
            return res.status(400).json({ status: 'error', message: 'Maximum of 5 active API keys allowed per account.' });
        }

        const apiKeyValue = generateApiKey();
        const result = await db.query(
            `INSERT INTO api_keys (user_id, key_value, name) VALUES ($1, $2, $3) RETURNING id, key_value, name, created_at`,
            [req.userId, apiKeyValue, name || 'New Key']
        );

        res.status(201).json({
            status: 'success',
            message: 'New API key generated.',
            data: result.rows[0],
        });
    } catch (err) {
        console.error('[Auth] Generate key error:', err);
        res.status(500).json({ status: 'error', message: 'Failed to generate API key.' });
    }
};

// ─────────────────────────────────────────────────────
// DELETE /api/auth/keys/:keyId  (requires auth middleware)
// ─────────────────────────────────────────────────────
const revokeKey = async (req, res) => {
    const { keyId } = req.params;

    try {
        const result = await db.query(
            `UPDATE api_keys SET is_active = FALSE 
             WHERE id = $1 AND user_id = $2 
             RETURNING id`,
            [keyId, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'API key not found.' });
        }

        res.json({ status: 'success', message: 'API key revoked successfully.' });
    } catch (err) {
        console.error('[Auth] Revoke key error:', err);
        res.status(500).json({ status: 'error', message: 'Failed to revoke API key.' });
    }
};

// ─────────────────────────────────────────────────────
// Update Settings
// ─────────────────────────────────────────────────────
const updateSettings = async (req, res) => {
    const { full_name, alert_usage, alert_updates, is_active } = req.body;
    
    try {
        await db.query(
            `UPDATE users 
             SET full_name = $1, 
                 alert_usage = $2, 
                 alert_updates = $3, 
                 is_active = $4 
             WHERE id = $5`,
            [full_name, alert_usage, alert_updates, is_active, req.userId]
        );
        
        // Return updated user payload (excluding sensitive info)
        const userResult = await db.query(
            `SELECT id, email, full_name, is_active, alert_usage, alert_updates, plan 
             FROM users WHERE id = $1`, 
            [req.userId]
        );
        
        res.json({
            status: 'success',
            message: 'Settings updated successfully.',
            user: userResult.rows[0]
        });
    } catch (err) {
        console.error('[Auth] Settings update error:', err);
        res.status(500).json({ status: 'error', message: 'Failed to update settings.' });
    }
};

// ─────────────────────────────────────────────────────
// GET /api/v1/auth/promos
// ─────────────────────────────────────────────────────
const getActivePromos = async (req, res) => {
    try {
        const result = await db.query(
            "SELECT id, message, type, created_at FROM user_promos WHERE user_id = $1 AND is_active = TRUE ORDER BY created_at DESC",
            [req.userId]
        );
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Failed to fetch promos' });
    }
};

// ─────────────────────────────────────────────────────
// GET /api/v1/auth/plans
// ─────────────────────────────────────────────────────
const getPublicPlans = async (req, res) => {
    try {
        const result = await db.query('SELECT code, name, daily_limit, monthly_limit, price_monthly, price_yearly FROM plans WHERE is_active = TRUE ORDER BY price_monthly ASC');
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Failed to fetch plans' });
    }
};

// GET /api/auth/me
const getMe = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT
                u.id, u.full_name, u.email, u.plan, u.role, u.is_active,
                u.alert_usage, u.alert_updates, u.created_at,
                json_agg(
                    json_build_object(
                        'key_value', ak.key_value,
                        'daily_limit', ak.daily_limit,
                        'is_active', ak.is_active
                    )
                ) FILTER (WHERE ak.id IS NOT NULL) AS api_keys
             FROM users u
             LEFT JOIN api_keys ak
                ON ak.user_id = u.id AND ak.is_active = TRUE
             WHERE u.id = $1
             GROUP BY u.id`,
            [req.userId]
        );
        if (!result.rows.length) {
            return res.status(404).json({ status: 'error', message: 'User not found.' });
        }
        res.json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error('[Auth] getMe error:', err);
        res.status(500).json({ status: 'error', message: 'Failed to fetch user.' });
    }
};

// ─────────────────────────────────────────────────────
// POST /api/auth/forgot-password
// ─────────────────────────────────────────────────────
const forgotPassword = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ status: 'error', message: 'Email is required.' });
    }

    try {
        const userRes = await db.query('SELECT id, email, is_active FROM users WHERE email = $1', [email.toLowerCase()]);
        if (userRes.rows.length === 0) {
            // Always return success even if not found to prevent email enumeration
            return res.json({ status: 'success', message: 'If that email exists, a reset link has been sent.' });
        }

        const user = userRes.rows[0];
        if (!user.is_active) {
            return res.status(403).json({ status: 'error', message: 'Account is suspended.' });
        }

        // Generate a secure random token
        const resetToken = crypto.randomBytes(32).toString('hex');
        // Set expiry for 1 hour from now
        const expires = new Date(Date.now() + 3600000);

        await db.query(
            'UPDATE users SET reset_token = $1, reset_expires = $2 WHERE id = $3',
            [resetToken, expires, user.id]
        );

        await sendPasswordResetEmail(user.email, resetToken);

        res.json({ status: 'success', message: 'If that email exists, a reset link has been sent.' });
    } catch (err) {
        console.error('[Auth] Forgot password error:', err);
        res.status(500).json({ status: 'error', message: 'Internal server error.' });
    }
};

// ─────────────────────────────────────────────────────
// POST /api/auth/reset-password
// ─────────────────────────────────────────────────────
const resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
        return res.status(400).json({ status: 'error', message: 'Token and new password are required.' });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ status: 'error', message: 'Password must be at least 8 characters long.' });
    }

    try {
        // Find user with this token that hasn't expired
        const userRes = await db.query(
            'SELECT id FROM users WHERE reset_token = $1 AND reset_expires > NOW()',
            [token]
        );

        if (userRes.rows.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Invalid or expired reset token.' });
        }

        const userId = userRes.rows[0].id;
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password and clear token
        await db.query(
            'UPDATE users SET password_hash = $1, reset_token = NULL, reset_expires = NULL WHERE id = $2',
            [hashedPassword, userId]
        );

        res.json({ status: 'success', message: 'Password has been successfully reset. You may now log in.' });
    } catch (err) {
        console.error('[Auth] Reset password error:', err);
        res.status(500).json({ status: 'error', message: 'Internal server error.' });
    }
};

module.exports = {
    register,
    login,
    generateKey,
    revokeKey,
    verifyEmail,
    updateSettings,
    getActivePromos,
    getPublicPlans,
    getMe,
    forgotPassword,
    resetPassword
};