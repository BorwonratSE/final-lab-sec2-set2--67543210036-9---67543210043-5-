# TEAM_SPLIT.md — Final Lab Sec2 Set 2

## ข้อมูลกลุ่ม
- รายวิชา: ENGSE207 Software Architecture
- งาน: Final Lab Sec2 — ชุดที่ 2: Microservices + Activity Tracking + Cloud (Railway)

## รายชื่อสมาชิก
- [67543210036-9] [นายบวรรัตน์ ศิริเมือง]
- [67543210043-5] [นายภาณุวัฒน์ ยาท้วม]

---

## การแบ่งงานหลัก

### สมาชิกคนที่ 1: [ชื่อ-นามสกุล] ([รหัสนักศึกษา])

รับผิดชอบงานหลัก:
- **Auth Service** — Register API (`POST /api/auth/register`) + `logActivity()` + `logToDB()`
- **Auth Service** — Login, Verify, Me routes (ปรับจาก Set 1 + เพิ่ม logActivity หลัง login)
- `auth-service/init.sql` — schema + seed users
- Deploy **Auth Service** + `auth-db` บน Railway
- ตั้งค่า `ACTIVITY_SERVICE_URL` ใน auth-service environment variables

**Commits หลัก:**
- `feat(auth): add register endpoint with bcrypt hash`
- `feat(auth): add logActivity fire-and-forget to register and login`
- `feat(auth): add logToDB helper for auth-db logging`
- `chore(auth): update init.sql with users and logs tables`
- `deploy(auth): add Railway environment variables for auth-service`

---

### สมาชิกคนที่ 2: [ชื่อ-นามสกุล] ([รหัสนักศึกษา])

รับผิดชอบงานหลัก:
- **Task Service** — เพิ่ม `logActivity()` ใน CRUD routes ทุก route (create, update, delete)
- **Activity Service** — สร้างใหม่ทั้งหมด (`/internal`, `/me`, `/all`, `/health`)
- `activity-service/init.sql` — activities table schema + indexes
- **Frontend** — เพิ่ม Register form ใน `index.html`, ปรับ URL ใช้ `config.js`
- **Frontend** — สร้าง `activity.html` (Activity Timeline page)
- **Frontend** — สร้าง `config.js` (Railway Service URLs)
- Deploy **Task Service** + `task-db` และ **Activity Service** + `activity-db` บน Railway

**Commits หลัก:**
- `feat(task): add logActivity fire-and-forget to all CRUD routes`
- `feat(activity): create activity-service from scratch`
- `feat(activity): implement /internal, /me, /all endpoints`
- `feat(frontend): add register tab and config.js`
- `feat(frontend): create activity.html timeline page`
- `deploy(task,activity): configure Railway services and databases`

---

## งานที่ดำเนินการร่วมกัน

- ออกแบบ Architecture diagram และ Service-to-Service call flow
- สร้าง `docker-compose.yml` สำหรับ 3 services + 3 databases
- สร้าง `.env.example`
- ทดสอบระบบแบบ end-to-end บน local ก่อน deploy
- ทดสอบ test cases T1–T10 บน Cloud URL
- จัดทำ `README.md` และ `screenshots/`
- ทดสอบ Bonus: Graceful Degradation

---

## เหตุผลในการแบ่งงาน

แบ่งตาม **service boundary** เพื่อให้สมาชิกแต่ละคนสามารถทำงานได้อิสระและรับผิดชอบ service ของตนเองได้อย่างชัดเจน:
- สมาชิกคนที่ 1 รับผิดชอบ **Identity / Auth** — ส่วนที่เกี่ยวกับผู้ใช้และการ authentication
- สมาชิกคนที่ 2 รับผิดชอบ **Domain Logic + Observability** — task operations และ activity tracking

---

## สรุปการเชื่อมโยงงานของสมาชิก

งานของทั้งสองคนเชื่อมต่อกันผ่าน:
1. **JWT_SECRET** — ต้องใช้ค่าเดียวกัน ประสานกันตอนตั้งค่า environment variables บน Railway
2. **ACTIVITY_SERVICE_URL** — สมาชิกคนที่ 1 ต้องรอ URL ของ activity-service จากสมาชิกคนที่ 2 ก่อน redeploy
3. **JWT Payload format** — ตกลง schema ร่วมกัน (`sub`, `email`, `username`, `role`) ก่อนเริ่มพัฒนา
4. **Integration Testing** — ทดสอบ service-to-service call ร่วมกันหลังทุกอย่าง deploy แล้ว
