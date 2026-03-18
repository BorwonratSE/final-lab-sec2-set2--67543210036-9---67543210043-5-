# ENGSE207 Software Architecture
## README — Final Lab Sec2 ชุดที่ 2: Microservices + Activity Tracking + Cloud (Railway)

---

## 1. ข้อมูลรายวิชาและสมาชิก

**รายวิชา:** ENGSE207 Software Architecture  
**ชื่องาน:** Final Lab Sec2 — ชุดที่ 2: Microservices + Activity Tracking + Cloud (Railway)

**สมาชิกในกลุ่ม**
- ชื่อ-สกุล / รหัสนักศึกษา: ........................................
- ชื่อ-สกุล / รหัสนักศึกษา: ........................................

**Repository:** `engse207-sec2-lab2-[รหัส1]-[รหัส2]/`

---

## 2. Railway Service URLs

> อัปเดต URL จริงหลัง deploy บน Railway

| Service | URL |
|---|---|
| Auth Service | `https://your-auth-service.up.railway.app` |
| Task Service | `https://your-task-service.up.railway.app` |
| Activity Service | `https://your-activity-service.up.railway.app` |

---

## 3. สถาปัตยกรรมระบบ (Architecture)

### สถาปัตยกรรม Cloud (Railway)

```
Browser / Postman
        │
        │ HTTPS (Railway จัดการอัตโนมัติ)
        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Railway Project                          │
│                                                             │
│  Auth Service          Task Service      Activity Service   │
│  https://auth-xxx…     https://task-xxx… https://act-xxx…  │
│       │                     │                  ▲           │
│       │                     │  POST /internal  │           │
│       └─────────────────────┴──────────────────┘           │
│       │                     │                  │           │
│       ▼                     ▼                  ▼           │
│   auth-db               task-db          activity-db        │
│   [PostgreSQL]          [PostgreSQL]     [PostgreSQL]       │
│                                                             │
│  Frontend เรียกแต่ละ service โดยตรงผ่าน config.js            │
└─────────────────────────────────────────────────────────────┘
```

### Service-to-Service Call (Fire-and-Forget)

```
ผู้ใช้ register / login
    │
    ▼
Auth Service ──── POST /api/activity/internal ────▶ Activity Service
(บันทึกลง auth-db)                                  (บันทึกลง activity-db)

ผู้ใช้ create / update / delete task
    │
    ▼
Task Service ──── POST /api/activity/internal ────▶ Activity Service
(บันทึกลง task-db)                                  (บันทึกลง activity-db)
```

### Services ในระบบ

| Service | Port (Local) | หน้าที่ | Database |
|---|---|---|---|
| auth-service | 3001 | Register, Login, Verify, Me | auth-db |
| task-service | 3002 | CRUD Tasks | task-db |
| activity-service | 3003 | รับและแสดง Activity Events | activity-db |

---

## 4. สิ่งที่เปลี่ยนจาก Set 1

| Set 1 | Set 2 |
|---|---|
| 4 services: auth, task, log, frontend | 3 services บน Cloud: auth, task, activity |
| Shared PostgreSQL (1 DB) | Database-per-Service (3 DB แยก) |
| Log Service แยก | แต่ละ service log ลง DB ของตัวเอง + ส่ง event ไป Activity Service |
| ไม่มี Register | มี Register API ใน Auth Service |
| Local-only (HTTPS + Nginx) | Deploy บน Railway (HTTPS อัตโนมัติ) |

---

## 5. Denormalization ใน Activities Table

**คำถาม:** ทำไม `activities` table ต้องเก็บ `username` ไว้ด้วย ทั้งที่รู้ `user_id` อยู่แล้ว?

