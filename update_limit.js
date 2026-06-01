require('dotenv').config();
const db = require('./config/db');

async function updateLimit() {
    try {
        await db.query("UPDATE api_keys SET daily_limit = 10 WHERE key_value = 'cs_d2381063aeb00d6c62063ff01bee4a7ea0abf47ec26939c0b1cb4c09'");
        console.log('Successfully updated daily_limit to 10 for your API key.');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit(0);
    }
}

updateLimit();
