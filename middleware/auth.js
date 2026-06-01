const db = require('../config/db');

/**
 * Authentication Middleware
 * Validates the Bearer token (API Key) from the Authorization header.
 * Attaches the user and api_key record to req for use in downstream handlers.
 */
const authenticate = async (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            status: 'error',
            message: 'Missing or invalid Authorization header. Use: Authorization: Bearer <YOUR_API_KEY>',
        });
    }

    const apiKey = authHeader.split(' ')[1];

    if (!apiKey) {
        return res.status(401).json({
            status: 'error',
            message: 'API key is empty.',
        });
    }

    try {
        const result = await db.query(
            `SELECT 
                ak.id AS api_key_id,
                ak.user_id,
                ak.daily_limit,
                ak.is_active AS key_active,
                u.plan,
                u.email,
                u.role,
                u.is_active AS user_active
             FROM api_keys ak
             JOIN users u ON u.id = ak.user_id
             WHERE ak.key_value = $1`,
            [apiKey]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid API key.',
            });
        }

        const keyRecord = result.rows[0];

        if (!keyRecord.key_active) {
            return res.status(403).json({
                status: 'error',
                message: 'This API key has been disabled. Please generate a new key from your dashboard.',
            });
        }

        if (!keyRecord.user_active) {
            return res.status(403).json({
                status: 'error',
                message: 'Your account is inactive. Please contact support.',
            });
        }

        // Attach to request
        req.apiKey = apiKey;
        req.apiKeyId = keyRecord.api_key_id;
        req.userId = keyRecord.user_id;
        req.userPlan = keyRecord.plan;
        req.userRole = keyRecord.role;
        req.dailyLimit = keyRecord.daily_limit;

        // Update last_used_at (fire and forget, don't await)
        db.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [keyRecord.api_key_id]).catch(() => {});

        next();
    } catch (err) {
        console.error('[Auth] Database error:', err);
        res.status(500).json({
            status: 'error',
            message: 'Authentication service error. Please try again.',
        });
    }
};

module.exports = authenticate;
