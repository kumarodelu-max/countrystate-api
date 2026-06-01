require('dotenv').config();
const db = require('./config/db');

async function alterTable() {
    try {
        await db.query(`
            ALTER TABLE api_logs ADD COLUMN IF NOT EXISTS latency_ms FLOAT DEFAULT 0;
            ALTER TABLE api_logs ADD COLUMN IF NOT EXISTS status_code INTEGER DEFAULT 200;
        `);
        console.log('Successfully altered api_logs table.');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit(0);
    }
}

alterTable();
