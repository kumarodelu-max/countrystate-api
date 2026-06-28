const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
});

async function run() {
    try {
        await client.connect();
        console.log('Adding Razorpay columns to users table...');
        await client.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS razorpay_customer_id VARCHAR(255),
            ADD COLUMN IF NOT EXISTS razorpay_subscription_id VARCHAR(255);
        `);
        
        console.log('Adding Razorpay columns to payments table...');
        await client.query(`
            ALTER TABLE payments 
            ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(255) UNIQUE,
            ADD COLUMN IF NOT EXISTS razorpay_subscription_id VARCHAR(255),
            ADD COLUMN IF NOT EXISTS razorpay_signature VARCHAR(255);
        `);
        
        console.log('Database updated successfully for Razorpay!');
    } catch (e) {
        console.error('Error updating DB:', e);
    } finally {
        await client.end();
    }
}

run();