**คำตอบ:** เพราะระบบใช้ **Database-per-Service Pattern** ซึ่งหมายความว่า:
- `activity-db` ไม่มี `users` table — ข้อมูล username ทั้งหมดอยู่ใน `auth-db`
- ถ้าไม่ denormalize จะต้อง query ข้าม 2 databases เพื่อแสดง username ซึ่ง **ทำไม่ได้** ใน Microservices
- จึงเก็บ `username` ไว้ใน `activities` ณ เวลาที่ event เกิดขึ้นเลย (snapshot ณ เวลานั้น)

นี่คือ **Denormalization Pattern** ที่ยอมรับข้อมูลซ้ำกัน (redundancy) เพื่อแลกกับความสามารถในการ query โดยไม่ต้องพึ่ง service อื่น

---

## 6. Fire-and-Forget Pattern

**คำถาม:** ทำไม `logActivity()` ต้องเป็น fire-and-forget?

**คำตอบ:** `logActivity()` ใช้ pattern นี้เพราะ:
- Activity tracking เป็น **non-critical operation** — ถ้าล้มเหลวไม่ควรทำให้ core operation (login, create task) ล้มเหลวด้วย
- ใช้ `fetch(...).catch(() => {})` ทำให้ auth-service และ task-service **ไม่ await** การตอบกลับจาก activity-service
- ผลคือ: ถ้า Activity Service ล่ม → **ระบบหลักยังทำงานได้ปกติ** เพียงแต่ activities จะไม่ถูกบันทึกชั่วคราว

```javascript
// ตัวอย่าง fire-and-forget ใน auth-service
fetch(`${ACTIVITY_URL}/api/activity/internal`, {
  method: 'POST',
  body: JSON.stringify({ ... })
}).catch(() => {
  // ถ้า activity-service ไม่ตอบ — ไม่หยุดการทำงาน
  console.warn('[auth] activity-service unreachable — skipping event log');
});
// ไม่มี await → return ทันที ไม่รอผลลัพธ์
```

---

## 7. Gateway Strategy

เลือก **Option A: Frontend เรียก URL ของแต่ละ service โดยตรง**

```javascript
// frontend/config.js
window.APP_CONFIG = {
  AUTH_URL:     'https://your-auth-service.up.railway.app',
  TASK_URL:     'https://your-task-service.up.railway.app',
  ACTIVITY_URL: 'https://your-activity-service.up.railway.app'
};
```

**เหตุผลที่เลือก Option A:**
- ง่ายต่อการ implement สำหรับงาน lab
- ไม่ต้อง deploy Nginx หรือ API Gateway แยก
- Railway จัดการ HTTPS ให้อัตโนมัติแต่ละ service
- เหมาะสำหรับระบบขนาดเล็กที่ service แต่ละตัวมี public URL

---

## 8. โครงสร้าง Repository

```
final-lab-sec2-set2/
├── README.md
├── TEAM_SPLIT.md
├── INDIVIDUAL_REPORT_[studentid].md
├── docker-compose.yml
├── .env.example
│
├── auth-service/
│   ├── Dockerfile
│   ├── package.json
│   ├── init.sql                ← auth-db schema + seed users
│   └── src/
│       ├── index.js
│       ├── db/db.js
│       ├── middleware/jwtUtils.js
│       └── routes/auth.js      ← register, login, verify, me + logActivity()
│
├── task-service/
│   ├── Dockerfile
│   ├── package.json
│   ├── init.sql                ← task-db schema
│   └── src/
│       ├── index.js
│       ├── db/db.js
│       ├── middleware/authMiddleware.js
│       ├── middleware/jwtUtils.js
│       └── routes/tasks.js     ← CRUD + logActivity() ทุก route
│
├── activity-service/           ← service ใหม่ทั้งหมด
│   ├── Dockerfile
│   ├── package.json
│   ├── init.sql                ← activity-db schema
│   └── src/
│       └── index.js            ← /internal, /me, /all, /health
│
├── frontend/
│   ├── index.html              ← Task Board + Register tab
│   ├── activity.html           ← Activity Timeline
│   └── config.js               ← Railway Service URLs
│
└── screenshots/
```

