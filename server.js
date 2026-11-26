'use strict';

const path = require('node:path');
const express = require('express');
const { project } = require('./src/content');
const store = require('./src/db');

const app = express();
const PORT = Number(process.env.PORT) || 12000;

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const clean = (v, max) => (typeof v === 'string' ? v.slice(0, max).trim() : '');
const authorOf = (req) => clean(req.body?.author, 60) || 'عضو الفريق';

app.get('/healthz', wrap(async (_req, res) => {
  await store.pool.query('SELECT 1');
  res.json({ ok: true });
}));

app.get('/api/project', wrap(async (_req, res) => {
  const [components, phases, tests, notes, activity] = await Promise.all([
    store.getComponents(),
    store.getPhaseStatuses(),
    store.getTestStatuses(),
    store.getNotes(),
    store.getActivity(),
  ]);
  res.json({ project, components, phases, tests, notes, activity });
}));

// ---------- components: add / delete / update ----------
app.post('/api/components', wrap(async (req, res) => {
  const name = clean(req.body?.name, 200);
  const spec = clean(req.body?.spec, 500);
  const qty = clean(req.body?.qty, 40) || '1';
  const category = clean(req.body?.category, 40);

  if (name.length < 2) return res.status(400).json({ error: 'invalid_name' });
  if (!project.bom.categories.some((c) => c.id === category)) {
    return res.status(400).json({ error: 'invalid_category' });
  }

  const component = await store.addComponent({ name, spec, qty, category });
  await store.addActivity({ kind: 'component', target: component.id, detail: 'added', author: authorOf(req) });
  res.json({ ok: true, component });
}));

app.delete('/api/components/:id', wrap(async (req, res) => {
  const removed = await store.deleteComponent(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not_found' });
  await store.addActivity({ kind: 'component', target: req.params.id, detail: 'deleted', author: authorOf(req) });
  res.json({ ok: true });
}));

app.patch('/api/components/:id', wrap(async (req, res) => {
  try {
    await store.setComponentStatus(req.params.id, {
      status: req.body.status,
      assignee: req.body.assignee === undefined ? undefined : clean(req.body.assignee, 60),
      note: req.body.note === undefined ? undefined : clean(req.body.note, 500),
    });
    await store.addActivity({ kind: 'component', target: req.params.id, detail: req.body.status || '', author: authorOf(req) });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

app.patch('/api/phases/:id', wrap(async (req, res) => {
  try {
    await store.setPhaseStatus(req.params.id, {
      status: req.body.status,
      progress: req.body.progress,
      note: req.body.note === undefined ? undefined : clean(req.body.note, 500),
    });
    await store.addActivity({ kind: 'phase', target: req.params.id, detail: String(req.body.progress ?? req.body.status ?? ''), author: authorOf(req) });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

app.patch('/api/tests/:id', wrap(async (req, res) => {
  try {
    await store.setTestStatus(req.params.id, {
      status: req.body.status,
      note: req.body.note === undefined ? undefined : clean(req.body.note, 500),
    });
    await store.addActivity({ kind: 'test', target: req.params.id, detail: req.body.status || '', author: authorOf(req) });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

// ---------- notes ----------
app.get('/api/notes', wrap(async (_req, res) => res.json({ notes: await store.getNotes() })));

app.post('/api/notes', wrap(async (req, res) => {
  const body = clean(req.body?.body, 2000);
  if (!body) return res.status(400).json({ error: 'empty' });
  const note = await store.addNote(authorOf(req), body);
  res.json({ ok: true, note });
}));

app.get('/api/activity', wrap(async (_req, res) => res.json({ activity: await store.getActivity() })));

app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

// ---------- static ----------
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

store.init()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`CleanRider-A running on http://0.0.0.0:${PORT} (Postgres/Neon)`);
    });
  })
  .catch((err) => {
    console.error('Database init failed:', err);
    process.exit(1);
  });
