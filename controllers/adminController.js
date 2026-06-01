const db     = require('../config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendPromoEmail } = require('../utils/email');

// ─────────────────────────────────────────────────────
// GET /api/admin/users?page=1&limit=15&search=kumar
// ─────────────────────────────────────────────────────
const getUsers = async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 15);
        const search = req.query.search ? `%${req.query.search}%` : null;
        const offset = (page - 1) * limit;

        const whereClause = search
            ? `WHERE (u.full_name ILIKE $3 OR u.email ILIKE $3)`
            : '';
        const params = search ? [limit, offset, search] : [limit, offset];

        const query = `
            SELECT 
                u.id, u.full_name, u.email, u.plan, u.role,
                u.is_active as user_active, u.created_at,
                ak.key_value, ak.daily_limit, ak.is_active as key_active,
                (SELECT COUNT(*) FROM api_logs al WHERE al.api_key = ak.key_value AND al.created_at >= CURRENT_DATE) as used_today
            FROM users u
            LEFT JOIN api_keys ak ON ak.user_id = u.id
            ${whereClause}
            ORDER BY u.created_at DESC
            LIMIT $1 OFFSET $2
        `;

        const countQuery = search
            ? `SELECT COUNT(*) FROM users u ${whereClause}`
            : `SELECT COUNT(*) FROM users u`;
        const countParams = search ? [search] : [];

        const [result, countResult] = await Promise.all([
            db.query(query, params),
            db.query(countQuery.replace('$3','$1'), countParams)
        ]);

        const total = parseInt(countResult.rows[0].count);
        res.json({
            status: 'success',
            data: result.rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    } catch (err) {
        console.error('[Admin] getUsers error:', err);
        res.status(500).json({ status: 'error', message: 'Failed to fetch users.' });
    }
};

// ─────────────────────────────────────────────────────
// POST /api/admin/users
// ─────────────────────────────────────────────────────
const createUser = async (req, res) => {
    const { full_name, email, password, plan, role, daily_limit } = req.body;
    if (!email || !password || !full_name) {
        return res.status(400).json({ status: 'error', message: 'Name, email, and password are required.' });
    }
    try {
        await db.query('BEGIN');

        // Check duplicate
        const exists = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (exists.rows.length > 0) {
            await db.query('ROLLBACK');
            return res.status(409).json({ status: 'error', message: 'A user with this email already exists.' });
        }

        const hashedPw = await bcrypt.hash(password, 12);
        const selectedPlan = plan || 'free';
        const selectedRole = role || 'user';

        // Get daily limit from plan table if not provided
        let dailyLimitVal = daily_limit;
        if (!dailyLimitVal) {
            const planRow = await db.query('SELECT daily_limit FROM plans WHERE code = $1', [selectedPlan]);
            dailyLimitVal = planRow.rows[0]?.daily_limit || 100;
        }

        const userRes = await db.query(
            `INSERT INTO users (full_name, email, password_hash, plan, role, is_active, is_verified)
             VALUES ($1, $2, $3, $4, $5, TRUE, TRUE) RETURNING id`,
            [full_name, email, hashedPw, selectedPlan, selectedRole]
        );
        const userId = userRes.rows[0].id;

        // Generate API key
        const apiKey = 'cs_' + crypto.randomBytes(24).toString('hex');
        await db.query(
            `INSERT INTO api_keys (user_id, key_value, daily_limit, is_active)
             VALUES ($1, $2, $3, TRUE)`,
            [userId, apiKey, dailyLimitVal]
        );

        await db.query('COMMIT');
        res.status(201).json({ status: 'success', message: 'User created successfully.', data: { id: userId, email, plan: selectedPlan, api_key: apiKey } });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('[Admin] createUser error:', err);
        res.status(500).json({ status: 'error', message: 'Failed to create user.' });
    }
};