---

## 9. เทคโนโลยีที่ใช้

- Node.js / Express.js
- PostgreSQL (Database-per-Service: 3 databases)
- Docker / Docker Compose
- HTML / CSS / JavaScript
- JWT (shared secret ทุก service)
- bcryptjs
- Railway Cloud Platform

---

## 10. Seed Users สำหรับทดสอบ

| Username | Email | Password | Role |
|---|---|---|---|
| alice | alice@lab.local | alice123 | member |
| admin | admin@lab.local | adminpass | admin |

---

## 11. Environment Variables

| ตัวแปร | ใช้ใน Service | คำอธิบาย |
|---|---|---|
| `DATABASE_URL` | ทุก service | PostgreSQL connection string |
| `JWT_SECRET` | ทุก service | **ต้องเหมือนกันทุก service** |
| `JWT_EXPIRES` | auth-service | อายุ token เช่น `1h` |
| `PORT` | ทุก service | port ที่ service รันอยู่ |
| `NODE_ENV` | ทุก service | `development` หรือ `production` |
| `ACTIVITY_SERVICE_URL` | auth-service, task-service | URL ของ activity-service |

> ⚠️ `JWT_SECRET` ต้องมีค่าเดียวกันทุก service เพราะทุก service ต้อง verify token ที่ออกโดย auth-service

---

## 12. วิธีรัน Local ด้วย Docker Compose

```bash
# 1. คัดลอก .env
cp .env.example .env

# 2. รันระบบ
docker compose down -v
docker compose up --build

# Services จะรันที่:
# Auth Service:     http://localhost:3001
# Task Service:     http://localhost:3002
# Activity Service: http://localhost:3003
```

---

## 13. วิธีทดสอบ (Local)

```bash
# Register
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@sec2.local","password":"123456"}'

# Login → เก็บ token
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@sec2.local","password":"123456"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# ตรวจ activities
curl http://localhost:3003/api/activity/me \
  -H "Authorization: Bearer $TOKEN"

# Create Task
curl -X POST http://localhost:3002/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test activity tracking","priority":"high"}'

# ตรวจ TASK_CREATED event
curl http://localhost:3003/api/activity/me \
  -H "Authorization: Bearer $TOKEN"
```

---

## 14. API Summary

### Auth Service
| Method | Path | Auth | คำอธิบาย |
|---|---|---|---|
| POST | `/api/auth/register` | ไม่ต้อง | สมัครสมาชิก |
| POST | `/api/auth/login` | ไม่ต้อง | เข้าสู่ระบบ |
| GET | `/api/auth/verify` | JWT | ตรวจสอบ token |
| GET | `/api/auth/me` | JWT | ดูข้อมูลตัวเอง |
| GET | `/api/auth/health` | ไม่ต้อง | Health check |

### Task Service
| Method | Path | Auth | คำอธิบาย |
|---|---|---|---|
| GET | `/api/tasks/health` | ไม่ต้อง | Health check |
| GET | `/api/tasks` | JWT | ดูรายการ task |
| POST | `/api/tasks` | JWT | สร้าง task |
| PUT | `/api/tasks/:id` | JWT | แก้ไข task |
| DELETE | `/api/tasks/:id` | JWT | ลบ task |

### Activity Service
| Method | Path | Auth | คำอธิบาย |
|---|---|---|---|
| POST | `/api/activity/internal` | ไม่ต้อง | รับ event จาก services |
| GET | `/api/activity/me` | JWT | ดู activities ตัวเอง |
| GET | `/api/activity/all` | JWT (admin) | ดู activities ทั้งหมด |
| GET | `/api/activity/health` | ไม่ต้อง | Health check |

---

## 15. Activity Events ที่บันทึก

