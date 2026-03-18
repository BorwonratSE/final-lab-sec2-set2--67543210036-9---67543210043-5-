require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const pool    = require('./db/db');

const app  = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

app.use('/api/tasks', require('./routes/tasks'));

async function start() {
  let retries = 10;
  while (retries > 0) {
    try {
      await pool.query('SELECT 1');
      console.log('[task-service] DB connected');
      break;
    } catch (e) {
      console.log(`[task-service] Waiting DB... (${retries} left)`);
      retries--;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  if (retries === 0) {
    console.error('[task-service] Could not connect to DB, exiting');
    process.exit(1);
  }
  app.listen(PORT, () => console.log(`[task-service] Running on :${PORT}`));
}

start();
