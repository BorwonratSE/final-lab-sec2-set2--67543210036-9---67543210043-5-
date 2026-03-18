require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const pool    = require('./db/db');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));

async function start() {
  let retries = 10;
  while (retries > 0) {
    try {
      await pool.query('SELECT 1');
      console.log('[auth-service] DB connected');
      break;
    } catch (e) {
      console.log(`[auth-service] Waiting DB... (${retries} left)`);
      retries--;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  if (retries === 0) {
    console.error('[auth-service] Could not connect to DB, exiting');
    process.exit(1);
  }
  app.listen(PORT, () => console.log(`[auth-service] Running on :${PORT}`));
}

start();
