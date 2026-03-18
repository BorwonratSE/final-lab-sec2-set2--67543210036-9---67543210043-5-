const jwt = require('jsonwebtoken');

const JWT_SECRET  = process.env.JWT_SECRET  || 'dev-secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '1h';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { signToken, verifyToken };
