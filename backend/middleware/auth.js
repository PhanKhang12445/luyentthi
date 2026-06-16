const pool = require('../config/database');
const { hashToken } = require('../utils/auth');

const requireAuth = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const tokenHash = hashToken(token);
  const result = await pool.query(
    `SELECT u.id, u.email, u.display_name
     FROM auth_session s
     JOIN app_user u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [tokenHash]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  req.user = result.rows[0];
  next();
};

module.exports = {
  requireAuth,
};
