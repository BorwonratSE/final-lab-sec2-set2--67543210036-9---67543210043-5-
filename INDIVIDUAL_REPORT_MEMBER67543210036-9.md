# INDIVIDUAL_REPORT_[studentid].md

## 1. ข้อมูลผู้จัดทำ
- ชื่อ-นามสกุล: [นายภาณุวัฒน์ ยาท้วม]
- รหัสนักศึกษา: [67543210043-5]
- กลุ่ม: [11]
- รายวิชา: ENGSE207 Software Architecture

---

## 2. ขอบเขตงานที่รับผิดชอบ

รับผิดชอบหลักใน **Auth Service** ทั้งหมด ได้แก่:
- `auth-service/src/routes/auth.js` — Register, Login, Verify, Me endpoints
- `auth-service/src/middleware/jwtUtils.js` — signToken, verifyToken
- `auth-service/src/db/db.js` — PostgreSQL connection pool
- `auth-service/src/index.js` — Express app + DB retry logic
- `auth-service/init.sql` — users table, logs table, seed users
- `auth-service/Dockerfile` — container image
- Deploy auth-service + auth-db บน Railway

---

## 3. สิ่งที่ได้ดำเนินการด้วยตนเอง

### 3.1 Register API

เขียน `POST /api/auth/register` ที่:
- รับ `username`, `email`, `password`
- validate input (ความยาว password, field ครบ)
- ตรวจสอบ duplicate email/username
- hash password ด้วย `bcryptjs` (salt rounds = 10)
- INSERT user ลง auth-db
- เรียก `logToDB()` บันทึก `REGISTER_SUCCESS` ลง logs table
- เรียก `logActivity()` แบบ fire-and-forget ส่ง `USER_REGISTERED` event ไป activity-service

### 3.2 logActivity() — Fire-and-Forget Helper

เขียน helper function ที่ใช้ `fetch(...).catch(() => {})` เพื่อส่ง event ไป Activity Service โดยไม่ await ผลลัพธ์ ทำให้ auth-service ไม่หยุดรอแม้ activity-service จะไม่ตอบ

### 3.3 Login Route ปรับจาก Set 1

เพิ่ม `logActivity()` หลัง login สำเร็จ เพื่อส่ง `USER_LOGIN` event ไป activity-service

### 3.4 Deploy บน Railway

ตั้งค่า environment variables บน Railway:
- `DATABASE_URL` → `${{auth-db.DATABASE_URL}}`
- `JWT_SECRET` → ค่า shared กับ task-service และ activity-service
- `ACTIVITY_SERVICE_URL` → URL ของ activity-service หลัง deploy

---

## 4. ปัญหาที่พบและวิธีการแก้ไข

### ปัญหาที่ 1: ACTIVITY_SERVICE_URL circular dependency

**ปัญหา:** ต้อง deploy activity-service ก่อนถึงจะรู้ URL แต่ auth-service ต้องการ URL นั้นตั้งแต่ deploy

**วิธีแก้:** Deploy auth-service ก่อนโดยใส่ URL ชั่วคราว (placeholder) เนื่องจาก `logActivity()` เป็น fire-and-forget ถ้า URL ผิด service ยังทำงานได้ปกติ หลังจาก deploy activity-service เสร็จจึงกลับมาอัปเดต env var แล้ว redeploy

### ปัญหาที่ 2: bcrypt hash ใน init.sql

**ปัญหา:** ต้องใส่ bcrypt hash สำหรับ seed users ลงใน init.sql แต่ hash จะเปลี่ยนทุกครั้งที่ generate ใหม่

**วิธีแก้:** Generate hash ครั้งเดียวด้วย `node -e "const b=require('bcryptjs'); console.log(b.hashSync('alice123',10))"` แล้ว hardcode ค่านั้นลงใน init.sql เพื่อให้ seed users ใช้ได้ทุกครั้งที่ reset database

---

## 5. อธิบาย Denormalization ใน Activities Table

**Denormalization** คือการเก็บข้อมูลซ้ำกัน (redundancy) โดยตั้งใจเพื่อประสิทธิภาพในการ query

ในระบบนี้ `activities` table เก็บ `username` ไว้ทั้งที่มี `user_id` อยู่แล้ว เพราะ:
- ระบบใช้ **Database-per-Service** → `activity-db` ไม่สามารถ JOIN กับ `auth-db` ได้
- ถ้าต้องการแสดง username ใน activity timeline จะต้อง query `auth-db` ทุกครั้ง ซึ่ง:
  - ต้องทำ network call ข้าม service
  - auth-service อาจล่มได้
  - เพิ่ม latency
- จึงเก็บ `username` ณ เวลาที่ event เกิดขึ้น (point-in-time snapshot) เพื่อให้ activity-service query ได้ด้วยตัวเอง

**ข้อเสีย:** ถ้า user เปลี่ยน username ภายหลัง ข้อมูลใน activities จะยังคงเป็น username เดิม แต่สำหรับ activity log นี่เป็นพฤติกรรมที่ถูกต้อง (บันทึกตามความเป็นจริง ณ เวลานั้น)

---

## 6. อธิบาย Fire-and-Forget Pattern

**Fire-and-Forget** คือ pattern ที่ส่ง request แล้วไม่รอผลลัพธ์ตอบกลับ

ในระบบนี้ใช้ใน `logActivity()`:
```javascript
fetch(`${ACTIVITY_URL}/api/activity/internal`, { ... })
  .catch(() => {
    console.warn('[auth] activity-service unreachable');
  });
// ไม่มี await → function return ทันที ไม่หยุดรอ
```

**ทำไมต้องใช้:**
- Activity tracking เป็น secondary concern — ไม่ควรทำให้ core operation (login, register) ล้มเหลว
- ถ้า await แล้ว activity-service ล่มหรือช้า → user จะ login ไม่ได้ ซึ่งไม่ถูกต้อง
- Pattern นี้ทำให้ระบบมี **fault tolerance** — service หลักไม่ขึ้นอยู่กับ service รอง

**ข้อเสีย:** ถ้า activity-service ล่ม activities จะหาย (ไม่ถูกบันทึก) จนกว่า service จะกลับมา

---

## 7. สิ่งที่ได้เรียนรู้

- **Database-per-Service Pattern** และ trade-off ระหว่าง data consistency กับ service independence
- **Denormalization** เป็น pattern ที่จำเป็นเมื่อ service ไม่สามารถ query ข้าม database ได้
- **Fire-and-Forget** ช่วยให้ระบบมี fault tolerance โดยไม่ผูก core service กับ supporting service
- วิธี Deploy Node.js service บน Railway และการตั้งค่า environment variables
- ลำดับการ deploy มีความสำคัญ — activity-service ต้อง deploy ก่อนเพื่อให้ได้ URL

---

## 8. แนวทางการพัฒนาต่อ

- เพิ่ม authentication สำหรับ `/api/activity/internal` (เช่น internal API key) เพื่อป้องกัน service อื่นที่ไม่ได้รับอนุญาตส่ง event มา
- ใช้ Message Queue (เช่น RabbitMQ, Redis Pub/Sub) แทน direct HTTP call เพื่อ activity tracking ที่ reliable กว่า
- เพิ่ม pagination ให้กับ `/api/activity/me` สำหรับ user ที่มี activities จำนวนมาก
- Refresh token mechanism เพื่อ extend session โดยไม่ต้อง login ใหม่
