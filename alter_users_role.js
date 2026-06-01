require('dotenv').config();
const db = require('./config/db');

async function alterTable() {
    try {
        await db.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';
        `);
        // For development, make existing users admins so the client can test it easily
        await db.query(`
            UPDATE users SET role = 'admin';
        `);
        console.log('Successfully added role column and made existing users admins.');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit(0);
    }
}

alterTable();