| event_type | ส่งมาจาก | เกิดขึ้นเมื่อ |
|---|---|---|
| `USER_REGISTERED` | auth-service | POST /register สำเร็จ |
| `USER_LOGIN` | auth-service | POST /login สำเร็จ |
| `TASK_CREATED` | task-service | POST /tasks สำเร็จ |
| `TASK_STATUS_CHANGED` | task-service | PUT /tasks/:id เปลี่ยน status |
| `TASK_DELETED` | task-service | DELETE /tasks/:id |

---

## 16. ปัญหาที่พบและแนวทางแก้ไข

> ให้กลุ่มสรุปปัญหาที่พบจริงระหว่างทำงาน

- ปัญหา `ACTIVITY_SERVICE_URL` ต้องอัปเดตหลัง deploy Activity Service เสร็จ → ต้อง redeploy auth/task service
- ปัญหา JWT_SECRET ต่าง service ต้องค่าเดียวกัน ถ้าตั้งผิดจะได้ 401 ทุก request
- ปัญหา Railway อาจไม่รัน init.sql อัตโนมัติ → activity-service มี fallback `CREATE TABLE IF NOT EXISTS` ใน `start()`
- ปัญหา CORS เมื่อ frontend (static) เรียก service คนละ domain → ทุก service เปิด `cors()` แล้ว

---

## 17. Known Limitations

- ใช้ shared JWT_SECRET แบบ symmetric (ไม่ใช่ RSA key pair)
- ไม่มี rate limiting บน Cloud (Set 1 มี Nginx rate limit)
- Activity Service ไม่มี internal authentication — ใครก็ POST `/internal` ได้ (acceptable สำหรับ lab)
- Frontend เป็น static HTML ไม่มี build system
- Database-per-Service ทำให้ไม่สามารถ JOIN ข้าม service ได้

---

## 18. การแบ่งงานของทีม

รายละเอียดการแบ่งงานอยู่ในไฟล์ `TEAM_SPLIT.md`  
รายงานรายบุคคลอยู่ในไฟล์ `INDIVIDUAL_REPORT_[studentid].md`

---

## 19. Screenshots

โฟลเดอร์ `screenshots/` ประกอบด้วย

| ไฟล์ | รายการ |
|---|---|
| `01_railway_dashboard.png` | 3 services + 3 databases บน Railway |
| `02_auth_register_cloud.png` | POST /register → 201 |
| `03_auth_login_cloud.png` | POST /login → JWT |
| `04_auth_me_cloud.png` | GET /auth/me |
| `05_activity_me_user_events.png` | GET /activity/me → USER_REGISTERED + USER_LOGIN |
| `06_activity_task_created.png` | GET /activity/me หลัง create task → TASK_CREATED |
| `07_activity_status_changed.png` | GET /activity/me → TASK_STATUS_CHANGED |
| `08_task_list_cloud.png` | GET /tasks → list |
| `09_protected_401.png` | No JWT → 401 |
| `10_member_activity_all_403.png` | member → 403 |
| `11_admin_activity_all_200.png` | admin → 200 |
| `12_readme_architecture.png` | Architecture diagram |
| `13_bonus_graceful_degradation.png` | (Bonus) task สำเร็จแม้ activity down |

---

## 20. Bonus: Graceful Degradation

ระบบรองรับ graceful degradation — ถ้า Activity Service ล่ม Auth Service และ Task Service **ยังทำงานได้ปกติ**

**วิธีทดสอบ:**
```bash
# หยุด activity-service
docker compose stop activity-service

# สร้าง task — ต้องได้ 201 แม้ activity-service ล่ม
curl -X POST http://localhost:3002/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Task while activity is down","priority":"low"}'
# ต้องได้ 201
```

เหตุผล: `logActivity()` ใช้ fire-and-forget (`.catch(() => {})`) จึงไม่หยุดรอผลลัพธ์จาก activity-service

---

> *ENGSE207 Software Architecture | มหาวิทยาลัยเทคโนโลยีราชมงคลล้านนา*  
> *อาจารย์ธนิต เกตุแก้ว*
