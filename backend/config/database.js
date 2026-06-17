const { Pool } = require('pg');
const { getPoolConfig } = require('./dbConfig');

const pool = new Pool(getPoolConfig());

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
