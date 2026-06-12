const db = require('../config/db');
const redisClient = require('../config/redis');
const { getCount } = require('../middleware/rateLimiter');

const CACHE_TTL = 3600; // 1 hour cache for geo data

// ─────────────────────────────────────────────────────
// Helper: get from Redis cache or DB
// ─────────────────────────────────────────────────────
async function getCached(key, queryFn) {
    try {
        const cached = await redisClient.get(key);
        if (cached) return JSON.parse(cached);
    } catch (_) {}

    const data = await queryFn();

    try {
        await redisClient.setEx(key, CACHE_TTL, JSON.stringify(data));
    } catch (_) {}

    return data;
}

// ─────────────────────────────────────────────────────
// Helper: resolve translated name if locale given
// ─────────────────────────────────────────────────────
function applyTranslation(rows, locale, entityType) {
    if (!locale || locale === 'en') return rows;
    return rows.map(row => ({
        ...row,
        name: row.translated_name || row.name,
        original_name: row.name,
    }));
}

// ─────────────────────────────────────────────────────
// GET /api/v1/countries
// ─────────────────────────────────────────────────────
const getCountries = async (req, res) => {
    const locale = (req.headers['accept-language'] || 'en').split(',')[0].trim().toLowerCase().slice(0, 5);
    const search = req.query.search || '';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(300, Math.max(1, parseInt(req.query.limit) || 250));
    const offset = (page - 1) * limit;

    const cacheKey = `geo:countries:${locale}:${search}:${page}:${limit}`;

    try {
        const data = await getCached(cacheKey, async () => {
            let query, params;

            if (locale !== 'en') {
                query = `
                    SELECT 
                        c.id, c.name, c.iso2, c.iso3, c.phone_code, c.capital,
                        c.currency_code, c.currency_name, c.currency_symbol,
                        c.tld, c.region, c.subregion, c.latitude, c.longitude,
                        c.emoji, c.numeric_code,
                        t.translated_name
                    FROM countries c
                    LEFT JOIN translations t 
                        ON t.entity_type = 'country' AND t.entity_id = c.id AND t.locale = $1
                    WHERE c.is_active = TRUE
                    ${search ? 'AND (LOWER(c.name) LIKE $2 OR LOWER(c.iso2) = $3)' : ''}
                    ORDER BY c.name ASC
                    LIMIT $${search ? 4 : 2} OFFSET $${search ? 5 : 3}
                `;
                params = search
                    ? [locale, `%${search.toLowerCase()}%`, search.toLowerCase(), limit, offset]
                    : [locale, limit, offset];
            } else {
                query = `
                    SELECT 
                        id, name, iso2, iso3, phone_code, capital,
                        currency_code, currency_name, currency_symbol,
                        tld, region, subregion, latitude, longitude,
                        emoji, numeric_code
                    FROM countries
                    WHERE is_active = TRUE
                    ${search ? 'AND (LOWER(name) LIKE $1 OR LOWER(iso2) = $2)' : ''}
                    ORDER BY name ASC
                    LIMIT $${search ? 3 : 1} OFFSET $${search ? 4 : 2}
                `;
                params = search
                    ? [`%${search.toLowerCase()}%`, search.toLowerCase(), limit, offset]
                    : [limit, offset];
            }

            const result = await db.query(query, params);
            return applyTranslation(result.rows, locale, 'country');
        });

        res.json({
            status: 'success',
            locale,
            page,
            limit,
            count: data.length,
            data,
        });
    } catch (err) {
        console.error('[Geo] getCountries error:', err);
        res.status(500).json({ status: 'error', message: 'Failed to fetch countries.' });
    }
};

