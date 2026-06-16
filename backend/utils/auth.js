const crypto = require('crypto');

const TOKEN_BYTES = 32;
const SALT_BYTES = 16;
const ITERATIONS = 210000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

const hashPassword = (password) => {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST)
    .toString('hex');

  return `${ITERATIONS}:${salt}:${hash}`;
};

const verifyPassword = (password, storedHash) => {
  const [iterationsValue, salt, expectedHash] = String(storedHash || '').split(':');
  const iterations = Number(iterationsValue);

  if (!iterations || !salt || !expectedHash) return false;

  const actualHash = crypto
    .pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST)
    .toString('hex');

  return crypto.timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'));
};

const createToken = () => crypto.randomBytes(TOKEN_BYTES).toString('hex');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

module.exports = {
  createToken,
  hashPassword,
  hashToken,
  verifyPassword,
};
