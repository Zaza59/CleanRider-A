'use strict';

/* ============================================================
   CleanRider-A team workspace — client app
   ============================================================ */

const state = {
  project: null,
  components: {},
  componentList: [],
  phases: {},
  tests: {},
  notes: [],
  activity: [],
  author: localStorage.getItem('cr_author') || '',
  route: 'dashboard',
};

/* ---------- tiny helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

function fmtDate(iso) {
  try {
    return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch { return iso; }
}
function initials(name) {
  const n = (name || 'ف').trim();
  return n.slice(0, 1).toUpperCase();
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'request_failed');
  return data;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.hidden = true; }, 260);
  }, 2200);
}

function setSaved(saving) {
  const el = $('#saved-indicator');
  if (!el) return;
  el.classList.toggle('saving', saving);
  el.textContent = saving ? 'جارٍ الحفظ…' : 'محفوظ';
}

/* ---------- status labels ---------- */
const LABELS = {
  component: { needed: 'مطلوب', ordered: 'قيد التوريد', received: 'تم الاستلام', installed: 'تم التركيب' },
  phase: { todo: 'لم يبدأ', active: 'قيد العمل', done: 'مكتمل' },
  test: { pending: 'لم يُنفذ', pass: 'ناجح', fail: 'راسب' },
};

/* ---------- navigation ---------- */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  idea: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.5 1 2.5h6c0-1 .4-1.9 1-2.5A6 6 0 0 0 12 3z"/>',
  specs: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  drawings: '<path d="M3 4h18v16H3z"/><path d="M3 9h18M8 9v11"/><path d="M12 13h5M12 16h3"/>',
  bom: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  power: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
  autonomy: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M7 12h0M17 12h0"/>',
  plan: '<path d="M4 5h6v6H4zM14 13h6v6h-6z"/><path d="M10 8h4a3 3 0 0 1 3 3v2"/>',
  tests: '<path d="M9 11l2 2 4-4"/><rect x="4" y="4" width="16" height="16" rx="3"/>',
  maintenance: '<path d="M14 6a4 4 0 0 1-5 5L5 15l4 4 4-4a4 4 0 0 1 5-5l-3 3-3-3 3-3z"/>',
  safety: '<path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  future: '<path d="M5 15c-1 2-1 4-1 4s2 0 4-1M9 15l6-9 3-1-1 3-9 6M9 15l-2 2"/>',
  notes: '<path d="M4 5h16v11H9l-4 4V5z"/><path d="M8 9h8M8 12h5"/>',
};

const NAV = [
  { group: 'المشروع', items: [
    ['dashboard', 'لوحة المتابعة'], ['idea', 'الفكرة'], ['specs', 'المواصفات'], ['drawings', 'الرسومات'],
  ]},
  { group: 'البناء', items: [
    ['bom', 'قائمة المكونات'], ['power', 'الطاقة والشمسية'], ['autonomy', 'القيادة الذاتية'], ['plan', 'خطة التنفيذ'], ['tests', 'اختبارات القبول'],
  ]},
  { group: 'التشغيل', items: [
    ['maintenance', 'التشغيل والصيانة'], ['safety', 'الأمان'], ['future', 'تطويرات مستقبلية'],
  ]},
  { group: 'الفريق', items: [['notes', 'ملاحظات الفريق']] },
];

const TITLES = {
  dashboard: ['لوحة المتابعة', 'نظرة شاملة على تقدم المشروع'],
  idea: ['الفكرة', 'ما الذي تغيّر عن التصميم الأصلي'],
  specs: ['المواصفات العامة', 'القيم التقديرية للتصميم'],
  drawings: ['الرسومات التوضيحية', 'منظر جانبي، دورة العمل، ومسارات الطاقة والهواء'],
  bom: ['قائمة المكونات', 'تتبّع التوريد والتركيب — أضف أو احذف البنود'],
  power: ['الطاقة والمنظومة الشمسية', 'الأحمال والحسابات وسلامة التصميم الكهربائي'],
  autonomy: ['القيادة الذاتية', 'البنية العامة والوظائف وقواعد الأمان'],
  plan: ['خطة التنفيذ', 'تسع مراحل مع نسب الإنجاز'],
  tests: ['اختبارات القبول', 'معايير القبول قبل التجربة الميدانية'],
  maintenance: ['التشغيل والصيانة', 'الروتين اليومي وجدول الصيانة'],
  safety: ['الأمان', 'سلامة الجهاز واعتبارات المستشفيات والتراخيص'],
  future: ['تطويرات مستقبلية', 'أفكار للمراحل القادمة'],
  notes: ['ملاحظات الفريق', 'لوحة نقاش وملاحظات مشتركة'],
};

