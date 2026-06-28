require('dotenv').config();
const db = require('./config/db');

async function createTable() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                stripe_session_id VARCHAR(255) UNIQUE NOT NULL,
                stripe_customer_id VARCHAR(255),
                plan_code VARCHAR(100) NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                currency VARCHAR(10) NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Successfully created 'payments' table.");
    } catch (e) {
        console.error('Error creating table:', e);
    } finally {
        process.exit(0);
    }
}
createTable();
