// ── Railway Service URLs ───────────────────────────────────────────────
// แก้ค่าด้านล่างให้ตรงกับ URL จริงหลัง deploy บน Railway
// สำหรับทดสอบ local ให้ใช้ http://localhost:PORT
window.APP_CONFIG = {
  AUTH_URL:     'https://your-auth-service.up.railway.app',
  TASK_URL:     'https://your-task-service.up.railway.app',
  ACTIVITY_URL: 'https://your-activity-service.up.railway.app'
};

// ── Local development override (uncomment เพื่อทดสอบ local) ───────────
// window.APP_CONFIG = {
//   AUTH_URL:     'http://localhost:3001',
//   TASK_URL:     'http://localhost:3002',
//   ACTIVITY_URL: 'http://localhost:3003'
// };
