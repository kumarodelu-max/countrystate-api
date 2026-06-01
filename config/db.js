const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    max: 20,                  // max connections in pool
    idleTimeoutMillis: 30000, // close idle connections after 30s
    connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
    console.log('[DB] Connected to PostgreSQL');
});

pool.on('error', (err) => {
    console.error('[DB] Unexpected error on idle client', err);
    process.exit(-1);
});

module.exports = pool;
