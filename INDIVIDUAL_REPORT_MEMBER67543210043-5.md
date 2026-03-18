# INDIVIDUAL_REPORT_[studentid].md

## 1. ข้อมูลผู้จัดทำ
- ชื่อ-นามสกุล: [ระบุชื่อ]
- รหัสนักศึกษา: [ระบุรหัส]
- กลุ่ม: [ระบุกลุ่ม]
- รายวิชา: ENGSE207 Software Architecture

---

## 2. ขอบเขตงานที่รับผิดชอบ

รับผิดชอบหลักใน **Task Service**, **Activity Service** และ **Frontend** ได้แก่:
- `task-service/src/routes/tasks.js` — CRUD + `logActivity()` ทุก route
- `task-service/src/middleware/authMiddleware.js` — JWT guard middleware
- `task-service/init.sql` — tasks table, logs table
- `activity-service/src/index.js` — ทั้งหมด (สร้างใหม่ตั้งแต่ต้น)
- `activity-service/init.sql` — activities table + indexes
- `frontend/index.html` — ปรับจาก Set 1 เพิ่ม Register tab + config.js
- `frontend/activity.html` — Activity Timeline page (สร้างใหม่)
- `frontend/config.js` — Railway Service URLs
- Deploy task-service + task-db และ activity-service + activity-db บน Railway

---

## 3. สิ่งที่ได้ดำเนินการด้วยตนเอง

### 3.1 Task Service — เพิ่ม logActivity()

เพิ่ม `logActivity()` fire-and-forget helper และเรียกใช้ใน:
- `POST /api/tasks` → ส่ง `TASK_CREATED` event พร้อม `{ task_id, title, priority }`
- `PUT /api/tasks/:id` → ส่ง `TASK_STATUS_CHANGED` เฉพาะเมื่อ status จริงๆ เปลี่ยน (เปรียบเทียบกับค่าเดิมใน DB)
- `DELETE /api/tasks/:id` → ส่ง `TASK_DELETED` event พร้อม `{ task_id }`

ปรับ task table ให้เก็บ `username` ด้วย (denormalize จาก JWT) เพื่อให้ frontend แสดงชื่อเจ้าของ task ได้

### 3.2 Activity Service — สร้างใหม่ทั้งหมด

สร้าง Express service ที่มี endpoints:
- `POST /api/activity/internal` — รับ event จาก auth/task service (ไม่ต้อง JWT)
- `GET /api/activity/me` — query ด้วย `user_id = req.user.sub` พร้อม filter event_type + pagination
- `GET /api/activity/all` — admin only, filter ด้วย event_type และ username
- `GET /api/activity/health`

เพิ่ม fallback `CREATE TABLE IF NOT EXISTS` ใน `start()` สำหรับ Railway ที่ init.sql อาจไม่รันอัตโนมัติ

### 3.3 Frontend — ปรับจาก Set 1

**index.html:**
- เพิ่ม Register tab พร้อม `doRegister()` ที่ส่ง `username` (ไม่ใช่ `name`)
- หลัง register สำเร็จ → auto login ต่อทันที
- ลบ Profile & JWT tab (ไม่มี User Service)
- ลบ Log Dashboard link (ไม่มี Log Service)
- เพิ่ม Activity Timeline link ที่ชี้ไป `activity.html`
- ปรับ URL ทุก fetch call ให้ใช้ `AUTH` และ `TASK` จาก `config.js`
- ปรับ `renderTasks()` ให้ใช้ `t.username` แทน `t.owner_id`

**activity.html:** สร้างหน้า Activity Timeline ด้วย:
- Stats cards 5 ตัว (total, registered, logins, tasks created, status changes)
- Tabs: กิจกรรมของฉัน / ทั้งระบบ (admin)
- Filter dropdown ตาม event_type
- Timeline view พร้อม color-coded dots ตาม event type

---

## 4. ปัญหาที่พบและวิธีการแก้ไข

### ปัญหาที่ 1: TASK_STATUS_CHANGED ถูกส่งทุกครั้งที่ PUT

**ปัญหา:** เมื่อแก้ไข task เฉพาะ title (ไม่เปลี่ยน status) ก็ยังส่ง `TASK_STATUS_CHANGED` event ซึ่งไม่ถูกต้อง