// ─────────────────────────────────────────────────────
// PUT /api/v1/admin/users/:userId/limit
// ─────────────────────────────────────────────────────
const updateUserLimit = async (req, res) => {
    const { userId } = req.params;
    const { plan, daily_limit, is_active, role } = req.body;
    const adminId = req.user ? req.user.id : null; // From auth middleware

    try {
        await db.query('BEGIN');

        // Fetch current values
        const userRes = await db.query('SELECT plan FROM users WHERE id = $1', [userId]);
        const keyRes = await db.query('SELECT daily_limit FROM api_keys WHERE user_id = $1', [userId]);
        
        const oldPlan = userRes.rows[0]?.plan || 'free';
        const oldLimit = keyRes.rows[0]?.daily_limit || 100;
        
        let planChanged = (plan && plan !== oldPlan);
        let limitChanged = (daily_limit !== undefined && parseInt(daily_limit) !== parseInt(oldLimit));

        // Update user plan, active status, and role
        if (plan || is_active !== undefined || role) {
            await db.query(
                `UPDATE users 
                 SET plan = COALESCE($1, plan), 
                     is_active = COALESCE($2, is_active),
                     role = COALESCE($3, role)
                 WHERE id = $4`,
                [plan, is_active, role, userId]
            );
        }

        // Update their main API key limit
        if (daily_limit !== undefined) {
            await db.query(
                `UPDATE api_keys 
                 SET daily_limit = $1 
                 WHERE user_id = $2`,
                [daily_limit, userId]
            );
        }

        // Log history and send automated notification if plan/limit changed
        if (planChanged || limitChanged) {
            const finalPlan = plan || oldPlan;
            const finalLimit = daily_limit !== undefined ? daily_limit : oldLimit;
            
            // Log to plan_history
            await db.query(
                `INSERT INTO plan_history (user_id, old_plan, new_plan, old_limit, new_limit, source, changed_by_admin_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [userId, oldPlan, finalPlan, oldLimit, finalLimit, 'admin_manual', adminId]
            );

            // Automated Notification
            const message = `Your account has been upgraded to the ${finalPlan.charAt(0).toUpperCase() + finalPlan.slice(1)} plan (${finalLimit} requests/day).`;
            
            // Deactivate old promos for this user
            await db.query('UPDATE user_promos SET is_active = FALSE WHERE user_id = $1', [userId]);
            
            // Insert automated promo
            await db.query(
                'INSERT INTO user_promos (user_id, message, type, is_active) VALUES ($1, $2, $3, TRUE)',
                [userId, message, 'promo']
            );
        }

        await db.query('COMMIT');
        res.json({ status: 'success', message: 'User updated successfully.' });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('[Admin] updateUserLimit error:', err);
        res.status(500).json({ status: 'error', message: 'Failed to update user.' });
    }
};

// ─────────────────────────────────────────────────────
// Targeted Promos API
// ─────────────────────────────────────────────────────
const createPromo = async (req, res) => {
    const { userId } = req.params;
    const { message, type } = req.body;
    try {
        // Fetch user email and alert preference
        const userRes = await db.query('SELECT email, alert_updates FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'User not found.' });
        }
        
        const user = userRes.rows[0];

        // Deactivate old promos for this user
        await db.query('UPDATE user_promos SET is_active = FALSE WHERE user_id = $1', [userId]);
        
        // Insert new promo
        await db.query(
            'INSERT INTO user_promos (user_id, message, type, is_active) VALUES ($1, $2, $3, TRUE)',
            [userId, message, type || 'promo']
        );

        // Send email if user opted in
        if (user.alert_updates) {
            await sendPromoEmail(user.email, message);
        }

        res.json({ status: 'success', message: 'Promo assigned to user.' });
    } catch (err) {
        console.error('[Admin] createPromo error:', err);
        res.status(500).json({ status: 'error', message: 'Failed to assign promo.' });
    }
};

// ─────────────────────────────────────────────────────
// Plans API
// ─────────────────────────────────────────────────────
const getPlans = async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM plans ORDER BY price_monthly ASC');
        res.json({ status: 'success', data: result.rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Failed to fetch plans.' });
    }
};

const updatePlan = async (req, res) => {
    const { planId } = req.params;
    const { daily_limit, monthly_limit, price_monthly, price_yearly, is_active } = req.body;
    try {
        // 1. Update the plans table
        const planResult = await db.query(
            `UPDATE plans
             SET daily_limit    = COALESCE($1, daily_limit),
                 monthly_limit  = COALESCE($2, monthly_limit),
                 price_monthly  = COALESCE($3, price_monthly),
                 price_yearly   = COALESCE($4, price_yearly),
                 is_active      = COALESCE($5, is_active),
                 updated_at     = CURRENT_TIMESTAMP
             WHERE id::text = $6 OR code = $6
             RETURNING code, daily_limit`,
            [daily_limit, monthly_limit, price_monthly, price_yearly, is_active, planId]
        );
        if (planResult.rowCount === 0) {
            return res.status(404).json({ status: 'error', message: 'Plan not found.' });
        }

        // 2. Propagate new daily_limit to ALL api_keys for users on this plan
        const updatedPlan = planResult.rows[0];
        const syncResult = await db.query(
            `UPDATE api_keys
             SET daily_limit = $1, updated_at = CURRENT_TIMESTAMP
             WHERE user_id IN (SELECT id FROM users WHERE plan = $2)`,
            [updatedPlan.daily_limit, updatedPlan.code]
        );

        res.json({
            status:  'success',
            message: `Plan updated. ${syncResult.rowCount} user key(s) synced to new daily limit of ${updatedPlan.daily_limit}.`
        });
    } catch (err) {
        console.error('[Admin] updatePlan error:', err.message);
        res.status(500).json({ status: 'error', message: 'Failed to update plan: ' + err.message });
    }
};

const createPlan = async (req, res) => {
    const { code, name, daily_limit, monthly_limit, price_monthly, price_yearly } = req.body;
    if (!code || !name || !daily_limit) {
        return res.status(400).json({ status: 'error', message: 'Code, name, and daily_limit are required.' });
    }
    try {
        await db.query(
            `INSERT INTO plans (code, name, daily_limit, monthly_limit, price_monthly, price_yearly, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
            [code.toLowerCase().trim(), name, daily_limit, monthly_limit || 0, price_monthly || 0, price_yearly || 0]
        );
        res.status(201).json({ status: 'success', message: 'Plan created successfully.' });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ status: 'error', message: 'A plan with this code already exists.' });
        }
        res.status(500).json({ status: 'error', message: 'Failed to create plan: ' + err.message });
    }
};

