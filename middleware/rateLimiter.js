const rateLimit = require('express-rate-limit');
const db = require('../config/db');

/**
 * Rate Limiter Middleware
 *
 * Daily & monthly limits are read LIVE from the `plans` table on every
 * request so admin changes take effect immediately without a restart.
 *
 * Development (Windows): uses in-memory Map (resets on server restart)
 * Production (Linux):    uses Redis for persistent, distributed rate limiting
 */

// ─── In-Memory Store ──────────────────────────────────────────
const memoryStore = new Map();

function getStartOfPeriod(type) {
    const now = new Date();
    if (type === 'day') return new Date(now.toISOString().slice(0, 10)).toISOString();
    return new Date(now.toISOString().slice(0, 7) + '-01').toISOString();
}

async function memGet(key, apiKey, type, userId) {
    const entry = memoryStore.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
        if (userId && type) {
            try {
                const res = await db.query(
                    `SELECT COUNT(*) FROM api_logs WHERE user_id = $1 AND created_at >= $2`,
                    [userId, getStartOfPeriod(type)]
                );
                const count = parseInt(res.rows[0].count) || 0;
                memoryStore.set(key, { count, expiresAt: Date.now() + 60000 });
                return count;
            } catch (e) { return 0; }
        }
        return 0;
    }
    return entry.count;
}

async function memIncr(key, ttlSeconds, apiKey, type, userId) {
    let entry = memoryStore.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
        if (userId && type) {
            try {
                const res = await db.query(
                    `SELECT COUNT(*) FROM api_logs WHERE user_id = $1 AND created_at >= $2`,
                    [userId, getStartOfPeriod(type)]
                );
                const count = parseInt(res.rows[0].count) || 0;
                memoryStore.set(key, { count: count + 1, expiresAt: Date.now() + ttlSeconds * 1000 });
                return count + 1;
            } catch (e) { }
        }
        memoryStore.set(key, { count: 1, expiresAt: Date.now() + ttlSeconds * 1000 });
        return 1;
    }
    entry.count++;
    return entry.count;
}

// ─── Redis Store (production) ─────────────────────────────────
let redisClient = null;
if (process.env.REDIS_ENABLED === 'true') {
    try {
        const Redis = require('ioredis');
        redisClient = new Redis({
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: parseInt(process.env.REDIS_PORT) || 6379,
            lazyConnect: true,
            retryStrategy: (times) => Math.min(times * 100, 5000),
        });
        redisClient.on('connect', () => console.log('[Redis] Connected'));
        redisClient.on('error',   (e) => console.error('[Redis] Error:', e.message));
    } catch (e) {
        console.warn('[RateLimit] ioredis not available, using memory store');
        redisClient = null;
    }
}

async function increment(key, ttlSeconds, apiKey, type, userId) {
    if (redisClient) {
        const count = await redisClient.incr(key);
        if (count === 1) await redisClient.expire(key, ttlSeconds);
        return count;
    }
    return memIncr(key, ttlSeconds, apiKey, type, userId);
}

async function getCount(key, apiKey, type, userId) {
    if (redisClient) {
        const val = await redisClient.get(key);
        return parseInt(val) || 0;
    }
    return memGet(key, apiKey, type, userId);
}

// ─── Fetch plan limits LIVE from DB ───────────────────────────
async function getPlanLimits(planCode) {
    try {
        const result = await db.query(
            `SELECT daily_limit, monthly_limit FROM plans WHERE code = $1 AND is_active = TRUE LIMIT 1`,
            [planCode]
        );
        if (result.rows.length) {
            return {
                daily:   parseInt(result.rows[0].daily_limit)   || 100,
                monthly: parseInt(result.rows[0].monthly_limit) || 3000,
            };
        }
    } catch (e) {
        console.error('[RateLimit] getPlanLimits error:', e.message);
    }
    // Fallback defaults
    return { daily: 100, monthly: 3000 };
}

// ─── Middleware ───────────────────────────────────────────────
const rateLimiter = async (req, res, next) => {
    const apiKey  = req.apiKey;
    const plan    = req.userPlan || 'free';
    const now     = new Date();
    const todayKey  = `rl:day:${apiKey}:${now.toISOString().slice(0, 10)}`;
    const monthKey  = `rl:month:${apiKey}:${now.toISOString().slice(0, 7)}`;

    try {
        // Always read limits from DB (live) — this ensures plan changes take effect immediately
        const planLimits = await getPlanLimits(plan);

        // api_keys.daily_limit overrides plan default (for per-user overrides)
        const dailyLimit   = req.dailyLimit || planLimits.daily;
        const monthlyLimit = planLimits.monthly;

        const [dayCount, monthCount] = await Promise.all([
            increment(todayKey,  86400,   apiKey, 'day', req.userId),
            increment(monthKey,  2678400, apiKey, 'month', req.userId),
        ]);

        // ── Daily limit check ──────────────────────────────────
        if (dayCount > dailyLimit) {
            return res.status(429).json({
                status:      'error',
                code:        'DAILY_LIMIT_EXCEEDED',
                message:     `Daily limit of ${dailyLimit} API calls reached. Resets at midnight UTC.`,
                limit:       dailyLimit,
                used_today:  dayCount - 1,
                resets_at:   getNextMidnightUTC(),
                upgrade_url: 'https://countrystate.in/pricing',
            });
        }

        // ── Monthly limit check ────────────────────────────────
        if (monthCount > monthlyLimit) {
            return res.status(429).json({
                status:          'error',
                code:            'MONTHLY_LIMIT_EXCEEDED',
                message:         `Monthly limit of ${monthlyLimit} API calls reached. Resets on the 1st.`,
                limit:           monthlyLimit,
                used_this_month: monthCount - 1,
                resets_at:       getFirstDayOfNextMonthUTC(),
                upgrade_url:     'https://countrystate.in/pricing',
            });
        }

        // ── Rate-limit response headers ────────────────────────
        res.set({
            'X-RateLimit-Limit-Day':       dailyLimit,
            'X-RateLimit-Remaining-Day':   Math.max(0, dailyLimit - dayCount),
            'X-RateLimit-Used-Day':        dayCount,
            'X-RateLimit-Limit-Month':     monthlyLimit,
            'X-RateLimit-Remaining-Month': Math.max(0, monthlyLimit - monthCount),
            'X-RateLimit-Used-Month':      monthCount,
            'X-RateLimit-Reset-Day':       getNextMidnightUTC(),
            'X-RateLimit-Store':           redisClient ? 'redis' : 'memory',
        });

        next();
    } catch (err) {
        console.error('[RateLimit] Error:', err.message);
        next(); // Fail open — never block on rate limiter error
    }
};

function getNextMidnightUTC() {
    const d = new Date();
    d.setUTCHours(24, 0, 0, 0);
    return d.toISOString();
}

function getFirstDayOfNextMonthUTC() {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() + 1, 1);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
}

module.exports = { rateLimiter, getCount };