**วิธีแก้:** Query ดึง task ปัจจุบันก่อน (`SELECT * FROM tasks WHERE id = $1`) แล้วเปรียบเทียบ `status` ที่ request ส่งมากับ `old.status` ก่อน ถ้าไม่เปลี่ยน ไม่ส่ง event

```javascript
if (status && status !== old.status) {
  logActivity({ eventType: 'TASK_STATUS_CHANGED', ... });
}
```

### ปัญหาที่ 2: Railway ไม่รัน init.sql สำหรับ activity-db

**ปัญหา:** Railway PostgreSQL plugin ไม่ auto-run `init.sql` ทำให้ activity-service เริ่มต้นแล้ว insert ไม่ได้เพราะยังไม่มี table

**วิธีแก้:** เพิ่ม `CREATE TABLE IF NOT EXISTS activities (...)` ใน `start()` ของ activity-service ให้สร้าง table เองตอน startup ถ้ายังไม่มี (idempotent)

---

## 5. อธิบาย Denormalization ใน Activities Table

**Denormalization** ในที่นี้หมายถึงการเก็บ `username` ไว้ใน `activities` table ทั้งที่ข้อมูลนี้ซ้ำกับที่มีใน `users` table ของ auth-db

**เหตุผลที่ต้องทำ:**
- ระบบแบบ Database-per-Service แต่ละ service มี database เป็นของตัวเอง
- `activity-service` ไม่สามารถเชื่อมต่อกับ `auth-db` ได้โดยตรง
- จะ query `username` ผ่าน auth-service ทุกครั้งก็ไม่ดีเพราะสร้าง coupling และ network dependency
- จึงเก็บ `username` ไว้ใน activities เลย โดยดึงมาจาก JWT payload ที่ส่งมาตอน logActivity()

**ผลที่ได้:** activity-service query ได้ด้วยตัวเอง ไม่พึ่ง service อื่น ทำให้ระบบ resilient กว่า

---

## 6. อธิบาย Fire-and-Forget Pattern

ใน task-service `logActivity()` ใช้ pattern นี้:

```javascript
function logActivity({ ... }) {
  fetch(`${ACTIVITY_URL}/api/activity/internal`, {
    method: 'POST',
    body: JSON.stringify({ ... })
  }).catch(() => {
    console.warn('[task] activity-service unreachable');
  });
  // ไม่มี return await → caller ไม่รอผลลัพธ์
}
```

**ทำไมต้องเป็น fire-and-forget:**
- การ create/delete task คือ core business logic — ต้องสำเร็จเสมอ
- Activity tracking คือ side effect — ไม่ควรทำให้ core operation fail
- ถ้า await แล้ว activity-service timeout (เช่น 30 วินาที) → user รอ 30 วินาทีทุกครั้งที่สร้าง task
- `.catch(() => {})` ดักทุก error เพื่อป้องกัน unhandled promise rejection

---

## 7. สิ่งที่ได้เรียนรู้

- **Service-to-Service Communication** — วิธีที่ service คุยกันใน Microservices architecture
- **Database-per-Service Pattern** — ข้อดีคือ service independence ข้อเสียคือต้อง denormalize data
- **Activity Tracking vs Technical Logging** — ความแตกต่างระหว่าง logs (technical) กับ activities (business events)
- วิธีสร้าง timeline UI ด้วย HTML/CSS ล้วนโดยไม่ใช้ library
- การ deploy หลาย services บน Railway project เดียวและการจัดการ environment variables

---

## 8. แนวทางการพัฒนาต่อ

- เปลี่ยน activity tracking จาก synchronous HTTP call เป็น **event queue** (เช่น Redis Streams, RabbitMQ) เพื่อ reliability ที่สูงขึ้น
- เพิ่ม **retry mechanism** สำหรับ failed activity events (เช่น เก็บไว้ใน queue แล้ว retry ทีหลัง)
- เพิ่ม **WebSocket** ใน activity.html เพื่อ real-time activity feed
- เพิ่ม `DELETE /api/tasks/:id` ให้ตรวจสอบ ownership — ปัจจุบัน user ใดก็ลบ task ของคนอื่นได้
