/**
 * Hari HRMS — Database Setup & Seed Script
 * Run: node database/setup.js
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function runSetup() {
    console.log('\n🚀 Hari HRMS — Database Setup\n');

    // First connect without a database selected (to create it if needed)
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            multipleStatements: true,
        });
        console.log('✅ Connected to MySQL server');
    } catch (err) {
        console.error('❌ Cannot connect to MySQL:', err.message);
        console.error('\nMake sure:\n  1. MySQL is running\n  2. DB_HOST, DB_USER, DB_PASSWORD in .env are correct');
        process.exit(1);
    }

    const dbName = process.env.DB_NAME || 'hrms_db';

    try {
        // Create database
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await connection.query(`USE \`${dbName}\``);
        console.log(`✅ Database "${dbName}" ready`);

        // Read and run schema
        const schemaPath = path.join(__dirname, 'schema.sql');
        let schema = fs.readFileSync(schemaPath, 'utf8');
        // Remove USE statement since we already selected the db
        schema = schema.replace(/USE\s+\w+;\s*/gi, '');
        await connection.query(schema);
        console.log('✅ Schema created (all tables)');

        // Check if employees table already has data
        const [rows] = await connection.query('SELECT COUNT(*) as cnt FROM employees');
        if (rows[0].cnt > 0) {
            console.log(`ℹ️  Seed data already exists (${rows[0].cnt} employees). Skipping seed.\n`);
            console.log('💡 To re-seed, run: DROP DATABASE hrms_db; then run this script again.\n');
        } else {
            // Read and run seed data
            const seedPath = path.join(__dirname, 'seed.sql');
            let seed = fs.readFileSync(seedPath, 'utf8');
            seed = seed.replace(/USE\s+\w+;\s*/gi, '');
            await connection.query(seed);
            console.log('✅ Seed data inserted (7 employees, attendance, leaves, payroll, tickets)');
        }

        await connection.end();

        console.log('\n════════════════════════════════════════');
        console.log('🎉  Database is ready!');
        console.log('════════════════════════════════════════');
        console.log('\nDemo Login Credentials:');
        console.log('  👑 Admin    — admin@hari.com  / admin123');
        console.log('  👩‍💼 HR Mgr   — hr@hari.com     / hr123');
        console.log('  👤 Employee — emp@hari.com    / emp123');
        console.log('\nNow start the servers:');
        console.log('  Backend:  cd backend  && cmd /c "npm run dev"   → http://localhost:5000');
        console.log('  Frontend: cd frontend && cmd /c "npm run dev"   → http://localhost:5173');
        console.log('');

    } catch (err) {
        console.error('❌ Setup failed:', err.message);
        if (err.code === 'ENOENT') {
            console.error('   Could not find schema.sql or seed.sql next to this script.');
        }
        await connection.end();
        process.exit(1);
    }
}

runSetup();
