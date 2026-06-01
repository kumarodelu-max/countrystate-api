require('dotenv').config();
const db = require('./config/db');

async function alterTable() {
    try {
        await db.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_usage BOOLEAN DEFAULT true;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_updates BOOLEAN DEFAULT true;
        `);
        console.log('Successfully altered users table.');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit(0);
    }
}

alterTable();
