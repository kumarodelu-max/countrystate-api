require('dotenv').config();
const db = require('./config/db');

async function alterTable() {
    try {
        await db.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
            ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
            ADD COLUMN IF NOT EXISTS plan_starts_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP WITH TIME ZONE;
        `);
        console.log("Successfully added stripe and plan tracking columns to 'users' table.");
    } catch (e) {
        console.error('Error altering table:', e);
    } finally {
        process.exit(0);
    }
}
alterTable();