/* ============================================================
   Startup / data
   ============================================================ */
async function startApp() {
  renderNav();
  await loadData();
  navigate(location.hash.replace(/^#\/?/, '') || 'dashboard');
}

async function loadData() {
  const data = await api('/api/project');
  state.project = data.project;
  state.componentList = data.components;
  state.components = Object.fromEntries(data.components.map((c) => [c.id, c]));
  state.phases = Object.fromEntries(data.phases.map((p) => [p.id, p]));
  state.tests = Object.fromEntries(data.tests.map((t) => [t.id, t]));
  state.notes = data.notes;
  state.activity = data.activity;
}

/* ============================================================
   Router
   ============================================================ */
function renderNav() {
  const nav = $('#nav');
  nav.innerHTML = NAV.map((g) => `
    <div class="nav-group-label">${esc(g.group)}</div>
    ${g.items.map(([key, label]) => `
      <button class="nav-item" data-route="${key}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[key]}</svg>
        <span>${esc(label)}</span>
      </button>`).join('')}
  `).join('');
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-item');
    if (!btn) return;
    navigate(btn.dataset.route);
    if (window.innerWidth <= 860) {
      $('#sidebar').classList.remove('open');
      $('#sidebar-scrim').classList.remove('show');
    }
  });
}

function navigate(route) {
  if (!TITLES[route]) route = 'dashboard';
  state.route = route;
  if (location.hash !== `#/${route}`) history.replaceState(null, '', `#/${route}`);
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.route === route));
  const [title, sub] = TITLES[route];
  $('#page-title').textContent = title;
  $('#page-sub').textContent = sub;
  render();
  $('.main').scrollTo?.({ top: 0 });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function render() {
  const view = $('#view');
  const fn = RENDER[state.route];
  view.innerHTML = fn ? fn() : '';
}

/* ============================================================
   Derived metrics
   ============================================================ */
function metrics() {
  const comps = Object.values(state.components);
  const phases = state.project.plan.phases.map((p) => state.phases[p.id] || { progress: 0, status: 'todo' });
  const tests = state.project.tests.items.map((t) => state.tests[t.id] || { status: 'pending' });
  const count = (s) => comps.filter((c) => c.status === s).length;
  const totalComp = state.componentList.length;
  const acquired = count('received') + count('installed');
  const phaseAvg = Math.round(phases.reduce((a, p) => a + (p.progress || 0), 0) / phases.length);
  const phasesDone = phases.filter((p) => p.status === 'done').length;
  const testsPassed = tests.filter((t) => t.status === 'pass').length;
  const testsRun = tests.filter((t) => t.status !== 'pending').length;
  return {
    totalComp, acquired, installed: count('installed'), received: count('received'),
    ordered: count('ordered'), needed: count('needed'),
    phaseAvg, phasesDone, phasesTotal: phases.length,
    testsPassed, testsRun, testsTotal: tests.length,
  };
}

function ringSvg(percent) {
  const r = 54, c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, percent)) / 100);
  return `
    <div class="ring">
      <svg width="132" height="132" viewBox="0 0 132 132">
        <circle cx="66" cy="66" r="${r}" fill="none" stroke="#e4ecea" stroke-width="11"/>
        <circle cx="66" cy="66" r="${r}" fill="none" stroke="url(#ringGrad)" stroke-width="11"
          stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
        <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#12b886"/><stop offset="100%" stop-color="#0c7a62"/>
        </linearGradient></defs>
      </svg>
      <div class="ring-label"><div><b>${percent}%</b><br><span>إنجاز البناء</span></div></div>
    </div>`;
}

/* ============================================================
   Views
   ============================================================ */
const RENDER = {};