// ─────────────────────────────────────────────────────
// GET /api/v1/countries/:iso2
// ─────────────────────────────────────────────────────
const getCountry = async (req, res) => {
    const iso2 = req.params.iso2.toUpperCase();
    const locale = (req.headers['accept-language'] || 'en').split(',')[0].trim().toLowerCase().slice(0, 5);
    const cacheKey = `geo:country:${iso2}:${locale}`;

    try {
        const data = await getCached(cacheKey, async () => {
            const result = await db.query(
                `SELECT 
                    c.*,
                    t.translated_name
                 FROM countries c
                 LEFT JOIN translations t 
                     ON t.entity_type = 'country' AND t.entity_id = c.id AND t.locale = $1
                 WHERE c.iso2 = $2 AND c.is_active = TRUE`,
                [locale, iso2]
            );
            if (result.rows.length === 0) return null;
            const row = result.rows[0];
            if (locale !== 'en' && row.translated_name) row.name = row.translated_name;
            return row;
        });

        if (!data) {
            return res.status(404).json({ status: 'error', message: `Country with ISO2 code '${iso2}' not found.` });
        }

        res.json({ status: 'success', locale, data });
    } catch (err) {
        console.error('[Geo] getCountry error:', err);
        res.status(500).json({ status: 'error', message: 'Failed to fetch country.' });
    }
};

// ─────────────────────────────────────────────────────
// GET /api/v1/countries/:iso2/states
// ─────────────────────────────────────────────────────
const getStates = async (req, res) => {
    const iso2 = req.params.iso2.toUpperCase();
    const locale = (req.headers['accept-language'] || 'en').split(',')[0].trim().toLowerCase().slice(0, 5);
    const cacheKey = `geo:states:${iso2}:${locale}`;

    try {
        const data = await getCached(cacheKey, async () => {
            // Validate country exists
            const countryResult = await db.query(
                'SELECT id FROM countries WHERE iso2 = $1 AND is_active = TRUE', [iso2]
            );
            if (countryResult.rows.length === 0) return null;

            const countryId = countryResult.rows[0].id;

            const result = await db.query(
                `SELECT 
                    s.id, s.name, s.state_code, s.country_code,
                    s.latitude, s.longitude,
                    t.translated_name
                 FROM states s
                 LEFT JOIN translations t 
                     ON t.entity_type = 'state' AND t.entity_id = s.id AND t.locale = $1
                 WHERE s.country_id = $2 AND s.is_active = TRUE
                 ORDER BY s.name ASC`,
                [locale, countryId]
            );
            return applyTranslation(result.rows, locale, 'state');
        });

        if (data === null) {
            return res.status(404).json({ status: 'error', message: `Country '${iso2}' not found.` });
        }

        res.json({
            status: 'success',
            locale,
            country_code: iso2,
            count: data.length,
            data,
        });
    } catch (err) {
        console.error('[Geo] getStates error:', err);
        res.status(500).json({ status: 'error', message: 'Failed to fetch states.' });
    }
};

// ─────────────────────────────────────────────────────
// GET /api/v1/countries/:iso2/states/:stateId/cities
// stateId = numeric DB id OR URL-encoded state name (e.g. Tamil%20Nadu)
// ─────────────────────────────────────────────────────
const getCities = async (req, res) => {
    const iso2       = req.params.iso2.toUpperCase();
    const stateParam = decodeURIComponent(req.params.stateCode);
    const locale     = (req.headers['accept-language'] || 'en').split(',')[0].trim().toLowerCase().slice(0, 5);
    const cacheKey   = `geo:cities:${iso2}:${stateParam}:${locale}`;

    try {
        const data = await getCached(cacheKey, async () => {
            const isNumeric = /^\d+$/.test(stateParam);
            const stateResult = await db.query(
                isNumeric
                    ? `SELECT s.id, s.name FROM states s
                       JOIN countries c ON c.id = s.country_id
                       WHERE c.iso2 = $1 AND s.id = $2 AND s.is_active = TRUE`
                    : `SELECT s.id, s.name FROM states s
                       JOIN countries c ON c.id = s.country_id
                       WHERE c.iso2 = $1 AND LOWER(s.name) = LOWER($2) AND s.is_active = TRUE`,
                [iso2, isNumeric ? parseInt(stateParam) : stateParam]
            );
            if (stateResult.rows.length === 0) return null;

            const stateId   = stateResult.rows[0].id;
            const stateName = stateResult.rows[0].name;

            const result = await db.query(
                `SELECT
                    ci.id, ci.name, ci.country_code,
                    ci.latitude, ci.longitude,
                    t.translated_name
                 FROM cities ci
                 LEFT JOIN translations t
                     ON t.entity_type = 'city' AND t.entity_id = ci.id AND t.locale = $1
                 WHERE ci.state_id = $2 AND ci.is_active = TRUE
                 ORDER BY ci.name ASC`,
                [locale, stateId]
            );
            return { rows: applyTranslation(result.rows, locale, 'city'), stateName };
        });

        if (data === null) {
            return res.status(404).json({
                status: 'error',
                message: `State '${stateParam}' not found in country '${iso2}'.`,
                tip: 'Use the state name (e.g. "Tamil Nadu") or numeric id from GET /countries/:iso2/states',
            });
        }

        res.json({
            status:       'success',
            locale,
            country_code: iso2,
            state:        data.stateName || stateParam,
            count:        data.rows.length,
            data:         data.rows,
        });
    } catch (err) {
        console.error('[Geo] getCities error:', err);
        res.status(500).json({ status: 'error', message: 'Failed to fetch cities.' });
    }
};

