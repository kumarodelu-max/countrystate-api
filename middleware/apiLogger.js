const db = require('../config/db');

/**
 * API Logger Middleware
 * Logs API requests to the database asynchronously (fire-and-forget).
 * It expects req.userId and req.apiKey to be set by the auth middleware.
 */
const apiLogger = (req, res, next) => {
    // We only log if authentication passed
    if (req.userId && req.apiKey) {
        const start = process.hrtime();
        const endpoint = req.originalUrl || req.url;
        const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;

        res.on('finish', () => {
            const diff = process.hrtime(start);
            const latencyMs = parseFloat((diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2));
            const statusCode = res.statusCode;

            // Fire and forget insertion
            db.query(
                'INSERT INTO api_logs (user_id, api_key, endpoint, ip_address, latency_ms, status_code) VALUES ($1, $2, $3, $4, $5, $6)',
                [req.userId, req.apiKey, endpoint, ipAddress, latencyMs, statusCode]
            ).catch(err => {
                console.error('[API Logger] Error logging request:', err.message);
            });
        });
    }

    next();
};

module.exports = apiLogger;