RENDER.dashboard = () => {
  const m = metrics();
  const p = state.project;
  const statCards = p.meta.stats.map((s) => `<div class="stat"><div class="v">${esc(s.value)}</div><div class="l">${esc(s.label)}</div></div>`).join('');
  const recentActivity = state.activity.slice(0, 7);
  const recentNotes = state.notes.slice(0, 3);

  return `
    <div class="hero">
      <span class="eyebrow" style="background:rgba(255,255,255,.14);color:#c9ffe9">${esc(p.meta.version)}</span>
      <h1>${esc(p.meta.name)}</h1>
      <p class="tagline">${esc(p.meta.tagline)}</p>
      <div class="hero-badges">
        <span class="hero-badge">فريق التطوير</span>
        <span class="hero-badge">آخر تحديث <b>${fmtDate(new Date().toISOString()).split('،')[0]}</b></span>
      </div>
      <div class="stat-row">${statCards}</div>
    </div>

    <div class="card" style="margin-top:1rem">
      <div class="notice"><span class="notice-icon">⚠️</span><div>${esc(p.meta.notice)}</div></div>
    </div>

    <div class="overview" style="margin-top:1rem">
      <div class="card ring-card">
        ${ringSvg(m.phaseAvg)}
        <div class="metric-list">
          <div class="metric">
            <div class="metric-top"><span>المكونات المُقتناة (استلام + تركيب)</span><span>${m.acquired}/${m.totalComp}</span></div>
            <div class="bar"><i style="width:${pct(m.acquired, m.totalComp)}%"></i></div>
          </div>
          <div class="metric">
            <div class="metric-top"><span>المراحل المكتملة</span><span>${m.phasesDone}/${m.phasesTotal}</span></div>
            <div class="bar info"><i style="width:${pct(m.phasesDone, m.phasesTotal)}%"></i></div>
          </div>
          <div class="metric">
            <div class="metric-top"><span>اختبارات القبول الناجحة</span><span>${m.testsPassed}/${m.testsTotal}</span></div>
            <div class="bar solar"><i style="width:${pct(m.testsPassed, m.testsTotal)}%"></i></div>
          </div>
        </div>
      </div>

      <div class="card">
        <h4 style="margin-bottom:.8rem">حالة التوريد</h4>
        <div class="mini-stats">
          <div class="mini-stat"><div class="v">${m.needed}</div><div class="l">مطلوب</div></div>
          <div class="mini-stat"><div class="v" style="color:var(--warn)">${m.ordered}</div><div class="l">قيد التوريد</div></div>
          <div class="mini-stat"><div class="v" style="color:var(--info)">${m.received}</div><div class="l">تم الاستلام</div></div>
          <div class="mini-stat"><div class="v" style="color:var(--ok)">${m.installed}</div><div class="l">تم التركيب</div></div>
        </div>
        <button class="btn btn-ghost btn-block" style="margin-top:.8rem" data-goto="bom">فتح قائمة المكونات ←</button>
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:1rem">
      <div class="card">
        <div class="section-head" style="margin-bottom:.6rem"><h4>أحدث النشاطات</h4></div>
        ${recentActivity.length ? `<div class="activity">${recentActivity.map(activityRow).join('')}</div>` : '<p class="muted">لا يوجد نشاط بعد. ابدأ بتحديث حالة مكوّن أو مرحلة.</p>'}
      </div>
      <div class="card">
        <div class="section-head" style="margin-bottom:.6rem"><h4>أحدث ملاحظات الفريق</h4>
          <button class="btn btn-ghost btn-sm" data-goto="notes">الكل ←</button></div>
        ${recentNotes.length ? recentNotes.map((n) => `
          <div style="padding:.5rem 0;border-bottom:1px dashed var(--line)">
            <div class="note-head"><b>${esc(n.author)}</b><time>${fmtDate(n.created_at)}</time></div>
            <div style="font-size:.88rem;color:var(--ink-soft);white-space:pre-wrap">${esc(n.body)}</div>
          </div>`).join('') : '<p class="muted">لا توجد ملاحظات بعد.</p>'}
      </div>
    </div>
  `;
};