// ─────────────────────────────────────────────────────
// GET /api/v1/usage  (requires auth middleware)
// ─────────────────────────────────────────────────────
const getUsage = async (req, res) => {
    const apiKey = req.apiKey;
    const plan   = req.userPlan || 'free';
    const now    = new Date();
    const todayKey = `rl:day:${apiKey}:${now.toISOString().slice(0, 10)}`;
    const monthKey = `rl:month:${apiKey}:${now.toISOString().slice(0, 7)}`;

    try {
        const [dayCount, monthCount, statsResult, planResult] = await Promise.all([
            getCount(todayKey, apiKey, 'day', req.userId),
            getCount(monthKey, apiKey, 'month', req.userId),
            db.query(
                `SELECT 
                    ROUND(AVG(latency_ms), 2) as avg_latency,
                    COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
                 FROM (
                     SELECT latency_ms, status_code
                     FROM api_logs 
                     WHERE user_id = $1 AND created_at >= $2
                     ORDER BY created_at DESC
                     LIMIT 1000
                 ) as recent_logs`,
                [req.userId, new Date(new Date().toISOString().slice(0, 7) + '-01').toISOString()]
            ).catch(() => ({ rows: [{ avg_latency: 0, error_count: 0 }] })),
            db.query(
                `SELECT daily_limit, monthly_limit FROM plans WHERE code = $1 AND is_active = TRUE LIMIT 1`,
                [plan]
            ).catch(() => ({ rows: [] }))
        ]);

        const stats = statsResult.rows[0];

        // Use plan DB values; fall back to api_keys.daily_limit then default 100
        const planRow      = planResult.rows[0] || {};
        const dailyLimit   = parseInt(planRow.daily_limit)   || req.dailyLimit || 100;
        const monthlyLimit = parseInt(planRow.monthly_limit) || 3000;

        // Also keep api_keys in sync if drift detected
        if (req.dailyLimit !== dailyLimit) {
            db.query('UPDATE api_keys SET daily_limit = $1 WHERE key_value = $2', [dailyLimit, apiKey]).catch(() => {});
        }

        res.json({
            status: 'success',
            data: {
                plan:            plan,
                daily_limit:     dailyLimit,
                monthly_limit:   monthlyLimit,
                used_today:      parseInt(dayCount)   || 0,
                remaining_today: Math.max(0, dailyLimit - (parseInt(dayCount) || 0)),
                used_this_month: parseInt(monthCount) || 0,
                remaining_month: Math.max(0, monthlyLimit - (parseInt(monthCount) || 0)),
                avg_latency:     parseFloat(stats.avg_latency).toFixed(2),
                error_count:     parseInt(stats.error_count) || 0
            },
        });
    } catch (err) {
        console.error('[Geo] getUsage error:', err);
        res.status(500).json({ status: 'error', message: 'Failed to fetch usage stats.' });
    }
};

// ─────────────────────────────────────────────────────
// GET /api/v1/usage/history
// ─────────────────────────────────────────────────────
const getUsageHistory = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT endpoint, ip_address, created_at, status_code, latency_ms 
             FROM api_logs 
             WHERE api_key = $1 
             ORDER BY created_at DESC 
             LIMIT 50`,
            [req.apiKey]
        ).catch(() => ({ rows: [] }));
        
        res.json({
            status: 'success',
            count: result.rows.length,
            data: result.rows,
        });
    } catch (err) {
        console.error('[Geo] getUsageHistory error:', err);
        res.status(500).json({ status: 'error', message: 'Failed to fetch usage history.' });
    }
};

module.exports = { getCountries, getCountry, getStates, getCities, getUsage, getUsageHistory };
