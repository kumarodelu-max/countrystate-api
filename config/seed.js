/**
 * Database Setup & Seed Script
 * Run: node config/seed.js
 *
 * Downloads all countries, states and cities from:
 * https://github.com/dr5hn/countries-states-cities-database
 */
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const https = require('https');

const pool = new Pool({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port:     process.env.DB_PORT,
});

// ─── Helpers ──────────────────────────────────────────────────
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'CountryStateSeeder/1.0' } }, res => {
            // Handle redirects
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

async function runSchema(client) {
    console.log('\n📋 Creating tables...');
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(sql);
    console.log('✅ Tables ready.');
}

async function seedCountries(client, countries) {
    console.log(`\n🌍 Seeding ${countries.length} countries...`);
    for (const c of countries) {
        await client.query(
            `INSERT INTO countries
                (name, iso2, iso3, numeric_code, phone_code, capital,
                 currency_code, currency_name, currency_symbol,
                 tld, region, subregion, latitude, longitude, emoji, emoji_unicode)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
             ON CONFLICT (iso2) DO NOTHING`,
            [
                c.name, c.iso2, c.iso3,
                c.numeric_code  || null,
                c.phone_code    || null,
                c.capital       || null,
                c.currency      || null,
                c.currency_name || null,
                c.currency_symbol || null,
                c.tld           || null,
                c.region        || null,
                c.subregion     || null,
                c.latitude      ? parseFloat(c.latitude)  : null,
                c.longitude     ? parseFloat(c.longitude) : null,
                c.emoji         || null,
                c.emoji_u       || null,
            ]
        );
    }
    console.log(`✅ ${countries.length} countries inserted.`);
}

async function seedStates(client, countries) {
    console.log('\n🗺️  Seeding states/provinces...');
    let total = 0;
    // Build a country iso2 -> db id map
    const { rows } = await client.query('SELECT id, iso2 FROM countries');
    const countryMap = {};
    rows.forEach(r => { countryMap[r.iso2] = r.id; });

    for (const country of countries) {
        if (!country.states || country.states.length === 0) continue;
        const countryId = countryMap[country.iso2];
        if (!countryId) continue;

        for (const s of country.states) {
            await client.query(
                `INSERT INTO states (name, state_code, country_id, country_code, latitude, longitude)
                 VALUES ($1,$2,$3,$4,$5,$6)
                 ON CONFLICT DO NOTHING`,
                [
                    s.name,
                    s.state_code || null,
                    countryId,
                    country.iso2,
                    s.latitude  ? parseFloat(s.latitude)  : null,
                    s.longitude ? parseFloat(s.longitude) : null,
                ]
            );
            total++;
        }
    }
    console.log(`✅ ${total} states inserted.`);
}

async function seedCities(client, countries) {
    console.log('\n🏙️  Seeding cities (this may take a few minutes)...');
    let total = 0;

    // Build state lookup: countryIso2 + stateCode -> state db id
    const { rows: stateRows } = await client.query('SELECT id, state_code, country_code FROM states');
    const stateMap = {};
    stateRows.forEach(r => {
        const key = `${r.country_code}__${r.state_code}`;
        stateMap[key] = r.id;
    });

    const { rows: countryRows } = await client.query('SELECT id, iso2 FROM countries');
    const countryMap = {};
    countryRows.forEach(r => { countryMap[r.iso2] = r.id; });

    for (const country of countries) {
        if (!country.states) continue;
        const countryId = countryMap[country.iso2];
        if (!countryId) continue;

        for (const state of country.states) {
            if (!state.cities || state.cities.length === 0) continue;
            const stateKey = `${country.iso2}__${state.state_code}`;
            const stateId = stateMap[stateKey];
            if (!stateId) continue;

            for (const city of state.cities) {
                await client.query(
                    `INSERT INTO cities (name, state_id, state_code, country_id, country_code, latitude, longitude)
                     VALUES ($1,$2,$3,$4,$5,$6,$7)
                     ON CONFLICT DO NOTHING`,
                    [
                        city.name,
                        stateId,
                        state.state_code || null,
                        countryId,
                        country.iso2,
                        city.latitude  ? parseFloat(city.latitude)  : null,
                        city.longitude ? parseFloat(city.longitude) : null,
                    ]
                );
                total++;
            }
        }
        if (total % 5000 === 0 && total > 0) {
            process.stdout.write(`\r   ${total.toLocaleString()} cities...`);
        }
    }
    console.log(`\n✅ ${total.toLocaleString()} cities inserted.`);
}

// ─── Main ──────────────────────────────────────────────────────
async function main() {
    console.log('🚀 CountryState Database Seed Starting...');
    console.log('━'.repeat(50));

    const client = await pool.connect();
    try {
        await runSchema(client);

        // Check if already seeded
        const { rows } = await client.query('SELECT COUNT(*) FROM countries');
        if (parseInt(rows[0].count) > 0) {
            console.log(`\nℹ️  Already seeded (${rows[0].count} countries). Skipping download.`);
            console.log('   To re-seed, run: TRUNCATE countries CASCADE;\n');
            return;
        }

        console.log('\n⬇️  Downloading data from GitHub (dr5hn/countries-states-cities-database)');
        console.log('   This includes countries + states + cities for the whole world...\n');

        const countries = await fetchJson(
            'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries%2Bstates%2Bcities.json'
        );

        console.log(`\n   Downloaded ${countries.length} countries with states and cities.`);

        await client.query('BEGIN');
        await seedCountries(client, countries);
        await seedStates(client, countries);
        await seedCities(client, countries);
        await client.query('COMMIT');

        // Print summary
        const summary = await client.query(`
            SELECT
                (SELECT COUNT(*) FROM countries) AS countries,
                (SELECT COUNT(*) FROM states)    AS states,
                (SELECT COUNT(*) FROM cities)    AS cities
        `);
        const s = summary.rows[0];
        console.log('\n' + '━'.repeat(50));
        console.log('🎉 Database seed complete!');
        console.log(`   🌍 Countries : ${parseInt(s.countries).toLocaleString()}`);
        console.log(`   🗺️  States    : ${parseInt(s.states).toLocaleString()}`);
        console.log(`   🏙️  Cities    : ${parseInt(s.cities).toLocaleString()}`);
        console.log('━'.repeat(50));
        console.log('\nNext step: npm run dev\n');

    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('\n❌ Seed failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
