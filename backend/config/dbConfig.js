require('dotenv').config();

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

const getPoolConfig = (overrides = {}) => {
  if (hasDatabaseUrl) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'false'
        ? false
        : { rejectUnauthorized: false },
      ...overrides,
    };
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'exam_preparation',
    ...overrides,
  };
};

module.exports = {
  getPoolConfig,
  hasDatabaseUrl,
};