// GET /api/admin/users/:userId/logs?period=7d|30d|90d|365d|all&page=1
const getUserLogs = async (req, res) => {
    const { userId } = req.params;
    const period  = req.query.period || '30d';
    const page    = Math.max(1, parseInt(req.query.page)  || 1);
    const limit   = Math.min(90, parseInt(req.query.limit) || 30);
    const offset  = (page - 1) * limit;
    const imap    = { '7d':'7 days','30d':'30 days','90d':'90 days','365d':'365 days','all':'3650 days' };
    const interval = imap[period] || '30 days';
    try {
        const kr = await db.query(
            "SELECT ak.key_value, ak.daily_limit, u.full_name, u.email, u.plan FROM users u LEFT JOIN api_keys ak ON ak.user_id = u.id AND ak.is_active = TRUE WHERE u.id = $1 LIMIT 1",
            [userId]
        );
        if (!kr.rows.length || !kr.rows[0].key_value) {
            return res.json({ status:'success', data:[], user:null, summary:{total_calls_lifetime:0}, pagination:{total:0,totalPages:0,page:1,limit} });
        }
        const { key_value, daily_limit, full_name, email, plan } = kr.rows[0];
        const [logs, cnt, lt] = await Promise.all([
            db.query(
                "SELECT DATE(created_at) AS day, COUNT(*)::int AS calls FROM api_logs WHERE api_key = $1 AND created_at >= NOW() - INTERVAL '" + interval + "' GROUP BY DATE(created_at) ORDER BY DATE(created_at) DESC LIMIT $2 OFFSET $3",
                [key_value, limit, offset]
            ),
            db.query(
                "SELECT COUNT(DISTINCT DATE(created_at))::int AS total FROM api_logs WHERE api_key = $1 AND created_at >= NOW() - INTERVAL '" + interval + "'",
                [key_value]
            ),
            db.query(
                "SELECT COUNT(*)::int AS total, MIN(created_at) AS first_call, MAX(created_at) AS last_call FROM api_logs WHERE api_key = $1",
                [key_value]
            )
        ]);
        const total = parseInt(cnt.rows[0].total);
        res.json({
            status: 'success',
            user: { full_name, email, plan, daily_limit },
            summary: { total_calls_lifetime: lt.rows[0].total || 0, first_call: lt.rows[0].first_call, last_call: lt.rows[0].last_call },
            data: logs.rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    } catch (err) {
        console.error('[Admin] getUserLogs error:', err.message);
        res.status(500).json({ status:'error', message:'Failed to fetch logs: '+err.message });
    }
};

module.exports = {
    getUsers, createUser, updateUserLimit, createPromo,
    getPlans, createPlan, updatePlan, getUserLogs
};
