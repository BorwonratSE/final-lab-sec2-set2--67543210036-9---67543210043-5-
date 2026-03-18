const express = require('express');
const router  = express.Router();
const pool    = require('../db/db');
const { requireAuth } = require('../middleware/authMiddleware');

// ── Helper: log ลง task-db ─────────────────────────────────────────────
async function logToDB({ level, event, userId, message, meta }) {
  try {
    await pool.query(
      `INSERT INTO logs (level, event, user_id, message, meta)
       VALUES ($1,$2,$3,$4,$5)`,
      [level, event, userId || null, message || null,
       meta ? JSON.stringify(meta) : null]
    );
  } catch (e) {
    console.error('[task-log]', e.message);
  }
}

// ── Helper: ส่ง activity event (fire-and-forget) ───────────────────────
function logActivity({ userId, username, eventType, entityId, summary, meta }) {
  const ACTIVITY_URL = process.env.ACTIVITY_SERVICE_URL || 'http://activity-service:3003';
  fetch(`${ACTIVITY_URL}/api/activity/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id:     userId,
      username,
      event_type:  eventType,
      entity_type: 'task',
      entity_id:   entityId || null,
      summary,
      meta:        meta || null
    })
  }).catch(() => {
    console.warn('[task] activity-service unreachable — skipping event log');
  });
}

// ── GET /api/tasks/health ─────────────────────────────────────────────
router.get('/health', (_, res) =>
  res.json({ status: 'ok', service: 'task-service', time: new Date() })
);

// ── GET /api/tasks ─────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tasks ORDER BY created_at DESC'
    );
    res.json({ tasks: result.rows });
  } catch (err) {
    console.error('[task] GET / error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/tasks ────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { title, description, priority = 'medium' } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  try {
    const result = await pool.query(
      `INSERT INTO tasks (user_id, username, title, description, priority)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [req.user.sub, req.user.username, title, description || null, priority]
    );
    const task = result.rows[0];

    await logToDB({
      level: 'INFO', event: 'TASK_CREATED', userId: req.user.sub,
      message: `${req.user.username} created task "${title}"`,
      meta: { task_id: task.id }
    });

    // fire-and-forget
    logActivity({
      userId:    req.user.sub,
      username:  req.user.username,
      eventType: 'TASK_CREATED',
      entityId:  task.id,
      summary:   `${req.user.username} สร้าง task "${title}"`,
      meta:      { task_id: task.id, title, priority }
    });

    res.status(201).json({ task });
  } catch (err) {
    console.error('[task] POST / error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/tasks/:id ─────────────────────────────────────────────────
router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { title, description, status, priority } = req.body;

  try {
    // ดึง task ปัจจุบันก่อน
    const check = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Task not found' });

    const old = check.rows[0];

    const result = await pool.query(
      `UPDATE tasks
       SET title       = COALESCE($1, title),
           description = COALESCE($2, description),
           status      = COALESCE($3, status),
           priority    = COALESCE($4, priority),
           updated_at  = NOW()
       WHERE id = $5
       RETURNING *`,
      [title || null, description || null, status || null, priority || null, id]
    );
    const task = result.rows[0];

    await logToDB({
      level: 'INFO', event: 'TASK_UPDATED', userId: req.user.sub,
      message: `${req.user.username} updated task #${id}`,
      meta: { task_id: parseInt(id) }
    });

    // ส่ง activity เฉพาะตอน status เปลี่ยน
    if (status && status !== old.status) {
      logActivity({
        userId:    req.user.sub,
        username:  req.user.username,
        eventType: 'TASK_STATUS_CHANGED',
        entityId:  parseInt(id),
        summary:   `${req.user.username} เปลี่ยนสถานะ task #${id} เป็น ${status}`,
        meta:      { task_id: parseInt(id), old_status: old.status, new_status: status }
      });
    }

    res.json({ task });
  } catch (err) {
    console.error('[task] PUT /:id error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/tasks/:id ──────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const check = await pool.query('SELECT id FROM tasks WHERE id = $1', [id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Task not found' });

    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);

    await logToDB({
      level: 'INFO', event: 'TASK_DELETED', userId: req.user.sub,
      message: `${req.user.username} deleted task #${id}`,
      meta: { task_id: parseInt(id) }
    });

    // fire-and-forget
    logActivity({
      userId:    req.user.sub,
      username:  req.user.username,
      eventType: 'TASK_DELETED',
      entityId:  parseInt(id),
      summary:   `${req.user.username} ลบ task #${id}`,
      meta:      { task_id: parseInt(id) }
    });

    res.json({ message: 'Task deleted', id: parseInt(id) });
  } catch (err) {
    console.error('[task] DELETE /:id error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
