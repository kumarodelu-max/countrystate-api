require('dotenv').config();
const db = require('./config/db');

async function check() {
    try {
        const res = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users';
        `);
        console.log(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
check();
