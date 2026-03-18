const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();
const pool    = require('../db/db');
const { signToken, verifyToken } = require('../middleware/jwtUtils');

// ── Helper: บันทึก log ลง auth-db ───────────────────────────────────────
async function logToDB({ level, event, userId, ip, message, meta }) {
  try {
    await pool.query(
      `INSERT INTO logs (level, event, user_id, ip_address, message, meta)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [level, event, userId || null, ip || null, message || null,
       meta ? JSON.stringify(meta) : null]
    );
  } catch (e) {
    console.error('[auth-log]', e.message);
  }
}

// ── Helper: ส่ง activity event ไปหา Activity Service (fire-and-forget) ──
function logActivity({ userId, username, eventType, entityType, entityId, summary, meta }) {
  const ACTIVITY_URL = process.env.ACTIVITY_SERVICE_URL || 'http://activity-service:3003';
  fetch(`${ACTIVITY_URL}/api/activity/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id:     userId,
      username,
      event_type:  eventType,
      entity_type: entityType || null,
      entity_id:   entityId   || null,
      summary,
      meta:        meta || null
    })
  }).catch(() => {
    // ถ้า activity-service ไม่ตอบ ไม่หยุดการทำงานของ auth-service
    console.warn('[auth] activity-service unreachable — skipping event log');
  });
}

// ── POST /api/auth/register ────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.ip;

  if (!username || !email || !password)
    return res.status(400).json({ error: 'username, email, password are required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'password ต้องมีอย่างน้อย 6 ตัวอักษร' });

  try {
    const exists = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase().trim(), username.trim()]
    );
    if (exists.rows.length > 0)
      return res.status(409).json({ error: 'Email หรือ Username ถูกใช้งานแล้ว' });

    const hash   = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1,$2,$3,'member')
       RETURNING id, username, email, role, created_at`,
      [username.trim(), email.toLowerCase().trim(), hash]
    );
    const user = result.rows[0];

    await logToDB({
      level: 'INFO', event: 'REGISTER_SUCCESS', userId: user.id, ip,
      message: `New user registered: ${user.username}`
    });

    // fire-and-forget — ไม่ await
    logActivity({
      userId:     user.id,
      username:   user.username,
      eventType:  'USER_REGISTERED',
      entityType: 'user',
      entityId:   user.id,
      summary:    `${user.username} สมัครสมาชิกใหม่`
    });

    res.status(201).json({
      message: 'สมัครสมาชิกสำเร็จ',
      user: {
        id:       user.id,
        username: user.username,
        email:    user.email,
        role:     user.role
      }
    });
  } catch (err) {
    console.error('[auth] Register error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.ip;

  if (!email || !password)
    return res.status(400).json({ error: 'email and password are required' });

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      await logToDB({
        level: 'WARN', event: 'LOGIN_FAIL', ip,
        message: `Failed login attempt for: ${email}`
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // update last_login
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = signToken({
      sub:      user.id,
      email:    user.email,
      username: user.username,
      role:     user.role
    });

    await logToDB({
      level: 'INFO', event: 'LOGIN_SUCCESS', userId: user.id, ip,
      message: `${user.username} logged in`
    });

    // fire-and-forget
    logActivity({
      userId:     user.id,
      username:   user.username,
      eventType:  'USER_LOGIN',
      entityType: 'user',
      entityId:   user.id,
      summary:    `${user.username} เข้าสู่ระบบ`
    });

    res.json({
      token,
      user: {
        id:       user.id,
        username: user.username,
        email:    user.email,
        role:     user.role
      }
    });
  } catch (err) {
    console.error('[auth] Login error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/auth/verify ───────────────────────────────────────────────
router.get('/verify', (req, res) => {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.json({ valid: false });
  try {
    const decoded = verifyToken(token);
    res.json({ valid: true, user: decoded });
  } catch {
    res.json({ valid: false });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = verifyToken(token);
    const result  = await pool.query(
      'SELECT id, username, email, role, created_at, last_login FROM users WHERE id = $1',
      [decoded.sub]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ── GET /api/auth/health ───────────────────────────────────────────────
router.get('/health', (_, res) =>
  res.json({ status: 'ok', service: 'auth-service', time: new Date() })
);

module.exports = router;
