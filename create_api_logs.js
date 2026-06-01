require('dotenv').config();
const db = require('./config/db');

async function createTable() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS api_logs (
                id SERIAL PRIMARY KEY,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                api_key VARCHAR(255) NOT NULL,
                endpoint VARCHAR(255) NOT NULL,
                ip_address VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_api_logs_user_id ON api_logs(user_id);
            CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at);
        `);
        console.log('Successfully created api_logs table.');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit(0);
    }
}

createTable();
