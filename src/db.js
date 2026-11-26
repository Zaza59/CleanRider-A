'use strict';

const { Pool } = require('pg');
const { project } = require('./content');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add your Neon connection string to the environment.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});
pool.on('error', (err) => console.error('Postgres pool error:', err.message));

const q = (text, params) => pool.query(text, params);

const now = () => new Date().toISOString();
const CATEGORY_IDS = project.bom.categories.map((c) => c.id);
const PHASE_IDS = project.plan.phases.map((p) => p.id);
const TEST_IDS = project.tests.items.map((t) => t.id);

const COMPONENT_STATUS = ['needed', 'ordered', 'received', 'installed'];
const PHASE_STATUS = ['todo', 'active', 'done'];
const TEST_STATUS = ['pending', 'pass', 'fail'];

// Creates the schema and seeds the catalogue once. Safe to run on every boot.
async function init() {
  await q(`
    CREATE TABLE IF NOT EXISTS components (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      spec       TEXT NOT NULL DEFAULT '',
      qty        TEXT NOT NULL DEFAULT '1',
      category   TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'needed',
      assignee   TEXT NOT NULL DEFAULT '',
      note       TEXT NOT NULL DEFAULT '',
      position   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS phase_status (
      id         TEXT PRIMARY KEY,
      status     TEXT NOT NULL DEFAULT 'todo',
      progress   INTEGER NOT NULL DEFAULT 0,
      note       TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS test_status (
      id         TEXT PRIMARY KEY,
      status     TEXT NOT NULL DEFAULT 'pending',
      note       TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notes (
      id         SERIAL PRIMARY KEY,
      author     TEXT NOT NULL,
      body       TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity (
      id         SERIAL PRIMARY KEY,
      kind       TEXT NOT NULL,
      target     TEXT NOT NULL,
      detail     TEXT NOT NULL DEFAULT '',
      author     TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);

  // Seed the catalogue only when the table is empty; afterwards the team edits freely.
  const { rows } = await q('SELECT COUNT(*)::int AS n FROM components');
  if (rows[0].n === 0) {
    let position = 0;
    for (const cat of project.bom.categories) {
      for (const item of cat.items) {
        await q(
          `INSERT INTO components (id, name, spec, qty, category, status, position, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'needed', $6, $7, $7)
           ON CONFLICT (id) DO NOTHING`,
          [item.id, item.name, item.spec || '', String(item.qty ?? '1'), cat.id, position++, now()]
        );
      }
    }
  }

  for (const id of PHASE_IDS) {
    await q('INSERT INTO phase_status (id, status, progress, updated_at) VALUES ($1, $2, 0, $3) ON CONFLICT (id) DO NOTHING', [id, 'todo', now()]);
  }
  for (const id of TEST_IDS) {
    await q('INSERT INTO test_status (id, status, updated_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING', [id, 'pending', now()]);
  }
}

// ---------- components ----------
async function getComponents() {
  return (await q('SELECT * FROM components ORDER BY position, id')).rows;
}
async function getComponent(id) {
  return (await q('SELECT * FROM components WHERE id = $1', [id])).rows[0];
}
async function addComponent({ name, spec = '', qty = '1', category }) {
  const cat = CATEGORY_IDS.includes(category) ? category : CATEGORY_IDS[0];
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { rows } = await q(
        `INSERT INTO components (id, name, spec, qty, category, status, position, created_at, updated_at)
         VALUES (
           'c' || (SELECT COALESCE(MAX(SUBSTRING(id FROM 2)::int), 0) + 1 FROM components WHERE id ~ '^c[0-9]+$'),
           $1, $2, $3, $4, 'needed',
           (SELECT COALESCE(MAX(position), -1) + 1 FROM components),
           $5, $5)
         RETURNING *`,
        [name, spec, qty, cat, now()]
      );
      return rows[0];
    } catch (e) {
      if (e.code !== '23505') throw e; // retry only on id collision
    }
  }
  throw new Error('could not allocate component id');
}
async function deleteComponent(id) {
  return (await q('DELETE FROM components WHERE id = $1', [id])).rowCount > 0;
}
async function setComponentStatus(id, { status, assignee, note }) {
  const cur = await getComponent(id);
  if (!cur) throw new Error('unknown component');
  if (status !== undefined && !COMPONENT_STATUS.includes(status)) throw new Error('bad status');
  await q('UPDATE components SET status = $1, assignee = $2, note = $3, updated_at = $4 WHERE id = $5',
    [status ?? cur.status, assignee ?? cur.assignee, note ?? cur.note, now(), id]);
}

// ---------- phases ----------
async function getPhaseStatuses() {
  return (await q('SELECT * FROM phase_status')).rows;
}
async function setPhaseStatus(id, { status, progress, note }) {
  if (!PHASE_IDS.includes(id)) throw new Error('unknown phase');
  if (status !== undefined && !PHASE_STATUS.includes(status)) throw new Error('bad status');
  const cur = (await q('SELECT * FROM phase_status WHERE id = $1', [id])).rows[0] || {};
  let p = progress === undefined ? cur.progress ?? 0 : Number(progress);
  if (Number.isNaN(p)) p = 0;
  p = Math.max(0, Math.min(100, Math.round(p)));
  let s = status ?? cur.status ?? 'todo';
  if (p === 100) s = 'done';
  else if (s === 'done' && p < 100) p = 100;
  await q(
    `INSERT INTO phase_status (id, status, progress, note, updated_at) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, progress = EXCLUDED.progress,
       note = EXCLUDED.note, updated_at = EXCLUDED.updated_at`,
    [id, s, p, note ?? cur.note ?? '', now()]
  );
}

// ---------- tests ----------
async function getTestStatuses() {
  return (await q('SELECT * FROM test_status')).rows;
}
async function setTestStatus(id, { status, note }) {
  if (!TEST_IDS.includes(id)) throw new Error('unknown test');
  if (status !== undefined && !TEST_STATUS.includes(status)) throw new Error('bad status');
  const cur = (await q('SELECT * FROM test_status WHERE id = $1', [id])).rows[0] || {};
  await q(
    `INSERT INTO test_status (id, status, note, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, updated_at = EXCLUDED.updated_at`,
    [id, status ?? cur.status ?? 'pending', note ?? cur.note ?? '', now()]
  );
}

// ---------- notes ----------
async function addNote(author, body) {
  return (await q('INSERT INTO notes (author, body, created_at) VALUES ($1, $2, $3) RETURNING *', [author, body, now()])).rows[0];
}
async function getNotes(limit = 100) {
  return (await q('SELECT * FROM notes ORDER BY id DESC LIMIT $1', [limit])).rows;
}

// ---------- activity ----------
async function addActivity({ kind, target, detail = '', author = '' }) {
  await q('INSERT INTO activity (kind, target, detail, author, created_at) VALUES ($1, $2, $3, $4, $5)',
    [kind, target, detail, author, now()]);
}
async function getActivity(limit = 40) {
  return (await q('SELECT * FROM activity ORDER BY id DESC LIMIT $1', [limit])).rows;
}

module.exports = {
  pool, init,
  COMPONENT_STATUS, PHASE_STATUS, TEST_STATUS,
  getComponents, getComponent, addComponent, deleteComponent, setComponentStatus,
  getPhaseStatuses, setPhaseStatus,
  getTestStatuses, setTestStatus,
  addNote, getNotes,
  addActivity, getActivity,
};
