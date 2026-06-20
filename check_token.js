require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});

async function checkToken() {
    try {
        const res = await pool.query('SELECT ak.id, ak.user_id, ak.key_value, ak.is_active as key_active, u.is_active as user_active FROM api_keys ak JOIN users u ON u.id = ak.user_id WHERE ak.key_value = $1', ['cs_cceef13c266294f34c00d79e16999d84a09c6b374e3752418f7df740']);
        console.log("Token Query Result:", res.rows);
        
        const logs = await pool.query('SELECT endpoint, status_code, ip_address FROM api_logs ORDER BY created_at DESC LIMIT 5');
        console.log("Recent Logs:", logs.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
checkToken();
