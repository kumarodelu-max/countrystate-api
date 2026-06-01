/**
 * Redis client — only used when REDIS_ENABLED=true in .env
 *
 * Windows dev  → REDIS_ENABLED=false  (use memory store in rateLimiter)
 * Linux server → REDIS_ENABLED=true   (use Redis for production rate limiting)
 */
module.exports = null; // Redis is managed directly inside rateLimiter.js
