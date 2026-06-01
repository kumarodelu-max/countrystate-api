/**
 * City-only seed script
 * Run: node config/seed_cities.js
 * Downloads and inserts all cities using the correct dataset structure
 */
require('dotenv').config();
const { Pool } = require('pg');
const https = require('https');

const pool = new Pool({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port:     process.env.DB_PORT,
});

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'CountryStateSeeder/1.0' } }, res => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return fetchJson(res.headers.location).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => { data += chunk; process.stdout.write('.'); });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('Failed to parse JSON: ' + e.message)); }
            });
        }).on('error', reject);
    });
}

async function main() {
    console.log('🏙️  City Seed Starting...');
    console.log('━'.repeat(50));

    const client = await pool.connect();
    try {
        // Check current city count
        const { rows: currentCount } = await client.query('SELECT COUNT(*) FROM cities');
        console.log(`   Current city count: ${parseInt(currentCount[0].count).toLocaleString()}`);
        // Always proceed to re-seed

        console.log('\n⬇️  Downloading countries+states+cities dataset...\n');
        const countries = await fetchJson(
            'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries%2Bstates%2Bcities.json'
        );

        // Inspect structure from first country that has states with cities
        for (const c of countries) {
            if (c.states && c.states.length > 0) {
                const s = c.states[0];
                console.log(`\nSample country: ${c.name}, iso2: ${c.iso2}`);
                console.log(`Sample state: ${s.name}, code: ${s.state_code}`);
                if (s.cities && s.cities.length > 0) {
                    console.log(`Sample city: ${JSON.stringify(s.cities[0])}`);
                    break;
                } else {
                    console.log('State has no cities array or empty. Checking next...');
                }
            }
        }

        // Build state lookup: countryIso2 + LOWER(state name) -> state db id
        const { rows: stateRows } = await client.query('SELECT id, name, state_code, country_code FROM states');
        const stateMap = {};
        stateRows.forEach(r => {
            // Key by name (primary match)
            const nameKey = `${r.country_code}__name__${r.name.toLowerCase().trim()}`;
            stateMap[nameKey] = r.id;
            // Also key by state_code if present
            if (r.state_code) {
                const codeKey = `${r.country_code}__code__${r.state_code.toLowerCase()}`;
                stateMap[codeKey] = r.id;
            }
        });

        const { rows: countryRows } = await client.query('SELECT id, iso2 FROM countries');
        const countryMap = {};
        countryRows.forEach(r => { countryMap[r.iso2] = r.id; });

        console.log(`\n   State map has ${Object.keys(stateMap).length} entries`);
        console.log(`   Country map has ${Object.keys(countryMap).length} entries`);

        let total = 0;
        let batchValues = [];
        const BATCH = 500;

        await client.query('BEGIN');

        for (const country of countries) {
            const countryId = countryMap[country.iso2];
            if (!countryId || !country.states) continue;

            for (const state of country.states) {
                // cities may be directly on state
                const cities = state.cities || [];
                if (cities.length === 0) continue;

                const nameKey = `${country.iso2}__name__${state.name.toLowerCase().trim()}`;
                const codeKey = state.state_code ? `${country.iso2}__code__${state.state_code.toLowerCase()}` : null;
                const stateId = stateMap[nameKey] || (codeKey ? stateMap[codeKey] : null);
                if (!stateId) continue;

                for (const city of cities) {
                    batchValues.push([
                        city.name,
                        stateId,
                        state.state_code || null,
                        countryId,
                        country.iso2,
                        city.latitude  ? parseFloat(city.latitude)  : null,
                        city.longitude ? parseFloat(city.longitude) : null,
                    ]);

                    if (batchValues.length >= BATCH) {
                        await insertBatch(client, batchValues);
                        total += batchValues.length;
                        batchValues = [];
                        process.stdout.write(`\r   ${total.toLocaleString()} cities inserted...`);
                    }
                }
            }
        }

        // Insert remaining
        if (batchValues.length > 0) {
            await insertBatch(client, batchValues);
            total += batchValues.length;
        }

        await client.query('COMMIT');

        console.log(`\n✅ ${total.toLocaleString()} cities inserted successfully!`);
        console.log('\n━'.repeat(50));
        console.log('🎉 Done! Run npm run dev to start the server.');

    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('\n❌ Failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

async function insertBatch(client, rows) {
    const placeholders = rows.map((_, i) =>
        `($${i*7+1},$${i*7+2},$${i*7+3},$${i*7+4},$${i*7+5},$${i*7+6},$${i*7+7})`
    ).join(',');
    const flat = rows.flat();
    await client.query(
        `INSERT INTO cities (name, state_id, state_code, country_id, country_code, latitude, longitude)
         VALUES ${placeholders} ON CONFLICT DO NOTHING`,
        flat
    );
}

main();
