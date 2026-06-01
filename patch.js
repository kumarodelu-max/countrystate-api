require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
});

async function patch() {
    try {
        console.log('Applying database patches...');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS plans (
                id SERIAL PRIMARY KEY, code VARCHAR(50) UNIQUE NOT NULL, name VARCHAR(100) NOT NULL, 
                daily_limit INT NOT NULL DEFAULT 100, monthly_limit INT NOT NULL DEFAULT 0, 
                price_monthly DECIMAL(10, 2) DEFAULT 0.00, price_yearly DECIMAL(10, 2) DEFAULT 0.00, 
                is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('✅ Created plans table');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS plan_history (
                id SERIAL PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, 
                old_plan VARCHAR(50), new_plan VARCHAR(50), old_limit INT, new_limit INT, 
                source VARCHAR(50) DEFAULT 'admin_manual', changed_by_admin_id UUID REFERENCES users(id) ON DELETE SET NULL, 
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('✅ Created plan_history table');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_promos (
                id SERIAL PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, 
                message TEXT NOT NULL, type VARCHAR(50) DEFAULT 'promo', is_active BOOLEAN DEFAULT TRUE, 
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('✅ Created user_promos table');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS api_logs (
                id BIGSERIAL PRIMARY KEY, api_key VARCHAR(64) NOT NULL, endpoint VARCHAR(255) NOT NULL, 
                method VARCHAR(10) NOT NULL, ip_address VARCHAR(45), status_code INT, response_time INT, 
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('✅ Created api_logs table');

        console.log('🎉 All patches applied successfully!');
    } catch (err) {
        console.error('❌ Patch failed:', err.message);
    } finally {
        pool.end();
    }
}

patch();