function activityRow(a) {
  const kindLabel = { component: 'مكوّن', phase: 'مرحلة', test: 'اختبار' }[a.kind] || 'تحديث';
  let text;
  if (a.kind === 'component' && a.detail === 'added') {
    text = `${esc(a.author || 'الفريق')} أضاف مكوّنًا <b>${esc(a.target)}</b>`;
  } else if (a.kind === 'component' && a.detail === 'deleted') {
    text = `${esc(a.author || 'الفريق')} حذف مكوّنًا <b>${esc(a.target)}</b>`;
  } else {
    const detail = a.detail ? ` → ${esc(LABELS[a.kind]?.[a.detail] || a.detail)}` : '';
    text = `${esc(a.author || 'الفريق')} حدّث ${kindLabel} <b>${esc(a.target)}</b>${detail}`;
  }
  return `<div class="activity-row"><span class="activity-dot"></span>
    <span>${text}</span>
    <span class="when">${fmtDate(a.created_at)}</span></div>`;
}

RENDER.idea = () => {
  const p = state.project.idea;
  const cmp = p.comparison;
  return `
    <div class="card">
      <span class="eyebrow">الفكرة</span>
      <p class="lead">${esc(p.description)}</p>
    </div>
    <div class="card">
      <div class="callout solar">
        <h4 style="margin-bottom:.4rem">${esc(p.whyNotOnboard.title)}</h4>
        <p>${esc(p.whyNotOnboard.text)}</p>
      </div>
    </div>
    <div class="card">
      <div class="callout" style="margin-bottom:1rem">${esc(state.project.meta.changeNote)}</div>
      <div class="table-wrap">
        <table>
          <thead><tr>${cmp.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${cmp.rows.map((r) => `<tr>${r.map((c, i) => i === 0 ? `<td style="font-weight:700">${esc(c)}</td>` : `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
};

RENDER.specs = () => {
  const s = state.project.specs;
  return `
    <div class="card">
      <div class="section-head"><div><h3>${esc(s.title)}</h3><p>${esc(s.subtitle)}</p></div></div>
      <div class="table-wrap">
        <table class="kv-table">
          <thead><tr><th>البند</th><th>القيمة التقديرية</th></tr></thead>
          <tbody>${s.rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
};

RENDER.drawings = () => {
  const d = state.project.drawings;
  return d.figures.map((f) => {
    let body = '';
    if (f.type === 'parts') {
      body = `<div class="parts-grid">${f.parts.map((pt) => `
        <div class="part"><div class="pn">${pt.n}</div><div><div class="pt">${esc(pt.name)}</div><div class="pd">${esc(pt.desc)}</div></div></div>`).join('')}</div>
        <p class="muted small" style="margin-top:.8rem">${esc(f.note)}</p>`;
    } else if (f.type === 'cycle') {
      body = `<div class="cycle">${f.steps.map((s, i) => `
        <div class="cycle-step"><div class="cs-n">${i + 1}</div><div class="cs-t">${esc(s.title)}</div><div class="cs-d">${esc(s.desc)}</div></div>`).join('')}</div>`;
    } else if (f.type === 'paths') {
      body = `
        <div style="margin-bottom:1rem"><div class="eyebrow">مسار الطاقة</div>
          <div class="path-flow">${f.energyPath.map((n, i) => `${i ? '<span class="path-arrow">←</span>' : ''}<span class="path-node">${esc(n)}</span>`).join('')}</div></div>
        <div><div class="eyebrow">مسار الهواء والمخلفات</div>
          <div class="path-flow air">${f.airPath.map((n, i) => `${i ? '<span class="path-arrow">←</span>' : ''}<span class="path-node">${esc(n)}</span>`).join('')}</div></div>`;
    }
    return `<div class="card"><div class="section-head"><h3>${esc(f.title)}</h3></div>${body}</div>`;
  }).join('');
};

/* ---------- BOM ---------- */
let bomFilter = 'all';
RENDER.bom = () => {
  const bom = state.project.bom;
  const cats = bom.categories.map((cat) => ({
    ...cat,
    items: state.componentList.filter((c) => c.category === cat.id),
  }));
  const allCount = state.componentList.length;
  const chips = [{ id: 'all', title: `الكل (${allCount})` }, ...cats.map((c) => ({ id: c.id, title: c.title.replace(/^[أ-ي]\)\s*/, '') }))];
  const visible = bomFilter === 'all' ? cats : cats.filter((c) => c.id === bomFilter);

  const catHtml = visible.map((cat) => {
    const done = cat.items.filter((i) => i.status === 'installed').length;
    const body = cat.items.length
      ? cat.items.map((item, idx) => bomItem(item, idx + 1)).join('')
      : '<div class="bom-empty muted">لا توجد مكونات في هذا القسم — أضف واحدًا من النموذج أعلاه.</div>';
    return `
    <div class="card bom-cat">
      <div class="bom-cat-head"><h4>${esc(cat.title)}</h4><span class="count">${done}/${cat.items.length} مُركّب</span></div>
      ${body}
    </div>`;
  }).join('');

  const options = bom.categories.map((c) => `<option value="${c.id}">${esc(c.title)}</option>`).join('');

  return `
    <div class="section-head"><div><h3>${esc(bom.title)}</h3><p>${esc(bom.subtitle)}</p></div></div>

    <div class="card bom-add">
      <h4>إضافة مكوّن جديد</h4>
      <form id="add-component-form" class="bom-add-form">
        <label class="field"><span>اسم المكوّن</span><input id="add-name" placeholder="مثال: حساس مسافة" maxlength="200" required /></label>
        <label class="field"><span>العدد</span><input id="add-qty" placeholder="1" maxlength="40" /></label>
        <label class="field"><span>القسم</span><select id="add-category">${options}</select></label>
        <label class="field bom-add-spec"><span>المواصفات (اختياري)</span><input id="add-spec" placeholder="مثال: 12V، مدى 2 متر" maxlength="500" /></label>
        <button class="btn btn-primary" type="submit">إضافة المكوّن</button>
      </form>
    </div>

    <div class="bom-toolbar">
      ${chips.map((c) => `<button class="filter-chip ${bomFilter === c.id ? 'active' : ''}" data-filter="${c.id}">${esc(c.title)}</button>`).join('')}
    </div>
    ${catHtml}
    <div class="card" style="margin-top:1rem"><div class="callout solar">${esc(bom.costNote)}</div></div>`;
};

function bomItem(item, index) {
  const st = state.components[item.id] || item;
  const opts = Object.entries(LABELS.component).map(([v, l]) => `<option value="${v}" ${st.status === v ? 'selected' : ''}>${l}</option>`).join('');
  return `
    <div class="bom-item">
      <div class="bom-idx">${index}</div>
      <div class="bom-main">
        <div class="bom-name">${esc(item.name)}</div>
        <div class="bom-spec">${esc(item.spec)}</div>
        <div class="bom-meta"><span class="qty-badge">العدد: ${esc(item.qty)}</span>
          <span class="chip" data-status="${st.status}">${LABELS.component[st.status]}</span></div>
      </div>
      <div class="bom-controls">
        <select class="status-select" data-kind="component" data-id="${item.id}">${opts}</select>
        <div class="bom-fields">
          <input class="assignee-input" data-kind="component" data-id="${item.id}" data-field="assignee" placeholder="المسؤول…" value="${esc(st.assignee)}" maxlength="60" />
          <input class="note-input" data-kind="component" data-id="${item.id}" data-field="note" placeholder="ملاحظة / مورد…" value="${esc(st.note)}" maxlength="500" />
        </div>
        <button class="bom-delete" type="button" data-delete-component="${item.id}" data-name="${esc(item.name)}" title="حذف المكوّن">حذف</button>
      </div>
    </div>`;
}

/* ---------- Power ---------- */
RENDER.power = () => {
  const p = state.project.power;
  return `
    <div class="card">
      <div class="section-head"><h3>${esc(p.title)}</h3></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>الحمل</th><th>متوسط الاستهلاك</th><th>ملاحظات</th></tr></thead>
          <tbody>${p.loads.map((r, i) => `<tr ${i === p.loads.length - 1 ? 'style="font-weight:800;background:var(--brand-soft)"' : ''}>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
    </div>
    <div class="grid grid-2" style="margin-top:1rem">
      <div class="card"><h4 style="margin-bottom:.6rem">الروبوت</h4><ul class="bullets">${p.robotNotes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
      <div class="card"><h4 style="margin-bottom:.6rem">المحطة الشمسية</h4><ul class="bullets">${p.stationNotes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
    </div>
    <div class="card" style="margin-top:1rem"><h4 style="margin-bottom:.6rem">سلامة التصميم الكهربائي</h4><ul class="bullets check">${p.electricalSafety.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
};

/* ---------- Autonomy ---------- */
RENDER.autonomy = () => {
  const a = state.project.autonomy;
  return `
    <div class="card">
      <div class="section-head"><h3>${esc(a.title)}</h3></div>
      <div>${a.layers.map(([n, d]) => `<div class="layer"><div class="ln">${esc(n)}</div><div class="ld">${esc(d)}</div></div>`).join('')}</div>
    </div>
    <div class="card"><h4 style="margin-bottom:.6rem">الوظائف الأساسية</h4>
      <div class="grid grid-2">${a.functions.map(([n, d]) => `<div class="mode"><b>${esc(n)}</b><span>${esc(d)}</span></div>`).join('')}</div>
    </div>
    <div class="card"><h4 style="margin-bottom:.6rem">أهم قواعد الأمان في البرنامج</h4>
      <ul class="bullets warn">${a.safetyRules.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
    <div class="card"><h4 style="margin-bottom:.6rem">الأوضاع</h4>
      <div class="mode-grid">${a.modes.map(([n, d]) => `<div class="mode"><b>${esc(n)}</b><span>${esc(d)}</span></div>`).join('')}</div></div>`;
};

/* ---------- Plan ---------- */
RENDER.plan = () => {
  const plan = state.project.plan;
  return `
    <div class="section-head"><div><h3>${esc(plan.title)}</h3><p>${esc(plan.subtitle)}</p></div></div>
    <div class="phase-list">
      ${plan.phases.map((ph) => {
        const st = state.phases[ph.id] || { status: 'todo', progress: 0, note: '' };
        const opts = Object.entries(LABELS.phase).map(([v, l]) => `<option value="${v}" ${st.status === v ? 'selected' : ''}>${l}</option>`).join('');
        return `
        <div class="phase" data-status="${st.status}" data-phase="${ph.id}">
          <div class="phase-num">${ph.n}</div>
          <div class="phase-body">
            <h4>${esc(ph.title)}</h4>
            <div class="phase-meta">
              <span class="duration">${esc(ph.duration)}</span>
              <span class="chip" data-status="${st.status}">${LABELS.phase[st.status]}</span>
              <select class="status-select" data-kind="phase" data-id="${ph.id}">${opts}</select>
            </div>
            <div class="phase-tasks">${esc(ph.tasks)}</div>
            <div class="phase-progress">
              <input type="range" min="0" max="100" step="5" value="${st.progress}" data-kind="phase" data-id="${ph.id}" />
              <div class="bar"><i style="width:${st.progress}%"></i></div>
              <span class="pct">${st.progress}%</span>
            </div>
            <input class="note-input" style="margin-top:.5rem;border:1px solid var(--line);background:var(--surface-2);border-radius:8px;padding:.4rem .6rem;width:100%" data-kind="phase" data-id="${ph.id}" data-field="note" placeholder="ملاحظة على المرحلة…" value="${esc(st.note)}" maxlength="500" />
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="grid grid-2" style="margin-top:1rem">
      <div class="card"><h4 style="margin-bottom:.6rem">الأدوات والورش المطلوبة</h4><ul class="bullets">${plan.tools.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
      <div class="card"><div class="callout"><h4 style="margin-bottom:.4rem">الخطوة المقترحة</h4><p>${esc(plan.suggestedStep)}</p></div></div>
    </div>`;
};

/* ---------- Tests ---------- */
RENDER.tests = () => {
  const tests = state.project.tests;
  const passed = tests.items.filter((t) => state.tests[t.id]?.status === 'pass').length;
  const failed = tests.items.filter((t) => state.tests[t.id]?.status === 'fail').length;
  return `
    <div class="section-head"><div><h3>${esc(tests.title)}</h3><p>${passed} ناجح · ${failed} راسب · ${tests.items.length - passed - failed} لم يُنفذ</p></div></div>
    <div class="card">
      ${tests.items.map((t) => {
        const st = state.tests[t.id] || { status: 'pending', note: '' };
        const seg = ['pass', 'fail', 'pending'].map((v) => `<button data-kind="test" data-id="${t.id}" data-v="${v}" class="${st.status === v ? 'on' : ''}">${LABELS.test[v]}</button>`).join('');
        return `
        <div class="test-row">
          <div class="test-main">
            <div class="test-name">${esc(t.name)} <span class="chip" data-status="${st.status}">${LABELS.test[st.status]}</span></div>
            <div class="test-detail"><b>الطريقة:</b> ${esc(t.method)}</div>
            <div class="test-detail"><b>معيار القبول:</b> ${esc(t.criteria)}</div>
            <input class="note-input" style="margin-top:.4rem;border:1px solid var(--line);background:var(--surface-2);border-radius:8px;padding:.35rem .6rem;width:100%;max-width:520px" data-kind="test" data-id="${t.id}" data-field="note" placeholder="ملاحظة نتيجة…" value="${esc(st.note)}" maxlength="500" />
          </div>
          <div class="seg">${seg}</div>
        </div>`;
      }).join('')}
    </div>`;
};

/* ---------- Maintenance ---------- */
RENDER.maintenance = () => {
  const m = state.project.maintenance;
  return `
    <div class="grid grid-2">
      <div class="card"><h4 style="margin-bottom:.6rem">الروتين اليومي للعامل المسؤول (5 دقائق)</h4>
        <ol class="bullets num">${m.daily.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div>
      <div class="card"><h4 style="margin-bottom:.6rem">جدول الصيانة</h4>
        ${m.schedule.map(([when, what]) => `<div class="timeline-item"><div class="tt">${esc(when)}</div><div class="td">${esc(what)}</div></div>`).join('')}</div>
    </div>
    <div class="card" style="margin-top:1rem"><div class="callout danger"><h4 style="margin-bottom:.5rem">ممنوع</h4><ul class="bullets warn">${m.prohibited.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div></div>`;
};

/* ---------- Safety ---------- */
RENDER.safety = () => {
  const s = state.project.safety;
  return `
    <div class="grid grid-2">
      <div class="card"><h4 style="margin-bottom:.6rem">الأمان في الجهاز</h4><ul class="bullets check">${s.device.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
      <div class="card"><h4 style="margin-bottom:.6rem">الاستخدام داخل المستشفيات</h4><ul class="bullets">${s.hospital.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
    </div>
    <div class="card" style="margin-top:1rem"><div class="callout solar"><h4 style="margin-bottom:.5rem">تراخيص وموافقات</h4><ul class="bullets">${s.licenses.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div></div>`;
};

/* ---------- Future ---------- */
RENDER.future = () => {
  const f = state.project.future;
  return `<div class="card"><h4 style="margin-bottom:.8rem">${esc(f.title)}</h4><ul class="bullets">${f.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
};

/* ---------- Notes ---------- */
RENDER.notes = () => {
  return `
    <div class="card">
      <div class="section-head" style="margin-bottom:.8rem"><h3>أضف ملاحظة للفريق</h3></div>
      <form id="note-form" class="note-composer">
        <input id="note-author" class="note-author" placeholder="اسمك (اختياري)" maxlength="60" value="${esc(state.author)}" />
        <textarea id="note-body" placeholder="اكتب ملاحظة، قرار، أو سؤال للفريق…" maxlength="2000" required></textarea>
        <div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary" type="submit">نشر الملاحظة</button>
          <span class="muted small" id="note-byline">ستظهر باسم: ${esc(state.author || 'عضو الفريق')}</span>
        </div>
      </form>
    </div>
    <div class="notes-feed" id="notes-feed">
      ${state.notes.length ? state.notes.map(noteCard).join('') : '<div class="card muted" style="text-align:center">لا توجد ملاحظات بعد — كن أول من يكتب.</div>'}
    </div>`;
};

function noteCard(n) {
  return `
    <div class="note">
      <div class="avatar">${esc(initials(n.author))}</div>
      <div>
        <div class="note-head"><b>${esc(n.author)}</b><time>${fmtDate(n.created_at)}</time></div>
        <div class="note-body">${esc(n.body)}</div>
      </div>
    </div>`;
}

/* ============================================================
   View event bindings
   ============================================================ */
async function persist(kind, id, patch) {
  setSaved(true);
  try {
    await api(`/api/${kind === 'component' ? 'components' : kind === 'phase' ? 'phases' : 'tests'}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...patch, author: state.author || '' }),
    });
    setSaved(false);
  } catch (e) {
    setSaved(false);
    toast('تعذّر الحفظ، حاول مجددًا');
  }
}

let viewDelegationReady = false;
function setupViewDelegation() {
  if (viewDelegationReady) return;
  viewDelegationReady = true;
  const view = $('#view');

  view.addEventListener('click', async (e) => {
    const goto = e.target.closest('[data-goto]');
    if (goto) { navigate(goto.dataset.goto); return; }

    const filter = e.target.closest('[data-filter]');
    if (filter) { bomFilter = filter.dataset.filter; render(); return; }

    const del = e.target.closest('[data-delete-component]');
    if (del) {
      const id = del.dataset.deleteComponent;
      const name = del.dataset.name || id;
      if (!confirm(`حذف المكوّن «${name}»؟ لا يمكن التراجع.`)) return;
      try {
        await api(`/api/components/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ author: state.author }) });
        state.componentList = state.componentList.filter((c) => c.id !== id);
        delete state.components[id];
        toast('تم حذف المكوّن');
        render();
      } catch { toast('تعذّر حذف المكوّن'); }
      return;
    }

    const segBtn = e.target.closest('.seg button');
    if (segBtn) {
      const { kind, id, v } = segBtn.dataset;
      if (state.tests[id]) state.tests[id].status = v;
      await persist(kind, id, { status: v });
      render();
    }
  });

  view.addEventListener('change', async (e) => {
    const sel = e.target.closest('.status-select');
    if (sel) {
      const { kind, id } = sel.dataset;
      const status = sel.value;
      if (kind === 'component' && state.components[id]) state.components[id].status = status;
      if (kind === 'phase' && state.phases[id]) state.phases[id].status = status;
      await persist(kind, id, { status });
      render();
      return;
    }

    const range = e.target.closest('input[type="range"][data-kind="phase"]');
    if (range) {
      const { id } = range.dataset;
      const progress = Number(range.value);
      if (state.phases[id]) state.phases[id].progress = progress;
      await persist('phase', id, { progress });
      render();
      return;
    }

    const input = e.target.closest('input[data-field]');
    if (input) {
      const { kind, id, field } = input.dataset;
      const val = input.value.trim();
      if (kind === 'component' && state.components[id]) state.components[id][field] = val;
      if (kind === 'phase' && state.phases[id]) state.phases[id][field] = val;
      if (kind === 'test' && state.tests[id]) state.tests[id][field] = val;
      await persist(kind, id, { [field]: val });
      toast('تم الحفظ');
    }
  });

  view.addEventListener('input', (e) => {
    const range = e.target.closest('input[type="range"][data-kind="phase"]');
    if (!range) return;
    const card = range.closest('.phase');
    const val = Number(range.value);
    card.querySelector('.pct').textContent = `${val}%`;
    card.querySelector('.bar > i').style.width = `${val}%`;
  });

  view.addEventListener('submit', async (e) => {
    if (e.target.id === 'add-component-form') {
      e.preventDefault();
      const name = $('#add-name').value.trim();
      if (name.length < 2) { toast('اكتب اسم المكوّن أولًا'); return; }
      const payload = {
        name,
        qty: $('#add-qty').value.trim() || '1',
        spec: $('#add-spec').value.trim(),
        category: $('#add-category').value,
        author: state.author,
      };
      try {
        const { component } = await api('/api/components', { method: 'POST', body: JSON.stringify(payload) });
        state.componentList.push(component);
        state.components[component.id] = component;
        toast('تمت إضافة المكوّن');
        render();
      } catch { toast('تعذّر إضافة المكوّن'); }
      return;
    }

    if (e.target.id !== 'note-form') return;
    e.preventDefault();
    const body = $('#note-body').value.trim();
    if (!body) return;
    const author = $('#note-author').value.trim();
    state.author = author;
    localStorage.setItem('cr_author', author);
    try {
      const { note } = await api('/api/notes', { method: 'POST', body: JSON.stringify({ body, author }) });
      state.notes.unshift(note);
      $('#note-body').value = '';
      const feed = $('#notes-feed');
      if (feed.querySelector('.card')) feed.innerHTML = '';
      feed.insertAdjacentHTML('afterbegin', noteCard(note));
      toast('تم نشر الملاحظة');
    } catch { toast('تعذّر نشر الملاحظة'); }
  });
}

/* ============================================================
   Init
   ============================================================ */
window.addEventListener('hashchange', () => {
  if (!state.project) return;
  navigate(location.hash.replace(/^#\/?/, '') || 'dashboard');
});

document.addEventListener('DOMContentLoaded', () => {
  setupViewDelegation();
  startApp();
});
