require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function runLocalUpdates() {
    try {
        console.log('Connecting to local database...');
        const sql = fs.readFileSync('update_global_states.sql', 'utf8');
        
        console.log('Running 4900+ updates. This might take a few seconds...');
        await pool.query(sql);
        
        console.log('Successfully updated all global state codes in your local database!');
    } catch (err) {
        console.error('Error running updates:', err.message);
    } finally {
        await pool.end();
    }
}

runLocalUpdates();
