require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port:     process.env.DB_PORT || 5432,
});

async function patch() {
    try {
        console.log('Connecting to database...');
        
        // 1. Ensure user_id column exists
        await pool.query(`ALTER TABLE api_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;`);
        
        // 2. Ensure latency_ms exists
        await pool.query(`ALTER TABLE api_logs ADD COLUMN IF NOT EXISTS latency_ms FLOAT DEFAULT 0;`);
        
        // 3. Ensure status_code exists
        await pool.query(`ALTER TABLE api_logs ADD COLUMN IF NOT EXISTS status_code INTEGER DEFAULT 200;`);
        
        // 4. Drop the NOT NULL constraint on method (if it exists from schema.sql)
        await pool.query(`ALTER TABLE api_logs ALTER COLUMN method DROP NOT NULL;`).catch(() => {});
        
        console.log('✅ Database patched successfully! The API logger will now work.');
    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        pool.end();
    }
}

patch();
