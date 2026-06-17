const { Pool } = require('pg');
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { getPoolConfig, hasDatabaseUrl } = require('../config/dbConfig');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

const database = process.env.DB_NAME || 'exam_preparation';

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const ensureDatabase = async () => {
  const adminPool = new Pool({
    ...dbConfig,
    database: process.env.DB_ADMIN_NAME || 'postgres',
  });

  try {
    const result = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);

    if (result.rowCount === 0) {
      await adminPool.query(`CREATE DATABASE ${quoteIdentifier(database)}`);
      console.log(`Created database ${database}`);
    }
  } finally {
    await adminPool.end();
  }
};

const runMigrations = async () => {
  try {
    console.log('Running database migrations...');

    if (!hasDatabaseUrl) {
      await ensureDatabase();
    }

    const pool = new Pool(hasDatabaseUrl ? getPoolConfig() : {
      ...dbConfig,
      database,
    });

    const candidatePaths = [
      path.join(__dirname, '..', '..', 'database', 'schema.sql'),
      path.join(__dirname, 'schema.sql'),
      path.join(__dirname, '..', 'schema.sql'),
    ];

    const schemaPath = candidatePaths.find(fs.existsSync);
    if (!schemaPath) {
      throw new Error(`Database schema file not found. Tried: ${candidatePaths.join(', ')}`);
    }

    const schema = fs.readFileSync(schemaPath, 'utf-8');

    await pool.query(schema);

    console.log('Database migrations completed successfully');
    await pool.end();
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;
