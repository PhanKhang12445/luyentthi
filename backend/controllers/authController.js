const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const { createToken, hashPassword, hashToken, verifyPassword } = require('../utils/auth');

const ensureAuthTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_user (
      id UUID PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_session (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  displayName: user.display_name,
});

const createSession = async (userId) => {
  const token = createToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  await pool.query(
    'INSERT INTO auth_session (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [uuidv4(), userId, tokenHash, expiresAt]
  );

  return token;
};

const register = async (req, res) => {
  const { email, password, displayName } = req.body;

  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Email and password with at least 6 characters are required' });
  }

  await ensureAuthTables();

  const userId = uuidv4();
  const normalizedEmail = email.trim().toLowerCase();
  const name = (displayName || normalizedEmail.split('@')[0]).trim();

  try {
    const result = await pool.query(
      'INSERT INTO app_user (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, email, display_name',
      [userId, normalizedEmail, name, hashPassword(password)]
    );
    const token = await createSession(userId);

    res.status(201).json({ token, user: publicUser(result.rows[0]) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email is already registered' });
    }

    throw error;
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  await ensureAuthTables();

  const result = await pool.query(
    'SELECT id, email, display_name, password_hash FROM app_user WHERE email = $1',
    [email.trim().toLowerCase()]
  );

  if (result.rows.length === 0 || !verifyPassword(password, result.rows[0].password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = await createSession(result.rows[0].id);

  res.json({ token, user: publicUser(result.rows[0]) });
};

const me = async (req, res) => {
  res.json({ user: publicUser(req.user) });
};

module.exports = {
  ensureAuthTables,
  login,
  me,
  register,
};
