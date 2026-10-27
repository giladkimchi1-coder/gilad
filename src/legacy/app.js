/* eslint-disable */
// The app logic, ported from the prototype (current-app.html) with the Firestore-like
// db / assets / sample / user services injected (see services.ts). Rules are kept as-is.
export function startApp({ db, assets, sample, user, appUrl, extras }) {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  };
  const fmt = n => (Number(n) || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 });
  const iso = d => { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); };
  const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  const DOWL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const hebDate = s => { const d = parseISO(s); return `יום ${DOWL[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`; };
  const toast = msg => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 2600); };
  const blobUrl = id => '/blob/' + id;
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

  const S = { day: iso(new Date()), view: 'plan', tasks: [], vendors: [], workers: [], jobtypes: [], projects: [], pid: null, budget: [], docs: [], logs: [], log: null, logDirty: false, docFilter: 'all', me: null, names: {} };
  const svc = { db, assets, sample, user };
  db = null; assets = null; sample = null; user = null;
  S.role = null;

  // ---------- views ----------
  const setView = v => {
    S.view = v;
    $$('nav.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === v)));
    $$('.view').forEach(p => p.hidden = p.dataset.panel !== v);
    $('#daypick').hidden = !(v === 'plan' || v === 'log');
    if (v === 'gantt') renderGantt();
    store.set('view', v);
    if (location.hash.slice(1) !== v) history.replaceState(null, '', '#' + v);
  };
  $$('nav.tabs button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

  // ---------- day picker ----------
  const setDay = d => {
    if (S.logDirty && d !== S.day) { saveLog(true); }
    S.day = d; $('#datePick').value = d; renderDay(); subscribeLog();
  };
  $('#prevDay').onclick = () => { const d = parseISO(S.day); d.setDate(d.getDate() - 1); setDay(iso(d)); };
  $('#nextDay').onclick = () => { const d = parseISO(S.day); d.setDate(d.getDate() + 1); setDay(iso(d)); };
  $('#todayBtn').onclick = () => setDay(iso(new Date()));
  $('#datePick').onchange = e => e.target.value && setDay(e.target.value);

  const renderWeek = () => {
    const d = parseISO(S.day); const start = new Date(d); start.setDate(d.getDate() - d.getDay());
    const wk = $('#week'); wk.replaceChildren();
    const today = iso(new Date());
    for (let i = 0; i < 7; i++) {
      const x = new Date(start); x.setDate(start.getDate() + i); const s = iso(x);
      const has = S.logs.some(l => l.id === s) || S.tasks.some(t => !t.code && t.date === s);
      wk.append(el('button', { type: 'button', class: i === 6 ? 'sat' : null, 'aria-current': s === S.day ? 'date' : null, onclick: () => setDay(s), title: s === today ? 'היום' : null },
        el('span', { text: DOW[i] }), el('span', { class: 'd', text: x.getDate() }), el('span', { class: 'dot' + (has ? ' on' : '') })));
    }
  };

  // ---------- vendors ----------
  const vendorName = id => (S.vendors.find(v => v.id === id) || {}).name || '';
  const fillCrewSelect = () => {
    const sel = $('#tCrew'); const cur = sel.value; sel.replaceChildren(el('option', { value: '', text: '—' }));
    S.vendors.forEach(v => sel.append(el('option', { value: v.id, text: v.name })));
    sel.value = cur;
  };

  // ---------- tasks ----------
  const STATUS = { planned: 'מתוכנן', started: 'בביצוע', done: 'בוצע', delayed: 'נדחה' };
  const cycle = { planned: 'started', started: 'done', done: 'planned', delayed: 'started' };
  const dm = s => s ? +s.slice(8, 10) + '.' + +s.slice(5, 7) : '';
  const taskRow = (t, backlog) => {
    const cls = 'task' + (t.status === 'done' ? ' done' : t.status === 'started' ? ' started' : '');
    const sub = [vendorName(t.crew), t.status === 'delayed' ? 'נדחה' : null, backlog && t.where ? (t.where === 'factory' ? 'מפעל' : 'אתר') : null].filter(Boolean).join(' · ');
    return el('div', { class: cls },
      backlog ? el('span', { class: 'pill wait', text: 'לא משובץ' }) :
        el('button', { class: 'check', type: 'button', 'aria-label': 'סטטוס: ' + STATUS[t.status || 'planned'] + '. לחץ לשינוי', title: STATUS[t.status || 'planned'], onclick: () => update('tasks/' + t.id, { status: cycle[t.status || 'planned'] }) }, '✓'),
      el('div', {}, el('div', { class: 't', text: t.title }), sub ? el('div', { class: 'sub', text: sub }) : null),
      el('div', { class: 'mini-actions' },
        backlog ? el('button', { type: 'button', onclick: () => update('tasks/' + t.id, { date: S.day, status: 'planned' }) }, 'שבץ') :
          el('button', { type: 'button', title: 'דחה ליום הבא', onclick: () => { const d = parseISO(t.date); d.setDate(d.getDate() + 1); if (d.getDay() === 6) d.setDate(d.getDate() + 1); update('tasks/' + t.id, { date: iso(d), status: 'delayed' }); toast('הועבר ל' + hebDate(iso(d))); } }, 'דחה'),
        el('button', { type: 'button', class: 'danger', 'aria-label': 'מחק משימה', onclick: () => remove('tasks/' + t.id) }, '✕')));
  };

  // ---------- gantt schedule ----------
  const WHERE = { factory: 'מפעל', site: 'אתר', external: 'חיצוני', project: 'התארגנות' };
  const CAL = (() => { const origin = parseISO('2026-01-04'); const days = []; let c = 0; for (let i = 0; i < 1500; i++) { const d = new Date(origin); d.setDate(origin.getDate() + i); const w = d.getDay(); const cap = w === 6 ? 0 : w === 5 ? 0.5 : 1; days.push({ iso: iso(d), cap, c0: c }); c += cap; } return { days, idx: new Map(days.map((d, i) => [d.iso, i])) }; })();
  const projOff = () => { const p = S.projects.find(x => x.id === S.pid) || {}; const g = p.ganttOrigin; if (!g) return null; const i = CAL.idx.get(g.date); return i == null ? null : CAL.days[i].c0 - g.unit; };
  const uStart = (d, off) => { const i = CAL.idx.get(d); return i == null ? null : CAL.days[i].c0 - off; };
  const uEnd = (d, off) => { const i = CAL.idx.get(d); return i == null ? null : CAL.days[i].c0 + CAL.days[i].cap - off; };
  const findDay = pred => { let lo = 0, hi = CAL.days.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (pred(CAL.days[m])) hi = m; else lo = m + 1; } let i = lo; while (i < CAL.days.length && !CAL.days[i].cap) i++; return CAL.days[i]?.iso || null; };
  const dStart = (u, off) => { const c = u + off + 1e-9; return findDay(d => d.c0 + d.cap > c); };
  const dEnd = (u, off) => { const c = u + off - 1e-9; return findDay(d => d.c0 + d.cap >= c && d.cap > 0 || d.c0 > c); };
  let SCH = null;
  const computeSchedule = () => {
    const off = projOff(); const gt = S.tasks.filter(t => t.code); if (off == null || !gt.length) { SCH = null; return; }
    const map = new Map(gt.map(t => [t.code, t]));
    const p = S.projects.find(x => x.id === S.pid) || {};
    const today = iso(new Date()); const tS = uStart(today, off), tE = uEnd(today, off);
    const run = useAct => {
      const memo = new Map(), busy = new Set();
      const calc = code => {
        if (memo.has(code)) return memo.get(code);
        const t = map.get(code); if (!t || busy.has(code)) return null; busy.add(code);
        let r = null; const dur = Number(t.dur) || 0;
        if (t.kind === 'setup') r = t.week != null ? { es: Math.max(0, (t.week - 1) * 5.5), ef: Math.max(0, (t.week - 1) * 5.5) + 1 } : null;
        else if (code === 'M0') r = { es: 0, ef: 0 };
        else if (code === 'M1') { const u = p.permitDate ? uStart(p.permitDate, off) : null; r = u == null ? null : { es: u, ef: u }; }
        else {
          let es = 0, ok = true;
          for (const d of t.deps || []) { const x = calc(d); if (!x) { ok = false; break; } es = Math.max(es, x.ef); }
          if (ok) r = { es, ef: es + dur };
        }
        if (useAct && t.kind !== 'milestone') {
          if (t.actualEnd) { const ef = uEnd(t.actualEnd, off); r = { es: t.actualStart ? uStart(t.actualStart, off) : uStart(t.actualEnd, off), ef, done: true }; }
          else if (t.actualStart) { const as = uStart(t.actualStart, off); r = { es: as, ef: Math.max(as + dur, tE), started: true, pe: as + dur }; }
          else if (r && t.kind !== 'setup') { const es = Math.max(r.es, tS); r = { es, ef: es + dur }; }
        }
        busy.delete(code); memo.set(code, r); return r;
      };
      for (const c of map.keys()) calc(c);
      return memo;
    };
    const base = run(false), fc = run(true); const out = new Map();
    const conv = x => x ? { s: dStart(x.es, off), e: x.ef - x.es > 0 ? dEnd(x.ef, off) : dStart(x.es, off), es: x.es, ef: x.ef } : null;
    for (const [code, t] of map) {
      const b = base.get(code), f = fc.get(code);
      out.set(code, { t, base: conv(b), fc: conv(f), done: !!f?.done, started: !!f?.started, pe: f?.pe != null ? dEnd(f.pe, off) : null, varU: b && f ? f.ef - b.ef : null });
    }
    SCH = { map: out, off, today };
  };
  const varPill = v => { if (v == null) return null; const n = Math.round(Math.abs(v) * 2) / 2; if (v > 0.25) return el('span', { class: 'pill late', text: 'איחור ' + n + ' ימים' }); if (v < -0.25) return el('span', { class: 'pill early', text: 'הקדמה ' + n + ' ימים' }); return el('span', { class: 'pill ontime', text: 'בזמן' }); };
  const setStart = (t, d) => update('tasks/' + t.id, { actualStart: d, askedOn: null });
  const setDone = (t, d) => update('tasks/' + t.id, { actualStart: t.actualStart && t.actualStart <= d ? t.actualStart : d, actualEnd: d, askedOn: null });
  const undoTask = t => update('tasks/' + t.id, t.actualEnd ? { actualEnd: null } : { actualStart: null });
  const progressBtns = (x, day) => {
    const t = x.t; const d = day > (SCH?.today || day) ? SCH.today : day;
    if (x.done) return [el('button', { type: 'button', class: 'ghost', title: 'בטל סימון סיום', onclick: () => undoTask(t) }, 'בטל')];
    if (t.kind === 'order') return [el('button', { type: 'button', onclick: () => setDone(t, d) }, 'בוצע')];
    if (x.started) return [el('button', { type: 'button', onclick: () => setDone(t, d) }, 'הסתיים'), el('button', { type: 'button', class: 'ghost', title: 'בטל התחלה', onclick: () => undoTask(t) }, '↺')];
    return [el('button', { type: 'button', onclick: () => setStart(t, d) }, 'התחלנו')];
  };
  const gRow = x => {
    const t = x.t; const cls = 'task' + (x.done ? ' done' : x.started ? ' started' : '');
    const b = x.base; const plan = b ? 'מתוכנן ' + dm(b.s) + (b.e && b.e !== b.s ? '–' + dm(b.e) : '') : 'ממתין להיתר';
    return el('div', { class: cls },
      el('span', { class: 'check', 'aria-hidden': 'true' }, '✓'),
      el('div', {}, el('div', { class: 't', text: t.title }), el('div', { class: 'sub', text: [t.crew || t.trade, plan].filter(Boolean).join(' · ') }), x.done ? null : varPill(x.varU)),
      el('div', { class: 'mini-actions' }, ...progressBtns(x, S.day)));
  };
  const activeOn = day => {
    if (!SCH) return []; const r = [];
    for (const x of SCH.map.values()) {
      const f = x.fc, k = x.t.kind; if (!f || ['milestone', 'wait', 'setup'].includes(k)) continue;
      if (k === 'order') { if ((!x.done && f.s === day) || x.t.actualEnd === day) r.push(x); continue; }
      if (f.s <= day && day <= f.e) r.push(x);
    }
    return r.sort((a, b) => a.fc.es - b.fc.es);
  };
  const questions = day => {
    if (!SCH || day > SCH.today) return [];
    const q = [];
    for (const x of SCH.map.values()) {
      const t = x.t; if (!['exec', 'order'].includes(t.kind) || t.askedOn === day || x.done) continue;
      if (x.started && x.pe && x.pe <= day) q.push({ x, type: 'done' });
      else if (!x.started && x.base && x.base.s <= day) q.push({ x, type: t.kind === 'order' ? 'ordered' : 'start' });
    }
    const rank = { done: 0, start: 1, ordered: 2 };
    return q.sort((a, b) => rank[a.type] - rank[b.type] || (a.x.base?.es ?? 0) - (b.x.base?.es ?? 0));
  };
  const renderAsk = (box, day) => {
    const qs = questions(day); box.replaceChildren(); if (!qs.length) return false;
    const list = box._all ? qs : qs.slice(0, 6);
    for (const { x, type } of list) {
      const t = x.t; const other = el('input', { type: 'date', value: day, max: SCH.today, 'aria-label': 'תאריך אחר' });
      const qText = type === 'done' ? `האם "${t.title}" הסתיים?` : type === 'ordered' ? `האם בוצע: "${t.title}"?` : `האם התחלתם "${t.title}"?`;
      const meta = type === 'done' ? `התחיל ב-${dm(t.actualStart)} · לפי המשך היה צריך להסתיים ב-${dm(x.pe)}` : `לפי הגאנט: ${dm(x.base.s)}` + (x.base.e && x.base.e !== x.base.s ? '–' + dm(x.base.e) : '');
      const yes = d => type === 'start' ? setStart(t, d) : setDone(t, d);
      box.append(el('div', { class: 'ask' },
        el('div', {}, el('div', { class: 't', text: qText }), el('div', { class: 'sub', text: meta + ' · ' + (WHERE[t.where] || '') })),
        el('div', { class: 'row' },
          el('button', { type: 'button', class: 'primary small', onclick: () => yes(day) }, day === SCH.today ? 'כן, היום' : 'כן, ב-' + dm(day)),
          other, el('button', { type: 'button', class: 'small', onclick: () => yes(other.value || day) }, 'כן, בתאריך שבחרתי'),
          el('button', { type: 'button', class: 'ghost small', onclick: () => update('tasks/' + t.id, { askedOn: day }) }, 'עוד לא'))));
    }
    if (qs.length > list.length) box.append(el('button', { type: 'button', class: 'linkish', onclick: () => { box._all = true; renderAsk(box, day); } }, `הצג עוד ${qs.length - list.length} שאלות`));
    return true;
  };
  const renderTasks = () => {
    computeSchedule();
    const act = activeOn(S.day); const manual = S.tasks.filter(t => !t.code && t.date === S.day);
    for (const w of ['factory', 'site']) {
      const box = $('#tasks-' + w);
      const g = act.filter(x => x.t.kind !== 'order' && (w === 'site' ? x.t.where === 'site' : x.t.where !== 'site'));
      const m = manual.filter(t => (t.where || 'site') === w);
      box.replaceChildren(...g.map(gRow), ...m.map(t => taskRow(t)));
      if (!g.length && !m.length) box.append(el('div', { class: 'empty', text: w === 'factory' ? 'אין משימות במפעל ליום הזה' : 'אין משימות באתר ליום הזה' }));
    }
    const ords = act.filter(x => x.t.kind === 'order');
    $('#tasks-orders').replaceChildren(...(ords.length ? ords.map(gRow) : [el('div', { class: 'empty', text: 'אין הזמנות או התראות ליום הזה' })]));
    const back = S.tasks.filter(t => !t.code && !t.date);
    $('#tasks-backlog').replaceChildren(...(back.length ? back.map(t => taskRow(t, true)) : [el('div', { class: 'empty', text: 'אין משימות ידניות שממתינות לשיבוץ' })]));
    $('#askPanel').hidden = !renderAsk($('#askList'), S.day);
    if (S.view === 'gantt') renderGantt();
  };
  let gFilter = 'all';
  const groupOf = t => t.kind === 'setup' ? 'setup' : t.kind === 'order' ? 'order' : (t.where === 'site' || t.code === 'M1') ? 'site' : 'factory';
  const renderGantt = () => {
    computeSchedule(); const box = $('#gGroups'); box.replaceChildren();
    const p = S.projects.find(x => x.id === S.pid) || {}; $('#gPermit').value = p.permitDate || '';
    if (!SCH) { $('#gKpis').replaceChildren(); box.append(el('div', { class: 'panel' }, el('div', { class: 'empty', text: 'לפרויקט הזה עוד אין גאנט.' }))); return; }
    const all = [...SCH.map.values()]; const ex = all.filter(x => x.t.kind === 'exec');
    const lastEnd = list => list.reduce((m, x) => (x.fc?.e && (!m || x.fc.e > m) ? x.fc.e : m), null);
    const k = (label, v, note) => el('div', { class: 'kpi' }, el('div', { class: 'k', text: label }), el('div', { class: 'v', text: v }), note ? el('div', { class: 'small muted', text: note }) : null);
    const fEnd = lastEnd(ex.filter(x => x.t.where === 'factory')), bF = ex.filter(x => x.t.where === 'factory').reduce((m, x) => (x.base?.e && (!m || x.base.e > m) ? x.base.e : m), null);
    const hand = SCH.map.get('A53');
    const lateN = all.filter(x => x.t.kind !== 'setup' && !x.done && x.varU > 0.25).length;
    $('#gKpis').replaceChildren(
      k('משימות ביצוע', ex.filter(x => x.done).length + ' / ' + ex.length, ex.filter(x => x.started).length + ' בביצוע'),
      k('צפי סיום מפעל', fEnd ? dm(fEnd) : '—', bF ? 'מתוכנן ' + dm(bF) : null),
      k('צפי מסירה', hand?.fc?.e ? dm(hand.fc.e) : 'ממתין להיתר', hand?.base?.e ? 'מתוכנן ' + dm(hand.base.e) : null),
      k('באיחור מול הגאנט', String(lateN), lateN ? 'משימות פתוחות' : 'הכל בזמן'));
    const pass = x => gFilter === 'all' || (gFilter === 'open' && !x.done) || (gFilter === 'active' && x.started && !x.done) || (gFilter === 'late' && !x.done && x.varU > 0.25) || (gFilter === 'critical' && x.t.critical);
    for (const [g, title] of [['order', 'הזמנות והתראות'], ['factory', 'מפעל (קבוצת יבנה)'], ['site', 'אתר (כרם בן זמרה)'], ['setup', 'משימות התארגנות']]) {
      const list = all.filter(x => groupOf(x.t) === g && pass(x)).sort((a, b) => (a.base?.es ?? 1e9) - (b.base?.es ?? 1e9) || (a.t.order ?? 0) - (b.t.order ?? 0));
      if (!list.length) continue;
      const rows = list.map(x => {
        const t = x.t; const st = x.done ? el('span', { class: 'pill ok', text: 'הסתיים ' + dm(t.actualEnd) }) : x.started ? el('span', { class: 'pill run', text: 'בביצוע מ-' + dm(t.actualStart) }) : el('span', { class: 'pill wait', text: x.fc ? 'מתוכנן' : 'ממתין להיתר' });
        if (g === 'setup') return el('tr', { class: x.done ? 'done' : '' }, el('td', {}, el('div', { text: t.title }), t.note ? el('div', { class: 'small muted', text: t.note }) : null), el('td', { text: t.owner || '' }), el('td', { text: t.when || '' }), el('td', {}, x.done ? st : el('span', { class: 'pill wait', text: t.sstatus || 'פתוח' })),
          el('td', {}, el('div', { class: 'mini-actions' }, x.done ? el('button', { type: 'button', class: 'ghost', onclick: () => undoTask(t) }, 'בטל') : el('button', { type: 'button', onclick: () => setDone(t, SCH.today) }, 'בוצע'))));
        const rng = r => r ? dm(r.s) + (r.e && r.e !== r.s ? '–' + dm(r.e) : '') : '—';
        return el('tr', { class: (x.done ? 'done ' : '') + (t.critical ? 'crit' : '') },
          el('td', {}, el('div', {}, el('span', { class: 'code', text: t.code + ' ' }), t.title), el('div', { class: 'small muted', text: [t.crew || t.trade, t.note].filter(Boolean).join(' · ') })),
          el('td', { class: 'n', text: t.dur ? String(t.dur) : '—' }),
          el('td', { class: 'n', text: rng(x.base) }),
          el('td', { class: 'n', text: rng(x.fc) }),
          el('td', {}, x.fc && x.base ? varPill(x.varU) : null),
          el('td', {}, st),
          el('td', {}, ['exec', 'order'].includes(t.kind) ? el('div', { class: 'mini-actions' }, ...progressBtns(x, SCH.today)) : null));
      });
      const head = g === 'setup' ? ['משימה', 'אחראי', 'מתי', 'סטטוס', ''] : ['משימה', 'ימים', 'מתוכנן', 'צפי / בפועל', 'סטייה', 'מצב', ''];
      box.append(el('div', { class: 'panel' }, el('div', { class: 'row spread' }, el('h2', { text: title }), el('span', { class: 'small muted', text: list.length + ' משימות' })),
        el('div', { class: 'tablewrap' }, el('table', { class: 'gtable' }, el('thead', {}, el('tr', {}, ...head.map(h => el('th', { text: h })))), el('tbody', {}, ...rows)))));
    }
    if (!box.children.length) box.append(el('div', { class: 'panel' }, el('div', { class: 'empty', text: 'אין משימות בסינון הזה' })));
  };
  $('#gFilters').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; gFilter = b.dataset.f; $$('#gFilters button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderGantt(); });
  $('#gPermit').addEventListener('change', async e => { if (!db || !S.pid) return; try { await db.doc('projects/' + S.pid).update({ permitDate: e.target.value || null }); toast(e.target.value ? 'משימות האתר שובצו לפי ההיתר' : 'תאריך ההיתר הוסר'); } catch (err) { toast(writeErr(err)); } });
  $('#taskForm').addEventListener('submit', async e => {
    e.preventDefault(); if (!db) return;
    const title = $('#tTitle').value.trim(); if (!title) return;
    await add('tasks', { title, where: $('#tWhere').value, crew: $('#tCrew').value || null, date: S.day, status: 'planned', createdAt: Date.now() });
    $('#tTitle').value = ''; toast('המשימה נוספה');
  });

  const renderDay = () => { $('#dateLabel').textContent = hebDate(S.day); renderWeek(); renderTasks(); try { renderOrdAsk(); } catch {} };

  // ---------- labor ----------
  const LAB = { rate: 61, week: 12.5, fri: 9, ded: 1, dedFrom: '2026-10-01' };
  S.admin = false; S.hoursMap = {}; S.payroll = []; S.rates = {};
  const stdHours = d => { const w = parseISO(d).getDay(); return w === 6 ? 0 : Math.max(0, (w === 5 ? LAB.fri : LAB.week) - (d >= LAB.dedFrom ? LAB.ded : 0)); };
  const rateOf = name => { const r = Number(S.rates[name]); return r > 0 ? r : LAB.rate; };
  const logWorkers = l => [...new Set(LOCS.flatMap(loc => (l?.[loc]?.workers || []).map(w => w.name)).filter(Boolean))];
  const hoursOf = (l, name, hm = S.hoursMap) => { const d = l.date || l.id; const wh = l.workerHours || hm[d]?.workerHours; const h = wh?.[name]; return h != null && h !== '' ? Number(h) : stdHours(d); };
  const laborOf = (l, hm) => logWorkers(l).reduce((s, n) => s + hoursOf(l, n, hm) * rateOf(n), 0);
  const subsCostOf = (l, hm = S.hoursMap) => { const sc = hm[l.date || l.id]?.subCosts || {}; return Object.values(sc).reduce((a, v) => a + (Number(v) || 0), 0); };
  const rateCell = w => { const i = el('input', { class: 'num', inputmode: 'decimal', value: S.rates[w.name] || '', placeholder: String(LAB.rate), 'aria-label': 'תעריף לשעה', style: 'width:80px' }); i.addEventListener('change', async () => { try { await db.doc('private/rates').set({ ...S.rates, [w.name]: Number(i.value) || null }); } catch (e) { toast(writeErr(e)); } }); return el('td', { class: 'admin-only' }, i); };

  // ---------- log ----------
  let logUnsub = null;
  const LOCS = ['factory', 'site'];
  const blk = loc => $(`.locblock[data-loc="${loc}"]`);
  const workerRoles = () => { const m = {}; for (const l of S.logs) for (const loc of LOCS) for (const w of (l[loc]?.workers || [])) if (w.name && w.work) m[w.name] = w.work; for (const w of S.workers) if (w.role && !m[w.name]) m[w.name] = w.role; return m; };
  const fillDatalists = () => {
    const names = new Set([...S.workers.filter(w => w.active !== false).map(w => w.name), ...S.logs.flatMap(l => LOCS.flatMap(loc => (l[loc]?.workers || []).map(w => w.name)))].filter(Boolean));
    $('#dlWorkers').replaceChildren(...[...names].map(n => el('option', { value: n })));
    const works = new Set([...chapters().flatMap(c => c.jobs || []), ...S.logs.flatMap(l => LOCS.flatMap(loc => (l[loc]?.jobs || []).map(j => j.work))), ...S.workers.map(w => w.role)].filter(Boolean));
    $('#dlWorks').replaceChildren(...[...works].map(n => el('option', { value: n })));
    $('#dlEquip').replaceChildren(...[...new Set([...S.equipList, ...S.logs.flatMap(l => LOCS.flatMap(loc => (l[loc]?.equip || []).map(x => x.name)))].filter(Boolean))].map(n => el('option', { value: n })));
    $('#dlSubs').replaceChildren(...S.vendors.filter(v => v.kind === 'sub').map(v => el('option', { value: v.name })));
  };
  S.equipList = [];
  const erow = (r = {}) => {
    const name = el('input', { list: 'dlEquip', 'aria-label': 'כלי', placeholder: 'כלי (מנוף, בובקט…)', value: r.name || '' });
    const sup = el('input', { list: 'dlSubs', 'aria-label': 'ספק / מפעיל', placeholder: 'ספק / מפעיל', value: r.supplier || '' });
    const work = el('input', { 'aria-label': 'מה עשה', placeholder: r.hint || 'מה עשה היום', value: r.work || '' });
    const hrs = el('input', { class: 'num', inputmode: 'decimal', 'aria-label': 'שעות', placeholder: 'שעות', value: r.hours ?? '' });
    const cost = S.admin ? el('input', { class: 'num', inputmode: 'decimal', 'aria-label': 'עלות ₪', placeholder: 'עלות ₪', value: r.cost || '' }) : null;
    const row = el('div', { class: 'wrow erow' + (S.admin ? ' cost' : '') }, name, sup, work, hrs, cost, el('button', { type: 'button', class: 'ghost', 'aria-label': 'הסר', onclick: () => { row.remove(); markDirty(); } }, '✕'));
    row._get = () => { const o = { name: name.value.trim(), supplier: sup.value.trim(), work: work.value.trim(), hours: hrs.value.trim() === '' ? null : Number(hrs.value) || 0 }; if (cost && cost.value.trim()) o.cost = Number(cost.value.replace(/[^\d.]/g, '')) || 0; return o; };
    return row;
  };
  const eqKey = (loc, x) => loc + '|' + x.name + '|' + (x.supplier || '');
  const wrow = (kind, r = {}) => {
    if (kind === 'equip') return erow(r);
    const name = el('input', { list: kind === 'workers' ? 'dlWorkers' : 'dlSubs', 'aria-label': kind === 'workers' ? 'שם הפועל' : 'קבלן משנה', placeholder: kind === 'workers' ? 'שם' : 'קבלן', value: r.name || '' });
    const work = el('input', { 'aria-label': 'העבודה היום', placeholder: r.hint || (kind === 'workers' ? 'מה עשה היום' : 'מה בוצע היום'), value: r.work || '' });
    const cost = kind === 'subs' && S.admin ? el('input', { class: 'num', inputmode: 'decimal', 'aria-label': 'עלות ליום ₪', placeholder: 'עלות ₪', value: r.cost || '' }) : null;
    const row = el('div', { class: 'wrow' + (kind === 'subs' && S.admin ? ' sub' : '') }, name, work, cost, el('button', { type: 'button', class: 'ghost', 'aria-label': 'הסר שורה', onclick: () => { row.remove(); markDirty(); } }, '✕'));
    return row;
  };
  const workerPicker = (loc, chosen, onChange) => {
    const active = S.workers.filter(w => w.active !== false && w.name).sort((a, b) => a.name.localeCompare(b.name, 'he'));
    const here = active.filter(w => w.location === loc && !chosen.includes(w.name)), other = active.filter(w => w.location !== loc && !chosen.includes(w.name));
    const sel = el('select', { 'aria-label': 'הוסף פועל למלאכה' }, el('option', { value: '', text: '+ פועל' }));
    if (here.length) sel.append(el('optgroup', { label: loc === 'factory' ? 'פועלי מפעל' : 'פועלי אתר' }, ...here.map(w => el('option', { value: w.name, text: w.name + (w.role ? ' · ' + w.role : '') }))));
    if (other.length) sel.append(el('optgroup', { label: here.length ? 'שאר הפועלים' : 'פועלים' }, ...other.map(w => el('option', { value: w.name, text: w.name + (w.role ? ' · ' + w.role : '') }))));
    sel.addEventListener('change', () => { if (sel.value) onChange([...chosen, sel.value]); });
    return sel;
  };
  const chapters = () => [...S.jobtypes].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  const jobCard = (loc, j = { work: '', workers: [] }) => {
    const st = { workers: [...(j.workers || [])], works: j.works ? [...j.works] : [], open: false };
    if (!j.works && j.work) st.works = j.work.split(/\s*,\s*/).filter(Boolean);
    const card = el('div', { class: 'job' });
    const chSel = el('select', { 'aria-label': 'פרק' });
    const worksBox = el('div', { class: 'togs' });
    const other = el('input', { list: 'dlWorks', 'aria-label': 'מלאכה נוספת', placeholder: 'מלאכה נוספת שלא ברשימה (אפשר כמה, עם פסיק)' });
    const chJobs = () => (S.jobtypes.find(c => c.id === chSel.value)?.jobs || []);
    const drawWorks = () => {
      const list = chJobs();
      worksBox.replaceChildren(...list.map(n => el('button', { type: 'button', class: 'tog', 'aria-pressed': String(st.works.includes(n)), onclick: () => { st.works = st.works.includes(n) ? st.works.filter(x => x !== n) : [...st.works, n]; drawWorks(); markDirty(); } }, n)));
      worksBox.hidden = !list.length;
      other.value = st.works.filter(w => !list.includes(w)).join(', ');
    };
    const syncOther = () => { const list = chJobs(); st.works = [...st.works.filter(w => list.includes(w)), ...other.value.split(/\s*,\s*/).map(x => x.trim()).filter(Boolean)]; };
    other.addEventListener('input', () => { syncOther(); markDirty(); });
    const fillChapters = () => {
      const chs = chapters(); const cur = chSel.value || j.chapter || '';
      const chId = chs.some(c => c.id === cur) ? cur : (chs.find(c => st.works.some(w => (c.jobs || []).includes(w)))?.id || '');
      chSel.replaceChildren(el('option', { value: '', text: chs.length ? 'בחר פרק' : 'אין פרקים' }), ...chs.map(c => el('option', { value: c.id, text: c.name })));
      chSel.value = chId; chSel.hidden = !chs.length; drawWorks();
    };
    chSel.addEventListener('change', () => { const keep = other.value; st.works = keep.split(/\s*,\s*/).filter(Boolean); drawWorks(); markDirty(); });
    // workers
    const chips = el('div', { class: 'chips' });
    const pickBtn = el('button', { type: 'button', class: 'ghost small' });
    const panel = el('div', { class: 'wpanel', hidden: true });
    const search = el('input', { placeholder: 'חיפוש פועל', 'aria-label': 'חיפוש פועל' });
    const grid = el('div', { class: 'togs' });
    const drawPanel = () => {
      const q = search.value.trim().toLowerCase();
      const act = S.workers.filter(w => w.active !== false && w.name && (!q || [w.name, w.fullName, w.latinName].filter(Boolean).join(' ').toLowerCase().includes(q)))
        .sort((a, b) => ((a.location === loc ? 0 : 1) - (b.location === loc ? 0 : 1)) || a.name.localeCompare(b.name, 'he'));
      grid.replaceChildren(...act.map(w => el('button', { type: 'button', class: 'tog', title: w.fullName || '', 'aria-pressed': String(st.workers.includes(w.name)), onclick: () => { st.workers = st.workers.includes(w.name) ? st.workers.filter(x => x !== w.name) : [...st.workers, w.name]; drawPanel(); drawChips(); markDirty(); } }, w.name)));
      if (!act.length) grid.append(el('span', { class: 'muted small', text: S.workers.length ? 'אין פועל בשם הזה' : 'אין פועלים במאגר' }));
    };
    search.addEventListener('input', drawPanel);
    const drawChips = () => {
      chips.replaceChildren(...st.workers.map(n => el('span', { class: 'chip' }, n, el('button', { type: 'button', 'aria-label': 'הסר את ' + n, onclick: () => { st.workers = st.workers.filter(x => x !== n); drawChips(); if (st.open) drawPanel(); markDirty(); } }, '✕'))), pickBtn);
      pickBtn.textContent = st.open ? 'סיום בחירה' : (st.workers.length ? '+ עוד פועלים' : '+ בחר פועלים');
    };
    pickBtn.addEventListener('click', () => { st.open = !st.open; panel.hidden = !st.open; if (st.open) { search.value = ''; drawPanel(); } drawChips(); });
    panel.append(search, grid);
    card.append(el('div', { class: 'job-top' }, chSel, el('button', { type: 'button', class: 'ghost', 'aria-label': 'הסר מלאכה', onclick: () => { card.remove(); markDirty(); } }, '✕')),
      worksBox, other, el('div', { class: 'small muted', text: 'פועלים:' }), chips, panel);
    fillChapters(); drawChips();
    card._get = () => { syncOther(); return { chapter: chSel.value || '', works: [...st.works], work: st.works.join(', '), workers: [...st.workers] }; };
    card._redraw = () => { drawChips(); if (st.open) drawPanel(); }; card._chapters = fillChapters;
    return card;
  };
  const setJobs = (loc, jobs) => { const box = $('.jobs', blk(loc)); box.replaceChildren(...(jobs?.length ? jobs : [{}]).map(j => jobCard(loc, j))); };
  const readJobs = loc => $$('.job', blk(loc)).map(c => c._get()).filter(j => j.work || j.workers.length);
  const jobsToWorkers = jobs => { const m = new Map(); for (const j of jobs) for (const n of j.workers) m.set(n, [...(m.get(n) || []), j.work].filter(Boolean)); return [...m].map(([name, w]) => ({ name, work: w.join(', ') })); };
  const workersToJobs = workers => { const m = new Map(); for (const w of workers || []) { const k = w.work || ''; m.set(k, [...(m.get(k) || []), w.name]); } return [...m].map(([work, names]) => ({ work, workers: names })); };
  const redrawPickers = () => $$('.job').forEach(c => c._redraw && c._redraw());
  const readRows = (loc, kind) => kind === 'equip' ? $$('.rows[data-kind="equip"] .wrow', blk(loc)).map(r => r._get()).filter(x => x.name || x.work) : $$(`.rows[data-kind="${kind}"] .wrow`, blk(loc)).map(r => { const [n, w, c] = $$('input', r); const o = { name: n.value.trim(), work: w.value.trim() }; if (c && c.value.trim()) o.cost = Number(c.value.replace(/[^\d.]/g, '')) || 0; return o; }).filter(x => x.name || x.work);
  S.hrs = {};
  const renderHours = () => {
    const names = [...new Set(LOCS.flatMap(loc => jobsToWorkers(readJobs(loc)).map(w => w.name)))];
    const std = stdHours(S.day); $('#hrsStd').textContent = std ? 'יום מלא: ' + std + ' שעות לתשלום (אחרי ניכוי ' + LAB.ded + ' ש׳ נסיעות והפסקות) · ' + LAB.rate + ' ₪ לשעה' : 'שבת';
    const box = $('#hrsRows'); box.replaceChildren();
    for (const n of names) {
      const inp = el('input', { inputmode: 'decimal', value: S.hrs[n] ?? '', placeholder: String(std), 'aria-label': 'שעות של ' + n });
      inp.addEventListener('input', () => { S.hrs[n] = inp.value.trim() === '' ? undefined : inp.value.trim(); if (S.hrs[n] === undefined) delete S.hrs[n]; markDirty(); hrsTotal(); });
      const set = v => { if (v === std) delete S.hrs[n]; else S.hrs[n] = String(v); inp.value = S.hrs[n] ?? ''; markDirty(); hrsTotal(); };
      box.append(el('div', { class: 'hrow' }, el('span', { text: n }), inp, el('div', { class: 'q' }, el('button', { type: 'button', class: 'ghost', title: 'יום מלא', onclick: () => set(std) }, 'מלא'), el('button', { type: 'button', class: 'ghost', title: 'חצי יום', onclick: () => set(std / 2) }, '½'))));
    }
    if (!names.length) box.append(el('div', { class: 'small muted', text: 'הפועלים שתבחר במלאכות יופיעו כאן עם שעות יום מלא. שנה רק למי שעבד פחות או יותר.' }));
    hrsTotal();
  };
  const hrsTotal = () => {
    const names = [...new Set(LOCS.flatMap(loc => jobsToWorkers(readJobs(loc)).map(w => w.name)))];
    const l = { date: S.day, workerHours: S.hrs }; let h = 0, c = 0; if (!S.admin) return;
    for (const n of names) { const x = hoursOf(l, n); h += x; c += x * rateOf(n); }
    const sc = LOCS.reduce((s, loc) => s + readRows(loc, 'subs').reduce((a, x) => a + (x.cost || 0), 0), 0);
    $('#hrsTotal').textContent = names.length || sc ? `סה"כ ${h} שעות · שכר ₪${fmt(c)}` + (sc ? ` · קבלנים ביומית ₪${fmt(sc)}` : '') + ' · לפני מע"מ' : '';
  };
  const logForm = () => {
    const o = { weather: $('#lWeather').value, hours: $('#lHours').value, issues: $('#lIssues').value, photos: S.log?.photos || [] };
    for (const loc of LOCS) { const jobs = readJobs(loc); o[loc] = { jobs, workers: jobsToWorkers(jobs), subs: readRows(loc, 'subs'), equip: readRows(loc, 'equip'), goodsExtra: $('.goodsx', blk(loc)).value }; }
    const present = new Set(LOCS.flatMap(loc => o[loc].workers.map(w => w.name))); const wh = {}, sc = {};
    for (const [n, v] of Object.entries(S.hrs)) if (present.has(n) && v !== undefined && v !== '') wh[n] = Number(v);
    for (const loc of LOCS) for (const x of o[loc].subs) { if (x.cost) sc[loc + '|' + x.name] = x.cost; delete x.cost; }
    const ec = {}; for (const loc of LOCS) for (const x of o[loc].equip) { if (x.cost) ec[eqKey(loc, x)] = x.cost; delete x.cost; }
    Object.defineProperty(o, '_pay', { value: { workerHours: wh, subCosts: sc, equipCosts: ec }, enumerable: false });
    return o;
  };
  const setRows = (loc, kind, list) => { const box = $(`.rows[data-kind="${kind}"]`, blk(loc)); box.replaceChildren(...(list?.length ? list : [{}]).map(r => wrow(kind, r))); };
  const fillLog = l => {
    S.log = l || { photos: [] };
    $('#lWeather').value = l?.weather || ''; $('#lHours').value = l?.hours || ''; $('#lIssues').value = l?.issues || '';
    for (const loc of LOCS) { setJobs(loc, l?.[loc]?.jobs || workersToJobs(l?.[loc]?.workers)); setRows(loc, 'subs', l?.[loc]?.subs); setRows(loc, 'equip', (l?.[loc]?.equip || []).map(x => ({ ...x, cost: S.hoursMap[S.day]?.equipCosts?.[eqKey(loc, x)] }))); $('.goodsx', blk(loc)).value = l?.[loc]?.goodsExtra || ''; }
    const hd = S.hoursMap[S.day] || {};
    S.hrs = Object.fromEntries(Object.entries(hd.workerHours || {}).map(([k, v]) => [k, String(v)]));
    if (S.admin) for (const loc of LOCS) $$(`.rows[data-kind="subs"] .wrow`, blk(loc)).forEach(r => { const [n, , c] = $$('input', r); const v = hd.subCosts?.[loc + '|' + n.value.trim()]; if (c && v) c.value = v; });
    renderGoods(); renderPhotos(); renderHours(); S.logDirty = false; renderLogMeta();
    const wantEdit = S.pendingEdit === S.day; S.pendingEdit = null;
    setLogMode(l?.updatedAt && !wantEdit ? 'summary' : 'edit');
  };
  const dayDeliveries = loc => S.docs.filter(d => d.type === 'delivery' && d.date === S.day && (d.location || 'factory') === loc);
  const renderGoods = () => {
    for (const loc of LOCS) {
      const list = dayDeliveries(loc);
      $('.goods', blk(loc)).replaceChildren(...(list.length ? list.map(d => el('div', { class: 'g' },
        el('span', { text: '• ' + (d.items?.length ? d.items.slice(0, 4).map(i => [i.desc, i.qty != null ? i.qty + (i.unit ? ' ' + i.unit : '') : null].filter(Boolean).join(' ')).join(', ') : 'סחורה') }),
        el('span', { class: 'muted', text: '— ' + (vendorName(d.vendor) || d.supplier || '') + (d.number ? ', תעודה ' + d.number : '') }))) :
        [el('div', { class: 'muted', text: 'תעודות משלוח שתקלוט עם תאריך היום יופיעו כאן אוטומטית' })]));
    }
  };
  const renderLogMeta = async () => {
    const l = S.log; const m = $('#logMeta');
    if (!l?.updatedAt) { m.textContent = 'עוד לא נשמר יומן ליום הזה'; $('#logStatus').textContent = ''; return; }
    let who = '';
    if (user && l.updatedBy) { try { const ps = await user.profiles([l.updatedBy]); who = ps[l.updatedBy]?.name || ''; } catch {} }
    m.textContent = 'עודכן ' + new Date(l.updatedAt).toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' }) + (who ? ' · ' + who : '');
  };
  const renderPhotos = () => {
    const box = $('#logPhotos'); const ph = S.log?.photos || [];
    box.replaceChildren(...ph.map(id => el('figure', {}, el('img', { src: blobUrl(id), alt: 'תמונה מהאתר', loading: 'lazy' }),
      el('button', { type: 'button', 'aria-label': 'הסר תמונה', onclick: () => { S.log.photos = ph.filter(x => x !== id); renderPhotos(); markDirty(); } }, '✕'))));
    if (!ph.length) box.append(el('div', { class: 'empty', text: 'אין תמונות עדיין' }));
  };
  let hrsT = null;
  const markDirty = () => { S.logDirty = true; $('#logStatus').textContent = 'יש שינויים שלא נשמרו'; clearTimeout(hrsT); hrsT = setTimeout(() => { if (!$('#logEditor').hidden && !document.activeElement?.closest?.('#hrsRows')) renderHours(); }, 150); };
  $('[data-panel="log"]').addEventListener('input', e => { if (e.target.matches('input:not([type=file]), select, textarea')) markDirty(); });
  $$('.locblock button.addjob').forEach(b => b.addEventListener('click', () => { const loc = b.closest('.locblock').dataset.loc; $('.jobs', blk(loc)).append(jobCard(loc)); }));
  $$('.locblock button.add').forEach(b => b.addEventListener('click', () => { const loc = b.closest('.locblock').dataset.loc; $(`.rows[data-kind="${b.dataset.kind}"]`, blk(loc)).append(wrow(b.dataset.kind)); }));
  $('#copyPrev').onclick = () => {
    const prev = [...S.logs].filter(l => l.id < S.day).sort((a, b) => b.id.localeCompare(a.id))[0];
    if (!prev) { toast('אין יומן קודם להעתיק ממנו'); return; }
    for (const loc of LOCS) { setJobs(loc, prev[loc]?.jobs || workersToJobs(prev[loc]?.workers)); setRows(loc, 'subs', (prev[loc]?.subs || []).filter(x => x.name).map(x => ({ name: x.name, hint: x.work ? 'אתמול: ' + x.work : '' }))); setRows(loc, 'equip', (prev[loc]?.equip || []).filter(x => x.name).map(x => ({ name: x.name, supplier: x.supplier, hint: x.work ? 'אתמול: ' + x.work : '' }))); }
    markDirty(); toast('הועתק מ' + hebDate(prev.id) + '. עדכן מה שהשתנה היום ושמור.');
  };
  const subscribeLog = () => {
    if (logUnsub) { logUnsub(); logUnsub = null; } if (!db || !S.pid) return;
    const day = S.day;
    logUnsub = db.doc(P('logs/' + day)).onSnapshot(snap => {
      if (day !== S.day) return;
      if (S.logDirty && snap.metadata?.hasPendingWrites) return;
      if (S.logDirty) { $('#logStatus').textContent = 'מישהו אחר עדכן את היומן. השמירה שלך תדרוס את השינוי.'; return; }
      fillLog(snap.exists ? snap.data() : null);
    }, () => {});
  };
  const saveLog = async silent => {
    if (!db || !S.pid) return;
    const form = logForm(); const pay = form._pay; const data = { ...form, date: S.day, updatedAt: Date.now(), updatedBy: S.me || null };
    $('#saveLog').disabled = true;
    try { await db.doc(P('logs/' + S.day)).set(data);
      if (S.admin) { const ref = db.doc('private/hours/' + S.pid + '/' + S.day); if (Object.keys(pay.workerHours).length || Object.keys(pay.subCosts).length || Object.keys(pay.equipCosts).length) await ref.set(pay); else if (S.hoursMap[S.day]) await ref.delete(); } S.logDirty = false; S.log = data; $('#logStatus').textContent = 'נשמר'; renderLogMeta(); if (!silent) { toast('היומן נשמר'); setLogMode('summary'); window.scrollTo({ top: 0, behavior: 'smooth' }); } }
    catch (e) { $('#logStatus').textContent = writeErr(e); }
    finally { $('#saveLog').disabled = false; }
  };
  $('#saveLog').onclick = () => saveLog();
  $('#logPhotoIn').onchange = async e => {
    const files = [...e.target.files]; e.target.value = '';
    if (!assets) { toast('העלאת תמונות לא זמינה בתצוגה הזו'); return; }
    $('#logStatus').textContent = 'מעלה תמונות…';
    for (const f of files) {
      try { const r = await assets.upload(f); S.log = S.log || { photos: [] }; S.log.photos = [...(S.log.photos || []), r.id]; renderPhotos(); markDirty(); }
      catch (err) { toast('תמונה לא עלתה: ' + (err?.message || '')); }
    }
    await saveLog(true);
  };
  const renderLogList = () => {
    const list = [...S.logs].sort((a, b) => b.id.localeCompare(a.id)).slice(0, 30);
    $('#logList').replaceChildren(...(list.length ? list.map(l => {
      const w = LOCS.reduce((s, loc) => s + (l[loc]?.workers?.length || 0), 0), sub = LOCS.reduce((s, loc) => s + (l[loc]?.subs?.length || 0), 0);
      return el('div', { class: 'task' },
        el('span', { class: 'pill wait num', text: l.id.split('-').reverse().slice(0, 2).join('.') }),
        el('div', {}, el('div', { class: 't' }, el('button', { class: 'linkish', type: 'button', onclick: () => setDay(l.id) }, hebDate(l.id))),
          el('div', { class: 'sub', text: [w + ' פועלים', sub ? sub + ' קבלני משנה' : null, (l.photos || []).length ? l.photos.length + ' תמונות' : null, l.issues ? 'יש הערות' : null].filter(Boolean).join(' · ') })),
        el('div', { class: 'mini-actions' },
          el('button', { type: 'button', onclick: () => { if (S.day === l.id) setLogMode('edit'); else { S.pendingEdit = l.id; setDay(l.id); } window.scrollTo({ top: 0, behavior: 'smooth' }); } }, 'ערוך'),
          el('button', { type: 'button', class: 'danger', onclick: e => { if (e.target.dataset.armed) { deleteLog(l.id); return; } e.target.dataset.armed = '1'; e.target.textContent = 'למחוק?'; setTimeout(() => { if (e.target.isConnected) { delete e.target.dataset.armed; e.target.textContent = 'מחק'; } }, 4000); } }, 'מחק')));
    }) : [el('div', { class: 'empty', text: 'עוד לא נשמרו יומנים. מלא את היומן של היום ולחץ "שמור יומן".' })]));
  };

  // ---------- workers ----------
  const LOCNAME = { factory: 'מפעל', site: 'אתר' };
  const renderWorkers = () => {
    const q = $('#wSearch').value.trim(); const showOff = $('#wShowOff').checked;
    const all = [...S.workers].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'));
    const list = all.filter(w => (showOff || w.active !== false) && (!q || [w.name, w.fullName, w.latinName, w.role].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase())));
    $('#wCount').textContent = all.filter(w => w.active !== false).length + ' פועלים פעילים';
    const body = $('#wBody'); body.replaceChildren();
    for (const w of list) {
      const cell = (field, extra = {}) => { const i = el('input', { value: w[field] || '', 'aria-label': field, ...extra }); i.addEventListener('change', () => update('workers/' + w.id, { [field]: i.value.trim() })); return el('td', {}, i); };
      const loc = el('select', { 'aria-label': 'מיקום קבוע' }, el('option', { value: '', text: '—' }), el('option', { value: 'factory', text: 'מפעל' }), el('option', { value: 'site', text: 'אתר' }));
      loc.value = w.location || ''; loc.addEventListener('change', () => update('workers/' + w.id, { location: loc.value }));
      const act = el('input', { type: 'checkbox', checked: w.active !== false || null, style: 'width:auto', 'aria-label': 'פעיל' });
      act.addEventListener('change', () => update('workers/' + w.id, { active: act.checked }));
      body.append(el('tr', { style: w.active === false ? 'opacity:.55' : null }, cell('name'), cell('fullName'), cell('role'), rateCell(w), cell('phone', { class: 'num', inputmode: 'tel' }), el('td', {}, loc), el('td', {}, act),
        el('td', {}, el('button', { type: 'button', class: 'ghost danger', 'aria-label': 'מחק', onclick: e => { if (e.target.dataset.armed) { remove('workers/' + w.id); return; } e.target.dataset.armed = '1'; e.target.textContent = 'למחוק?'; } }, '✕'))));
    }
    if (!list.length) body.append(el('tr', {}, el('td', { colspan: 8, class: 'empty', text: all.length ? 'אין פועלים שמתאימים לחיפוש' : 'המאגר ריק. הוסף פועלים בטופס או מרשימה.' })));
  };
  $('#wSearch').addEventListener('input', renderWorkers); $('#wShowOff').addEventListener('change', renderWorkers);
  const known = () => new Set(S.workers.map(w => (w.name || '').trim()));
  $('#wForm').addEventListener('submit', async e => {
    e.preventDefault(); const name = $('#wName').value.trim(); if (!name) return;
    if (known().has(name)) { toast(name + ' כבר במאגר'); return; }
    const r = await add('workers', { name, fullName: $('#wFull').value.trim(), role: $('#wRole').value.trim(), phone: $('#wPhone').value.trim(), location: $('#wLoc').value, active: true });
    if (r) { ['#wName', '#wFull', '#wRole', '#wPhone'].forEach(id => $(id).value = ''); toast(name + ' נוסף למאגר'); }
  });
  $('#wBulk').addEventListener('submit', async e => {
    e.preventDefault(); if (!db) return;
    const have = known(); let added = 0, skipped = 0;
    const lines = $('#wBulkText').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    $('#wBulkStatus').textContent = 'מוסיף…';
    for (const line of lines) {
      let name, rest;
      if (line.includes('\t')) { const p = line.split('\t'); name = p[0]; rest = p.slice(1).join(' '); }
      else { const m = line.match(/^(.+?)\s*[-–,]\s*(.*)$/); name = m ? m[1] : line; rest = m ? m[2] : ''; }
      name = (name || '').trim(); if (!name) continue;
      if (have.has(name)) { skipped++; continue; }
      const pm = rest.match(/\+?\d[\d\s-]{6,}\d/); const phone = pm ? pm[0] : '';
      const role = rest.replace(phone, '').replace(/[\s,–-]+$|^[\s,–-]+/g, '').trim();
      const r = await add('workers', { name, role, phone: phone.trim(), location: '', active: true });
      if (r) { added++; have.add(name); }
    }
    $('#wBulkStatus').textContent = `נוספו ${added}` + (skipped ? `, ${skipped} כבר היו במאגר` : '');
    if (added) $('#wBulkText').value = '';
  });

  // ---------- summary ----------
  const eqTxt = x => [x.name, x.supplier ? '(' + x.supplier + ')' : '', x.work ? '– ' + x.work : '', x.hours ? x.hours + ' ש׳' : ''].filter(Boolean).join(' ');
  const LOCTITLE = { factory: 'רצפת ייצור (מפעל)', site: 'אתר' };
  const goodsLines = (loc, l) => [
    ...dayDeliveries(loc).map(d => (d.items?.length ? d.items.slice(0, 4).map(i => [i.desc, i.qty != null ? i.qty + (i.unit ? ' ' + i.unit : '') : null].filter(Boolean).join(' ')).join(', ') : 'סחורה') + ' (' + [(vendorName(d.vendor) || d.supplier || ''), d.number ? 'תעודה ' + d.number : ''].filter(Boolean).join(', ') + ')'),
    ...String(l?.[loc]?.goodsExtra || '').split('\n').map(x => x.trim()).filter(Boolean)];
  const summaryText = l => {
    const out = [`פרויקט ${(S.projects.find(p => p.id === S.pid) || {}).name || ''} – יומן עבודה – ${hebDate(S.day)}`];
    const meta = [l.weather, l.hours].filter(Boolean).join(' · '); if (meta) out.push(meta);
    for (const loc of LOCS) {
      const w = l[loc]?.workers || [], sb = (l[loc]?.subs || []).filter(x => x.name || x.work), g = goodsLines(loc, l);
      if (!w.length && !sb.length && !g.length && !(l[loc]?.equip || []).length) continue;
      out.push('', LOCTITLE[loc]);
      if (w.length) out.push('פועלים:', ...w.map(x => `${x.name}-${x.work || ''}`));
      if (sb.length) out.push('קבלני משנה:', ...sb.map(x => `${x.name}-${x.work || ''}`));
      if ((l[loc]?.equip || []).length) out.push('כלי צמ"ה:', ...l[loc].equip.map(eqTxt));
      if (g.length) out.push('סחורה שהגיעה:', ...g);
    }
    const late = S.tasks.filter(t => !t.code && t.date === S.day && t.status !== 'done').map(t => t.title);
    if (l.issues || late.length) out.push('', 'עיכובים והערות:', ...(l.issues ? [l.issues] : []), ...(late.length ? ['לא הושלם: ' + late.join(', ')] : []));
    if ((l.photos || []).length) out.push('', `📷 ${l.photos.length} תמונות`);
    return out.join('\n');
  };
  const renderSummary = () => {
    const l = S.log || {}; const body = $('#sumBody'); body.replaceChildren();
    body.append(el('div', { class: 'sum-head', text: hebDate(S.day) }));
    const meta = [l.weather, l.hours].filter(Boolean).join(' · '); if (meta) body.append(el('div', { class: 'sum-meta', text: meta }));
    let any = false;
    for (const loc of LOCS) {
      const jobs = l[loc]?.jobs || workersToJobs(l[loc]?.workers), sb = (l[loc]?.subs || []).filter(x => x.name || x.work), g = goodsLines(loc, l);
      const eq = l[loc]?.equip || [];
      if (!jobs.length && !sb.length && !g.length && !eq.length) continue; any = true;
      const sec = el('div', { class: 'sum-sec' });
      for (const j of jobs) sec.append(el('div', { class: 'k', text: j.work || 'ללא מלאכה' }), el('div', { class: 'sum-line', text: (j.workers || []).join(', ') || '—' }));
      const scm = S.hoursMap[S.day]?.subCosts || {};
      for (const x of sb) sec.append(el('div', { class: 'k', text: x.name || 'קבלן' }), el('div', { class: 'sum-line', text: (x.work || '—') + (S.admin && scm[loc + '|' + x.name] ? ' · ₪' + fmt(scm[loc + '|' + x.name]) : '') }));
      const ecm = S.hoursMap[S.day]?.equipCosts || {};
      for (const x of eq) sec.append(el('div', { class: 'k', text: x.name || 'כלי' }), el('div', { class: 'sum-line', text: [x.supplier, x.work, x.hours ? x.hours + ' ש׳' : ''].filter(Boolean).join(' · ') + (S.admin && ecm[eqKey(loc, x)] ? ' · ₪' + fmt(ecm[eqKey(loc, x)]) : '') }));
      const lw = [...new Set((l[loc]?.workers || []).map(w => w.name))];
      if (lw.length && S.admin) sec.append(el('div', { class: 'k', text: 'שעות' }), el('div', { class: 'sum-line', text: lw.map(n => n + ' ' + hoursOf({ ...l, date: S.day }, n)).join(' · ') }));
      if (g.length) sec.append(el('div', { class: 'k', text: 'סחורה שהגיעה' }), el('div', { class: 'sum-line' }, ...g.map(t => el('div', { text: t }))));
      const total = new Set(jobs.flatMap(j => j.workers || [])).size;
      body.append(el('div', { class: 'sum-loc' }, el('div', { class: 'row spread' }, el('h3', { text: LOCTITLE[loc] }), el('span', { class: 'pill ' + loc, text: total + ' פועלים' + (sb.length ? ' · ' + sb.length + ' קבלנים' : '') })), sec));
    }
    if (!any) body.append(el('div', { class: 'empty', text: 'לא נרשמו עבודות ביומן הזה' }));
    else if (S.admin) { const L = { ...l, date: S.day }; const hw = logWorkers(L); const hh = hw.reduce((s, n) => s + hoursOf(L, n), 0); const sc = subsCostOf(L);
      body.append(el('div', { class: 'sum-meta', style: 'font-weight:600;color:var(--ink)', text: `עלות כוח אדם היום: ${hh} שעות · ₪${fmt(laborOf(L))}` + (sc ? ` · קבלנים ביומית ₪${fmt(sc)}` : '') + ' (לפני מע"מ)' })); }
    const late = S.tasks.filter(t => !t.code && t.date === S.day && t.status !== 'done').map(t => t.title);
    if (l.issues || late.length) body.append(el('div', { class: 'banner warn' }, ...(l.issues ? [el('div', { text: l.issues })] : []), ...(late.length ? [el('div', { text: 'לא הושלם: ' + late.join(', ') })] : [])));
    if ((l.photos || []).length) body.append(el('div', { class: 'photos' }, ...l.photos.map(id => el('figure', {}, el('img', { src: blobUrl(id), alt: 'תמונה מהיומן', loading: 'lazy' })))));
    const ab = el('div', { class: 'asklist' }); if (renderAsk(ab, S.day)) body.append(el('div', { class: 'askpanel', style: 'display:flex;flex-direction:column;gap:8px;border-top:2px solid var(--ink);padding-top:10px' }, el('h3', { text: 'עדכון הגאנט – מה התחיל ומה הסתיים?' }), ab));
    renderLogMeta(); try { renderOutbox(); } catch {}
  };
  const setLogMode = mode => { S.logMode = mode; $('#logSummary').hidden = mode !== 'summary'; $('#logEditor').hidden = mode === 'summary'; if (mode === 'summary') renderSummary(); renderOutbox(); };
  $('#sumEdit').onclick = () => setLogMode('edit');
  $('#sumCopy').onclick = async () => {
    const t = summaryText(S.log || {});
    try { await navigator.clipboard.writeText(t); toast('הסיכום הועתק'); }
    catch { const ta = el('textarea', { style: 'position:fixed;opacity:0' }); ta.value = t; document.body.append(ta); ta.select(); try { document.execCommand('copy'); toast('הסיכום הועתק'); } catch { toast('ההעתקה לא נתמכת כאן'); } ta.remove(); }
  };
  const deleteLog = async day => { if (!db) return; try { await db.doc(P('logs/' + day)).delete(); toast('היומן של ' + hebDate(day) + ' נמחק'); } catch (e) { toast(writeErr(e)); } };

  // ---------- plans ----------
  const PLCAT = [['arch', 'אדריכלות – קומה'], ['sections', 'חתכים וחזיתות'], ['found', 'יסודות וקונסטרוקציה'], ['roof', 'גגות'], ['mamad', 'ממ"ד'], ['elec', 'חשמל'], ['plumb', 'אינסטלציה'], ['openings', 'פתחים – דלתות וחלונות'], ['hvac', 'מיזוג וחימום'], ['kitchen', 'מטבח וגמרים'], ['site', 'פיתוח ומדידה'], ['other', 'אחר']];
  const plGuess = n => { const t = n.toLowerCase(); const m = [['found', /יסוד|כלונס|קונסטר|found|struct|pile/], ['sections', /חתך|חזית|section|elev|facade/], ['roof', /גג|roof/], ['mamad', /ממ.?ד|mamad|shelter/], ['elec', /חשמל|elec/], ['plumb', /אינסטל|ביוב|מים|plumb|sewer/], ['openings', /פתח|חלון|דלת|אלומ|door|window|open/], ['hvac', /מיזוג|חימום|hvac|heat/], ['kitchen', /מטבח|ריצוף|kitchen|tile/], ['site', /פיתוח|מדיד|site|survey/], ['arch', /קומה|תכנית|תוכנית|אדריכל|plan|floor|arch/]]; for (const [k, r] of m) if (r.test(t)) return k; return 'other'; };
  S.plans = [];
  const renderPlans = () => {
    const box = $('#plGroups'); box.replaceChildren();
    const q = $('#plSearch').value.trim(); const showOld = $('#plOld').checked;
    const cur = S.plans.filter(p => !p.superseded);
    $('#plCount').textContent = cur.length ? cur.length + ' תוכניות' : '';
    const list = S.plans.filter(p => (showOld || !p.superseded) && (!q || [p.title, p.fileName, p.note].filter(Boolean).join(' ').includes(q)));
    if (!list.length) { box.append(el('div', { class: 'panel' }, el('div', { class: 'empty', text: S.plans.length ? 'אין תוכניות שמתאימות לחיפוש' : 'עוד לא הועלו תוכניות לפרויקט הזה. העלה את סט התוכניות למעלה.' }))); return; }
    for (const [cat, name] of PLCAT) {
      const items = list.filter(p => (p.category || 'other') === cat).sort((a, b) => (a.title || '').localeCompare(b.title || '', 'he') || (b.rev || 1) - (a.rev || 1));
      if (!items.length) continue;
      box.append(el('div', { class: 'panel' }, el('div', { class: 'row spread' }, el('h2', { text: name }), el('span', { class: 'small muted', text: items.length + '' })), el('div', { class: 'plgrid' }, ...items.map(planCard))));
    }
  };
  const planCard = p => {
    const isImg = (p.contentType || '').startsWith('image/'); const url = blobUrl(p.asset);
    const title = el('input', { value: p.title || '', 'aria-label': 'שם התוכנית' }); title.addEventListener('change', () => update('plans/' + p.id, { title: title.value.trim() }));
    const cat = el('select', { 'aria-label': 'סוג תוכנית' }, ...PLCAT.map(([k, n]) => el('option', { value: k, text: n }))); cat.value = p.category || 'other'; cat.addEventListener('change', () => update('plans/' + p.id, { category: cat.value }));
    const note = el('input', { value: p.note || '', placeholder: 'הערה (למשל: מאושר לביצוע)', 'aria-label': 'הערה' }); note.addEventListener('change', () => update('plans/' + p.id, { note: note.value.trim() }));
    const verIn = el('input', { type: 'file', accept: 'application/pdf,image/*', hidden: true });
    verIn.addEventListener('change', async () => { const f = verIn.files[0]; verIn.value = ''; if (f) await uploadPlan(f, p); });
    const card = el('div', { class: 'plcard' + (p.superseded ? ' old' : '') });
    const msg = el('div', { class: 'small', style: 'color:var(--warn)' }); msg.hidden = true;
    const inl = el('div', { class: 'plinline' }); inl.hidden = true;
    let zoom = 100;
    const pics = p.previews?.length ? p.previews.map(blobUrl) : isImg ? [url] : [];
    const drawInl = () => {
      const imgs = pics.map(u => el('img', { src: u, alt: p.title || '', style: `width:${zoom}%;max-width:none` }));
      inl.replaceChildren(
        el('div', { class: 'row' }, el('button', { type: 'button', onclick: () => { zoom = Math.max(100, zoom - 50); drawInl(); } }, '−'), el('span', { class: 'num small', text: zoom + '%' }), el('button', { type: 'button', onclick: () => { zoom = Math.min(600, zoom + 50); drawInl(); } }, '+'), el('button', { type: 'button', class: 'ghost', onclick: () => toggleInl() }, 'סגור')),
        pics.length ? el('div', { class: 'plscroll' }, ...imgs) : el('div', { class: 'small muted', text: 'אין תצוגה לקובץ הזה. הורד את ה-PDF.' }));
    };
    const toggleInl = () => { inl.hidden = !inl.hidden; card.classList.toggle('open', !inl.hidden); if (!inl.hidden) { zoom = 100; drawInl(); card.scrollIntoView({ behavior: 'smooth', block: 'start' }); } else inl.replaceChildren(); };
    const say = t => { msg.textContent = t; msg.hidden = !t; };
    card.append(
      el('button', { type: 'button', class: 'plthumb', style: 'border:0;padding:0;width:100%', title: 'פתח', onclick: () => toggleInl() }, isImg || p.previews?.length ? el('img', { src: p.previews?.length ? blobUrl(p.previews[0]) : url, alt: p.title || '', loading: 'lazy' }) : el('span', { class: 'pdf', text: 'PDF' })),
      el('div', { class: 'plbody' }, title, cat, note,
        el('div', { class: 'plmeta', text: ['גרסה ' + (p.rev || 1), p.superseded ? 'הוחלפה' : null, p.uploadedAt ? 'הועלתה ' + new Date(p.uploadedAt).toLocaleDateString('he-IL') : null, p.size ? (p.size / 1048576).toFixed(1) + 'MB' : null].filter(Boolean).join(' · ') }),
        el('div', { class: 'mini-actions' },
          el('button', { type: 'button', class: 'primary', onclick: () => downloadPlan(p, say) }, (p.contentType || '').includes('pdf') ? 'הורד PDF' : 'הורד'),
          el('button', { type: 'button', onclick: () => toggleInl() }, 'תצוגה מהירה'),
          p.superseded ? null : el('button', { type: 'button', onclick: () => verIn.click() }, 'העלה גרסה חדשה'), verIn,
          el('button', { type: 'button', class: 'danger', onclick: e => { if (e.target.dataset.armed) { remove('plans/' + p.id); return; } e.target.dataset.armed = '1'; e.target.textContent = 'למחוק?'; } }, 'מחק')), msg), inl);
    return card;
  };
  const uploadPlan = async (f, prev) => {
    if (!assets || !db || !S.pid) { toast('העלאת קבצים לא זמינה בתצוגה הזו'); return; }
    if (f.size > 20 * 1048576) { toast(f.name + ' גדול מ-20MB'); return; }
    $('#plStatus').textContent = 'מעלה ' + f.name + '…';
    try {
      const r = await assets.upload(f);
      const base = f.name.replace(/\.[^.]+$/, '');
      let previews = [];
      if ((r.contentType || f.type).includes('pdf')) { $('#plStatus').textContent = 'מכין תצוגה לטלפון…'; previews = await makePreviews(f).catch(() => []); }
      const ref = await add('plans', { previews, title: prev ? prev.title : base, category: prev ? prev.category : plGuess(f.name), note: '', asset: r.id, fileName: f.name, contentType: r.contentType || f.type, size: r.sizeBytes || f.size, rev: prev ? (prev.rev || 1) + 1 : 1, superseded: false, uploadedAt: Date.now(), uploadedBy: S.me || null });
      if (ref && prev) await update('plans/' + prev.id, { superseded: true });
      $('#plStatus').textContent = (prev ? 'גרסה חדשה של ' + prev.title : f.name) + ' הועלתה';
    } catch (e) { $('#plStatus').textContent = 'ההעלאה של ' + f.name + ' נכשלה: ' + (e?.message || ''); }
  };
  $('#plIn').addEventListener('change', async e => { const fs = [...e.target.files]; e.target.value = ''; for (const f of fs) await uploadPlan(f); });
  const pd = $('#plDrop');
  ['dragenter', 'dragover'].forEach(t => pd.addEventListener(t, e => { e.preventDefault(); pd.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => pd.addEventListener(t, e => { e.preventDefault(); pd.classList.remove('over'); }));
  pd.addEventListener('drop', async e => { for (const f of [...e.dataTransfer.files]) await uploadPlan(f); });
  $('#plSearch').addEventListener('input', renderPlans); $('#plOld').addEventListener('change', renderPlans);

  const makePreviews = async f => {
    const lib = await getPdfLib(); const pdf = await lib.getDocument({ data: await f.arrayBuffer(), isEvalSupported: false }).promise; const ids = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
      const pg = await pdf.getPage(i); const v1 = pg.getViewport({ scale: 1 }); const sc = Math.min(4600 / Math.max(v1.width, v1.height), Math.sqrt(16e6 / (v1.width * v1.height)), 150 / 72);
      const vp = pg.getViewport({ scale: sc }); const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82)); if (!blob) continue;
      ids.push((await assets.upload(new File([blob], 'page-' + i + '.jpg', { type: 'image/jpeg' }))).id);
    }
    pdf.destroy(); return ids;
  };
  // ---------- plan viewer ----------
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  let pdfLib = null;
  const loadScript = src => new Promise((ok, bad) => { const sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = () => bad(new Error('load ' + src)); document.head.append(sc); });
  const getPdfLib = async () => {
    if (pdfLib) return pdfLib;
    await loadScript(PDFJS + 'pdf.min.js'); await loadScript(PDFJS + 'pdf.worker.min.js');
    pdfLib = window.pdfjsLib; pdfLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
    return pdfLib;
  };
  const PV = { plan: null, pdf: null, imgs: null, zoom: 1, fit: 1, token: 0 };
  const pvMsg = t => $('#pvPages').replaceChildren(el('div', { class: 'pv-msg', text: t }));
  const pvRender = async () => {
    const tok = ++PV.token; const box = $('#pvPages'); const scale = PV.fit * PV.zoom;
    $('#pvZoom').textContent = Math.round(PV.zoom * 100) + '%';
    if (PV.imgs) { box.replaceChildren(...PV.imgs); const w0 = PV.imgs[0].naturalWidth || 1; for (const im of PV.imgs) im.style.width = Math.round((im.naturalWidth || w0) * scale) + 'px'; return; }
    if (!PV.pdf) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2); const frag = [];
    for (let i = 1; i <= PV.pdf.numPages; i++) {
      const page = await PV.pdf.getPage(i); if (tok !== PV.token) return;
      const vp = page.getViewport({ scale }); const c = document.createElement('canvas');
      const px = Math.min(dpr, 8000 / Math.max(vp.width, vp.height));
      c.width = Math.floor(vp.width * px); c.height = Math.floor(vp.height * px); c.style.width = Math.floor(vp.width) + 'px'; c.style.height = Math.floor(vp.height) + 'px';
      frag.push(c); box.replaceChildren(...frag);
      await page.render({ canvasContext: c.getContext('2d'), viewport: page.getViewport({ scale: scale * px }) }).promise;
    }
  };
  const pvFit = async () => {
    const w = $('#pvBody').clientWidth - 24;
    if (PV.imgs) PV.fit = w / (PV.imgs[0].naturalWidth || w);
    else if (PV.pdf) { const pg = await PV.pdf.getPage(1); PV.fit = w / pg.getViewport({ scale: 1 }).width; }
    PV.zoom = 1; pvRender();
  };
  const openPlan = async p => {
    PV.plan = p; PV.pdf = null; PV.imgs = null; $('#pvTitle').textContent = p.title || p.fileName || 'תוכנית';
    $('#pv').hidden = false; document.body.style.overflow = 'hidden'; pvMsg('טוען את התוכנית…');
    const url = blobUrl(p.asset);
    try {
      const pics = p.previews?.length ? p.previews.map(blobUrl) : (p.contentType || '').startsWith('image/') ? [url] : null;
      if (pics) {
        PV.imgs = await Promise.all(pics.map(async (u, i) => { const img = new Image(); img.alt = (p.title || '') + (pics.length > 1 ? ' עמוד ' + (i + 1) : ''); img.src = u; try { await img.decode(); } catch { await new Promise(r => { img.onload = r; img.onerror = r; }); } return img; }));
      } else {
        const lib = await getPdfLib();
        PV.pdf = await lib.getDocument({ url, isEvalSupported: false }).promise;
      }
      if (PV.plan !== p) return; await pvFit();
    } catch (e) { pvMsg('לא הצלחתי להציג את הקובץ כאן. אפשר לשמור אותו במכשיר ולפתוח משם.'); }
  };
  const pvClose = () => { $('#pv').hidden = true; document.body.style.overflow = ''; PV.token++; PV.pdf?.destroy?.(); PV.pdf = null; PV.imgs = null; $('#pvPages').replaceChildren(); };
  $('#pvClose').onclick = pvClose;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#pv').hidden) pvClose(); });
  $('#pvIn').onclick = () => { PV.zoom = Math.min(6, PV.zoom * 1.4); pvRender(); };
  $('#pvOut').onclick = () => { PV.zoom = Math.max(0.3, PV.zoom / 1.4); pvRender(); };
  $('#pvFit').onclick = () => pvFit();
  $('#pvSave').onclick = () => PV.plan && downloadPlan(PV.plan);
  const downloadPlan = async (p, say = toast) => {
    const ext = (p.fileName || '').match(/\.[a-z0-9]+$/i)?.[0] || ((p.contentType || '').includes('pdf') ? '.pdf' : '');
    const name = (p.title || 'תוכנית').replace(/[\\/:*?"<>|]/g, '-') + ext;
    const a = el('a', { href: blobUrl(p.asset) + '?download=' + encodeURIComponent(name), download: name, style: 'display:none' });
    document.body.append(a); a.click(); a.remove(); say('');
  };
  const saveBlob = (blob, filename) => { const u = URL.createObjectURL(blob); const a = el('a', { href: u, download: filename, style: 'display:none' }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000); };

  // ---------- monthly report ----------
  let REP = null;
  $('#rMonth').value = iso(new Date()).slice(0, 7);
  const runReport = async () => {
    if (!db) return; const m = $('#rMonth').value; if (!m) return;
    const from = m + '-01', to = m + '-31'; $('#rOut').replaceChildren(el('div', { class: 'status-line', text: 'מחשב…' }));
    const rows = new Map(); const projName = id => (S.projects.find(p => p.id === id) || {}).name || id; const recon = [];
    try {
      for (const p of S.projects) {
        const pays = (await db.collection('private/payroll/' + p.id).get()).docs.map(d => d.data()).filter(d => d.payrollMonth === m && d.status !== 'rejected');
        const hm = {}; for (const d of (await db.collection('private/hours/' + p.id).get()).docs) hm[d.id] = d.data();
        const payNet = pays.reduce((s, d) => s + (Number(d.net) || 0), 0), payH = pays.reduce((s, d) => s + (Number(d.hours) || 0), 0);
        let projH = 0; const before = new Map([...rows].map(([k, v]) => [k, { ...v }]));
        let snap; try { snap = await db.collection('projects/' + p.id + '/logs').where('date', '>=', from).where('date', '<=', to).get(); } catch { snap = await db.collection('projects/' + p.id + '/logs').get(); }
        for (const d of snap.docs) {
          const l = { id: d.id, ...d.data() }; l.date = l.date || l.id; if (l.date < from || l.date > to) continue;
          const works = new Map(); for (const loc of LOCS) for (const w of l[loc]?.workers || []) works.set(w.name, w.work);
          for (const n of logWorkers(l)) {
            const h = hoursOf(l, n, hm), r = rateOf(n);
            const R = rows.get(n) || { name: n, days: 0, hours: 0, cost: 0, list: [] };
            R.days += 1; R.hours += h; R.cost += h * r; R.list.push({ date: l.date, proj: projName(p.id), pid: p.id, h, work: works.get(n) || '' }); rows.set(n, R); projH += h;
          }
        }
        if (pays.length) recon.push({ proj: projName(p.id), pid: p.id, payNet, payH, logH: projH, eff: projH ? payNet / projH : 0 });
      }
      for (const R of rows.values()) { R.actual = 0; R.hasActual = false; for (const x of R.list) { const rc = recon.find(c => c.pid === x.pid); if (rc) { R.actual += x.h * rc.eff; R.hasActual = true; } else R.actual += x.h * rateOf(R.name); } }
    } catch (e) { $('#rOut').replaceChildren(el('div', { class: 'banner warn', text: 'לא הצלחתי לחשב את הדוח: ' + (e?.message || '') })); return; }
    REP = { month: m, recon, rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'he')) };
    REP.rows.forEach(r => r.list.sort((a, b) => a.date.localeCompare(b.date)));
    const T = REP.rows.reduce((t, r) => ({ days: t.days + r.days, hours: t.hours + r.hours, cost: t.cost + r.cost, actual: t.actual + r.actual }), { days: 0, hours: 0, cost: 0, actual: 0 });
    const hasA = recon.length > 0;
    if (!REP.rows.length) { $('#rOut').replaceChildren(el('div', { class: 'empty', text: 'אין ימי עבודה רשומים בחודש הזה' })); return; }
    const full = S.workers.reduce((m, w) => (m[w.name] = w.fullName || '', m), {});
    const reconEls = recon.map(c => { const gap = Math.round((c.payH - c.logH) * 10) / 10; return el('div', { class: 'banner ' + (Math.abs(gap) < 0.5 && c.payH ? 'info' : 'warn') }, `${c.proj}: חשבונית התאגיד ${c.payH || '—'} שעות · ₪${fmt(c.payNet)} לפני מע"מ · ביומנים ${c.logH} שעות` + (c.payH ? (Math.abs(gap) < 0.5 ? ' · תואם ✓' : ` · פער ${gap > 0 ? '+' : ''}${gap} שעות`) : '') + ` · עלות בפועל לשעה ₪${(Math.round(c.eff * 100) / 100).toLocaleString('he-IL')}`); });
    $('#rOut').replaceChildren(...reconEls, el('div', { class: 'tablewrap' }, el('table', { class: 'rtable' },
      el('thead', {}, el('tr', {}, ...['פועל', 'ימים', 'שעות', 'תעריף', 'הערכה לפי יומן ₪', ...(hasA ? ['בפועל לפי חשבונית ₪'] : [])].map((h, i) => el('th', { class: i ? 'n' : null, text: h })))),
      el('tbody', {}, ...REP.rows.map(r => el('tr', {},
        el('td', {}, el('details', {}, el('summary', { text: r.name + (full[r.name] ? ' · ' + full[r.name] : '') }), el('div', { class: 'days' }, ...r.list.flatMap(x => [el('span', { class: 'num', text: dm(x.date) }), el('span', { class: 'num', text: x.h + ' ש׳' }), el('span', { text: [x.work, S.projects.length > 1 ? x.proj : ''].filter(Boolean).join(' · ') })])))),
        el('td', { class: 'n', text: String(r.days) }), el('td', { class: 'n', text: String(r.hours) }), el('td', { class: 'n', text: String(rateOf(r.name)) }), el('td', { class: 'n', text: fmt(r.cost) }), hasA ? el('td', { class: 'n', text: fmt(r.actual) }) : null)),
        el('tr', { style: 'font-weight:700' }, el('td', { text: 'סה"כ' }), el('td', { class: 'n', text: String(T.days) }), el('td', { class: 'n', text: String(T.hours) }), el('td', {}), el('td', { class: 'n', text: fmt(T.cost) }), hasA ? el('td', { class: 'n', text: fmt(T.actual) }) : null)))));
  };
  $('#rRun').onclick = runReport;
  const repText = () => !REP ? '' : [`דוח שעות – ${REP.month.split('-').reverse().join('/')}`, ...REP.rows.map(r => `${r.name}: ${r.days} ימים, ${r.hours} שעות, ₪${fmt(REP.recon.length ? r.actual : r.cost)}`), `סה"כ: ₪${fmt(REP.rows.reduce((s, r) => s + (REP.recon.length ? r.actual : r.cost), 0))} לפני מע"מ` + (REP.recon.length ? ' (לפי חשבונית התאגיד)' : ' (הערכה)')].join('\n');
  $('#rCopy').onclick = async () => { if (!REP) { toast('הצג קודם את הדוח'); return; } const t = repText(); try { await navigator.clipboard.writeText(t); toast('הדוח הועתק'); } catch { toast('ההעתקה לא נתמכת כאן'); } };
  $('#rCsv').onclick = async () => {
    if (!REP) { toast('הצג קודם את הדוח'); return; }
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const lines = [['פועל', 'תאריך', 'פרויקט', 'מלאכה', 'שעות', 'תעריף', 'עלות לפני מע"מ'].map(q).join(',')];
    for (const r of REP.rows) for (const x of r.list) lines.push([r.name, x.date.split('-').reverse().join('/'), x.proj, x.work, x.h, rateOf(r.name), Math.round(x.h * rateOf(r.name) * 100) / 100].map(q).join(','));
    saveBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }), 'דוח שעות ' + REP.month + '.csv');
  };

  // ---------- budget ----------
  const docNet = d => Number(d.net) || (Number(d.total) ? Number(d.total) / 1.18 : 0);
  const payMonths = () => new Set(S.payroll.filter(d => d.payrollMonth && d.status !== 'rejected').map(d => d.payrollMonth));
  const payrollSum = () => S.payroll.filter(d => d.status !== 'rejected').reduce((s, d) => s + (Number(d.net) || 0), 0);
  const laborTotal = () => { const pm = payMonths(); return S.logs.reduce((s, l) => { const d = l.date || l.id; return pm.has(d.slice(0, 7)) ? s : s + laborOf({ ...l, date: d }); }, 0); };
  const subsTotal = () => S.logs.reduce((s, l) => s + subsCostOf(l), 0);
  const equipTotal = () => Object.values(S.hoursMap).reduce((s, h) => s + Object.values(h.equipCosts || {}).reduce((a, v) => a + (Number(v) || 0), 0), 0);
  const actualFor = lineId => S.docs.filter(d => d.type !== 'delivery' && d.budgetLine === lineId && d.status !== 'rejected').reduce((s, d) => s + docNet(d), 0) + (lineId === 'labor' ? laborTotal() + payrollSum() : lineId === 'subsday' ? subsTotal() : lineId === 'transport' ? equipTotal() : 0);
  const renderBudget = () => {
    { const pm = [...payMonths()].sort(); const est = [...new Set(S.logs.map(l => (l.date || l.id).slice(0, 7)).filter(x => !pm.includes(x)))].sort(); const mn = x => x.split('-').reverse().join('/');
      const n = $('#laborNote'); if (n) n.textContent = (pm.length || est.length) ? 'שכר עובדים: ' + [pm.length ? 'לפי חשבונית התאגיד – ' + pm.map(mn).join(', ') : '', est.length ? 'הערכה מהיומנים (' + LAB.rate + ' ₪ לשעה) – ' + est.map(mn).join(', ') : ''].filter(Boolean).join(' · ') : ''; }
    const lines = [...S.budget].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    const planned = lines.reduce((s, l) => s + (Number(l.planned) || 0), 0);
    const actual = S.docs.filter(d => d.type !== 'delivery' && d.status !== 'rejected').reduce((s, d) => s + docNet(d), 0) + (S.budget.some(b => b.id === 'labor') ? laborTotal() + payrollSum() : 0) + (S.budget.some(b => b.id === 'subsday') ? subsTotal() : 0) + (S.budget.some(b => b.id === 'transport') ? equipTotal() : 0);
    const unassigned = S.docs.filter(d => d.type !== 'delivery' && !d.budgetLine && d.status !== 'rejected').reduce((s, d) => s + docNet(d), 0);
    const openDel = S.docs.filter(d => d.type === 'delivery' && !d.invoicedBy).reduce((s, d) => s + docNet(d), 0);
    const k = (label, v, note) => el('div', { class: 'kpi' }, el('div', { class: 'k', text: label }), el('div', { class: 'v', text: v }), note ? el('div', { class: 'small muted', text: note }) : null);
    $('#kpis').replaceChildren(
      k('תקציב מאושר', '₪' + fmt(planned), planned ? null : 'עדיין לא הוזנו סכומים'),
      k('הוצאה בפועל', '₪' + fmt(actual), planned ? Math.round(actual / planned * 100) + '% מהתקציב' : null),
      k('יתרה', '₪' + fmt(planned - actual)),
      k('תעודות שטרם חויבו', '₪' + fmt(openDel), 'התחייבות צפויה'));
    const body = $('#budgetBody'); body.replaceChildren();
    for (const l of lines) {
      const a = actualFor(l.id); const p = Number(l.planned) || 0; const pct = p ? a / p : 0;
      const inp = el('input', { class: 'amt', inputmode: 'numeric', 'aria-label': 'תקציב ל' + l.name, value: p ? fmt(p) : '', placeholder: 'הזן סכום' });
      inp.addEventListener('change', () => { const v = Number(inp.value.replace(/[^\d.]/g, '')) || 0; update('budget/' + l.id, { planned: v }); });
      body.append(el('tr', {}, el('td', { text: l.name }), el('td', { class: 'n' }, inp), el('td', { class: 'n', text: fmt(a) }),
        el('td', {}, el('div', { class: 'bar', title: Math.round(pct * 100) + '%' }, el('i', { class: pct > 1 ? 'bad' : pct > .85 ? 'warn' : '', style: `width:${Math.min(100, pct * 100)}%` }))),
        el('td', { class: 'n', style: p && a > p ? 'color:var(--bad)' : null, text: p ? fmt(p - a) : '—' })));
    }
    if (unassigned) body.append(el('tr', {}, el('td', { class: 'muted', text: 'לא משויך לסעיף' }), el('td', { class: 'n', text: '—' }), el('td', { class: 'n', text: fmt(unassigned) }), el('td', {}), el('td', { class: 'n', text: '—' })));
    if (!lines.length) body.append(el('tr', {}, el('td', { colspan: 5, class: 'empty', text: 'אין עדיין סעיפי תקציב. הוסף סעיף למטה.' })));
  };
  $('#lineForm').addEventListener('submit', async e => {
    e.preventDefault(); const name = $('#newLine').value.trim(); if (!name) return;
    await add('budget', { name, planned: Number($('#newLineAmt').value.replace(/[^\d.]/g, '')) || 0, order: S.budget.length + 1 });
    $('#newLine').value = ''; $('#newLineAmt').value = '';
  });

  // ---------- outbox (approved WhatsApp sends) ----------
  S.outbox = {};
  const APP_URL = appUrl;
  const DOWL2 = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const dLong = d => { const x = parseISO(d); return `יום ${DOWL2[x.getDay()]} ${x.getDate()}.${x.getMonth() + 1}.${x.getFullYear()}`; };
  const waLogText = (l, day) => {
    const pn = (S.projects.find(p => p.id === S.pid) || {}).name || '';
    const out = [`*פרויקט ${pn} – יומן עבודה – ${dLong(day)}*`]; if (l.weather) out.push(l.weather);
    for (const loc of LOCS) {
      const w = l[loc]?.workers || [], sb = (l[loc]?.subs || []).filter(x => x.name || x.work), g = goodsLines(loc, l);
      if (!w.length && !sb.length && !g.length && !(l[loc]?.equip || []).length) continue;
      out.push('', `*${LOCTITLE[loc]}*`);
      if (w.length) out.push('פועלים:', ...w.map(x => `${x.name}-${x.work || ''}`));
      if (sb.length) out.push('קבלני משנה:', ...sb.map(x => `${x.name}-${x.work || ''}`));
      if ((l[loc]?.equip || []).length) out.push('כלי צמ"ה:', ...l[loc].equip.map(eqTxt));
      if (g.length) out.push('סחורה שהגיעה:', ...g);
    }
    const late = S.tasks.filter(t => !t.code && t.date === day && t.status !== 'done').map(t => t.title);
    if (l.issues || late.length) out.push('', '*עיכובים והערות:*', ...(l.issues ? [l.issues] : []), ...(late.length ? ['לא הושלם: ' + late.join(', ')] : []));
    if ((l.photos || []).length) out.push('', `📷 ${l.photos.length} תמונות מצורפות`);
    out.push('', 'לצפייה מלאה: ' + APP_URL);
    return out.join('\n');
  };
  const dayDocs = day => S.docs.filter(d => d.createdAt && iso(new Date(d.createdAt)) === day);
  const waDocsText = (docs, day) => {
    const pn = (S.projects.find(p => p.id === S.pid) || {}).name || '';
    if (!docs.length) return '';
    // No amounts here: nothing sent to WhatsApp may contain costs or hours.
    const lines = docs.map(d => [TYPE[d.type] || 'מסמך', vendorName(d.vendor) || d.supplier || '', d.number ? "מס' " + d.number : '', (d.location || 'factory') === 'site' ? 'אתר' : 'מפעל'].filter(Boolean).join(' · ')
      + (d.links?.length ? ' · מכסה תעודות: ' + d.links.map(id => S.docs.find(x => x.id === id)?.number || '').filter(Boolean).join(', ') : ''));
    const imgs = docs.filter(d => d.image).length;
    return [`*תעודות וחשבוניות – ${pn} – ${dm(day)}.${day.slice(0, 4)}*`, ...lines, imgs ? `📄 ${imgs} צילומי מסמכים מצורפים` : '', 'לצפייה מלאה: ' + APP_URL].filter(Boolean).join('\n');
  };
  const sendOutbox = item => extras?.whatsapp ? extras.whatsapp.send(item, blobUrl) : Promise.resolve({ ok: false, error: 'שליחה לא זמינה' });
  const renderOutbox = () => {
    const panel = $('#outPanel'); if (!panel) return;
    const day = S.day; const l = S.log?.updatedAt ? { ...S.log, date: day } : null;
    panel.hidden = !S.admin || S.logMode !== 'summary' && !dayDocs(day).length;
    const ob = S.outbox[day] || {};
    const fmtT = t => new Date(t).toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' });
    const part = (kind, text, extra) => {
      const K = kind === 'log' ? 'Log' : 'Doc';
      const approved = ob['approved' + K], sentAt = ob['sent' + K + 'At'], frozen = ob[kind + 'Text'];
      $('#out' + K + 'Txt').textContent = sentAt || approved ? frozen : (text || (kind === 'log' ? 'אין יומן שמור ליום הזה' : 'לא נקלטו מסמכים ביום הזה'));
      const st = $('#out' + K + 'St'); st.replaceChildren(el('span', { class: 'pill ' + (sentAt ? 'ok' : approved ? 'run' : 'wait'), text: sentAt ? 'נשלח ' + fmtT(sentAt) : approved ? 'מאושר, ממתין לשליחה' : 'ממתין לאישור' }));
      const changed = approved && !sentAt && text && frozen !== text;
      $('#out' + K + 'Meta').textContent = (changed ? '⚠ התוכן השתנה אחרי האישור. מה שיישלח הוא הגרסה שאישרת. אשר מחדש כדי לשלוח את המעודכנת. ' : '') + (extra || '') + (ob['err' + K] ? ' · שגיאה בשליחה האחרונה: ' + ob['err' + K] : '');
      const btns = $('#out' + K + 'Btns'); btns.replaceChildren();
      const save = async patch => { try { await db.doc(P('outbox/' + day)).set({ ...ob, ...patch }); } catch (e) { toast(writeErr(e)); } };
      if (!sentAt && text && (!approved || changed)) btns.append(el('button', { type: 'button', class: 'primary', onclick: () => save({ ['approved' + K]: true, [kind + 'Text']: text, ...(kind === 'log' ? { photoIds: l?.photos || [] } : { docIds: dayDocs(day).map(d => d.id), docImages: dayDocs(day).filter(d => d.image).map(d => d.image) }), ['approved' + K + 'At']: Date.now(), ['approved' + K + 'By']: S.me || null, ['err' + K]: null }) }, changed ? 'אשר את הגרסה המעודכנת' : 'אשר שליחה'));
      if (approved && !sentAt) btns.append(el('button', { type: 'button', class: 'ghost', onclick: () => save({ ['approved' + K]: false }) }, 'בטל אישור'));
      if (text || frozen) btns.append(el('button', { type: 'button', onclick: async () => { const ok = await copyText(frozen && (approved || sentAt) ? frozen : text); toast(ok ? 'הועתק' : 'ההעתקה לא עבדה'); } }, 'העתק'));
      // Only the approved, frozen text can be shared / marked as sent (see whatsapp adapter).
      if (approved && !sentAt && frozen) {
        btns.append(el('button', { type: 'button', onclick: async () => { const r = await sendOutbox({ kind, text: frozen, images: (kind === 'log' ? ob.photoIds : ob.docImages) || [] }); if (r.ok) save({ ['sent' + K + 'At']: Date.now(), ['sent' + K + 'Via']: r.via, ['err' + K]: null }); else if (r.error) toast(r.error); } }, 'שתף לוואטסאפ'));
        btns.append(el('button', { type: 'button', class: 'ghost', onclick: () => save({ ['sent' + K + 'At']: Date.now(), ['sent' + K + 'Via']: 'manual' }) }, 'סמן שנשלח'));
      }
      if (sentAt) btns.append(el('button', { type: 'button', class: 'ghost', onclick: () => save({ ['sent' + K + 'At']: null, ['approved' + K]: false }) }, 'אפשר שליחה מחדש'));
    };
    part('log', l ? waLogText(l, day) : '', l && (l.photos || []).length ? (l.photos.length + ' תמונות יצורפו') : '');
    const dd = dayDocs(day); part('doc', waDocsText(dd, day), dd.filter(d => d.image).length ? dd.filter(d => d.image).length + ' צילומים יצורפו' : '');
  };

  // ---------- purchase orders ----------
  S.orders = [];
  const OST = { new: ['טרם נשלחה', 'wait'], sent: ['נשלחה לרכש', 'run'], delivered: ['סופקה', 'ok'], cancelled: ['בוטלה', 'bad'] };
  const LATE_DAYS = 7;
  const projObj = () => S.projects.find(x => x.id === S.pid) || {};
  const destText = o => o.dest === 'site' ? 'לאתר ' + (projObj().name || '') : o.dest === 'other' ? (o.destOther || 'יעד אחר') : 'לקבוצת יבנה';
  const orderMsg = o => [`*עבור פרויקט ${projObj().name || ''}*`, (o.items || '').trim(), o.supplier ? 'ספק: ' + o.supplier : '', o.needBy ? 'נדרש עד ' + dm(o.needBy) : '', `*הובלה ${destText(o)}*`].filter(Boolean).join('\n');
  const addDays = (d, n) => { const x = parseISO(d); x.setDate(x.getDate() + n); return iso(x); };
  const dueOf = o => o.needBy || (o.sentDate ? addDays(o.sentDate, LATE_DAYS) : null);
  const isLate = o => ['new', 'sent'].includes(o.status) && dueOf(o) && dueOf(o) < iso(new Date());
  const ganttOrders = () => S.tasks.filter(t => t.code && (t.kind === 'order' || t.kind === 'setup')).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const fillOGantt = () => { const sel = $('#oGantt'); const cur = sel.value; sel.replaceChildren(el('option', { value: '', text: '—' }), ...ganttOrders().filter(t => !t.actualEnd).map(t => el('option', { value: t.code, text: t.title }))); sel.value = cur; };
  const oFormData = () => ({ items: $('#oItems').value, dest: $('#oDest').value, destOther: $('#oDestOther').value.trim(), needBy: $('#oNeed').value || null, supplier: $('#oSupplier').value.trim(), ganttCode: $('#oGantt').value || null });
  const oPreview = () => { $('#oDestOtherL').hidden = $('#oDest').value !== 'other'; $('#oPreview').textContent = orderMsg(oFormData()); };
  ['input', 'change'].forEach(t => $('#oForm').addEventListener(t, oPreview));
  const copyText = async t => { try { await navigator.clipboard.writeText(t); return true; } catch { const ta = el('textarea', { style: 'position:fixed;opacity:0' }); ta.value = t; document.body.append(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); return ok; } };
  const markGanttDone = async (code, d) => { const t = S.tasks.find(x => x.code === code); if (t && !t.actualEnd) await update('tasks/' + t.id, { actualStart: t.actualStart || d, actualEnd: d, askedOn: null }); };
  $('#oForm').addEventListener('submit', async e => {
    e.preventDefault(); if (!db || !S.pid) return;
    const f = oFormData(); if (!f.items.trim()) return;
    const msg = orderMsg(f); const ok = await copyText(msg); const today = iso(new Date());
    const ref = await add('orders', { ...f, text: msg, status: ok ? 'sent' : 'new', date: today, sentDate: ok ? today : null, source: 'app', createdAt: Date.now(), createdBy: S.me || null });
    if (!ref) return;
    if (ok && f.ganttCode) await markGanttDone(f.ganttCode, today);
    $('#oForm').reset(); oPreview();
    toast(ok ? 'ההזמנה נשמרה והועתקה. הדבק בקבוצת הרכש.' : 'ההזמנה נשמרה. ההעתקה לא עבדה – לחץ "העתק" ברשימה.');
  });
  let oFilter = 'open';
  $('#oFilters').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; oFilter = b.dataset.f; $$('#oFilters button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderOrders(); });
  const setOrderStatus = async (o, st, extra = {}) => { const today = iso(new Date()); await update('orders/' + o.id, { status: st, ...(st === 'sent' && !o.sentDate ? { sentDate: today } : {}), ...(st === 'delivered' ? { deliveredDate: extra.date || today } : {}), ...extra, askedOn: null }); if (st === 'sent' && o.ganttCode) await markGanttDone(o.ganttCode, today); };
  const renderOrders = () => {
    const list = [...S.orders].filter(o => oFilter === 'all' || (oFilter === 'open' && ['new', 'sent'].includes(o.status)) || (oFilter === 'late' && isLate(o)) || (oFilter === 'done' && o.status === 'delivered'))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
    const box = $('#oList'); box.replaceChildren();
    for (const o of list) {
      const st = OST[o.status] || OST.new; const doc = o.deliveryDoc ? S.docs.find(d => d.id === o.deliveryDoc) : null;
      const g = o.ganttCode ? S.tasks.find(t => t.code === o.ganttCode) : null;
      const sub = [dm(o.date), destText(o), o.supplier, o.needBy ? 'נדרש עד ' + dm(o.needBy) : '', g ? 'גאנט: ' + g.title : '', o.source === 'whatsapp' ? 'נקלט מהקבוצה' : '', doc ? 'תעודה ' + (doc.number || '') + ' · ' + (vendorName(doc.vendor) || doc.supplier || '') : o.status === 'delivered' ? 'סופקה ' + dm(o.deliveredDate) + ' בלי תעודה' : ''].filter(Boolean).join(' · ');
      box.append(el('div', { class: 'task order' },
        el('span', { class: 'pill ' + st[1], text: st[0] }),
        el('div', {}, el('div', { class: 't', text: (o.items || '').trim() }), el('div', { class: 'sub', text: sub }), o.notes ? el('div', { class: 'sub', style: 'color:var(--ink)', text: '📝 ' + o.notes }) : null, isLate(o) ? el('span', { class: 'pill late', text: 'מתעכבת – היה צפוי עד ' + dm(dueOf(o)) }) : null),
        el('div', { class: 'mini-actions', style: 'flex-wrap:wrap;justify-content:flex-end' },
          el('button', { type: 'button', onclick: async () => { const ok = await copyText(o.text || orderMsg(o)); toast(ok ? 'הועתק' : 'ההעתקה לא עבדה'); if (ok && o.status === 'new') setOrderStatus(o, 'sent'); } }, 'העתק'),
          o.status === 'new' ? el('button', { type: 'button', onclick: () => setOrderStatus(o, 'sent') }, 'נשלחה') : null,
          ['new', 'sent'].includes(o.status) ? el('button', { type: 'button', onclick: () => setOrderStatus(o, 'delivered') }, 'סופקה') : null,
          ['new', 'sent'].includes(o.status) ? el('button', { type: 'button', class: 'ghost', onclick: () => setOrderStatus(o, 'cancelled') }, 'בוטלה') : null,
          ['delivered', 'cancelled'].includes(o.status) ? el('button', { type: 'button', class: 'ghost', onclick: () => update('orders/' + o.id, { status: 'sent', deliveredDate: null, deliveryDoc: null }) }, 'החזר לפתוחה') : null,
          el('button', { type: 'button', class: 'danger', 'aria-label': 'מחק הזמנה', onclick: e => { if (e.target.dataset.armed) { remove('orders/' + o.id); return; } e.target.dataset.armed = '1'; e.target.textContent = 'למחוק?'; } }, '✕'))));
    }
    if (!list.length) box.append(el('div', { class: 'empty', text: S.orders.length ? 'אין הזמנות בסינון הזה' : 'עוד אין הזמנות. כתוב הזמנה למעלה, או שהן ייקלטו בערב מקבוצת הרכש.' }));
    renderOrdAsk();
  };
  const renderOrdAsk = () => {
    const day = S.day, today = iso(new Date()); const box = $('#ordAskList'); box.replaceChildren();
    const qs = day > today ? [] : S.orders.filter(o => isLate(o) && o.askedOn !== day);
    for (const o of qs.slice(0, 6)) {
      box.append(el('div', { class: 'ask' },
        el('div', {}, el('div', { class: 't', text: 'האם הגיעה: ' + (o.items || '').trim().split('\n')[0] + '?' }), el('div', { class: 'sub', text: 'הוזמנה ' + dm(o.date) + ' · ' + destText(o) + ' · היה צפוי עד ' + dm(dueOf(o)) })),
        el('div', { class: 'row' },
          el('button', { type: 'button', class: 'primary small', onclick: () => { setView('docs'); toast('צלם את תעודת המשלוח ושייך אותה להזמנה'); } }, 'כן, אקלוט תעודה'),
          el('button', { type: 'button', class: 'small', onclick: () => setOrderStatus(o, 'delivered', { date: day }) }, 'כן, בלי תעודה'),
          el('button', { type: 'button', class: 'ghost small', onclick: () => update('orders/' + o.id, { askedOn: day }) }, 'עוד לא'))));
    }
    $('#ordAskPanel').hidden = !qs.length;
  };
  const orderPicker = (prefix, cur, loc) => {
    const open = S.orders.filter(o => ['new', 'sent'].includes(o.status) || o.id === cur);
    const sel = el('select', { id: prefix + 'order' }, el('option', { value: '', text: open.length ? '— לא משויך —' : 'אין הזמנות פתוחות' }), ...open.map(o => el('option', { value: o.id, text: dm(o.date) + ' · ' + (o.items || '').trim().split('\n')[0].slice(0, 60) })));
    sel.value = open.some(o => o.id === cur) ? cur : ''; return el('label', { class: 'f' }, 'שייך להזמנת רכש', sel);
  };
  const linkOrder = async (docId, orderId, prevOrder, date) => {
    if (prevOrder && prevOrder !== orderId) { const po = S.orders.find(o => o.id === prevOrder); if (po?.deliveryDoc === docId) await update('orders/' + prevOrder, { status: 'sent', deliveryDoc: null, deliveredDate: null }); }
    if (orderId) { const o = S.orders.find(x => x.id === orderId); if (o) await setOrderStatus(o, 'delivered', { deliveryDoc: docId, date: date || iso(new Date()) }); }
  };

  // ---------- docs ----------
  const TYPE = { delivery: 'תעודת משלוח', invoice: 'חשבונית', partial: 'חשבון חלקי' };
  const DSTAT = { pending: ['ממתין לאישור', 'wait'], approved: ['מאושר', 'ok'], paid: ['שולם', 'ok'], rejected: ['נדחה', 'bad'] };
  const lineName = id => (S.budget.find(b => b.id === id) || {}).name || '';
  const renderDocs = () => {
    let list = [...S.docs].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
    const f = S.docFilter;
    if (f === 'pending') list = list.filter(d => d.type !== 'delivery' && (d.status || 'pending') === 'pending');
    if (f === 'delivery') list = list.filter(d => d.type === 'delivery');
    if (f === 'invoice') list = list.filter(d => d.type !== 'delivery');
    if (f === 'unbilled') list = list.filter(d => d.type === 'delivery' && !d.invoicedBy);
    const body = $('#docBody'); body.replaceChildren();
    for (const d of list) {
      const st = d.type === 'delivery' ? (d.invoicedBy ? ['חויבה', 'ok'] : ['טרם חויבה', 'wait']) : DSTAT[d.status || 'pending'];
      const flag = d.type !== 'delivery' && d.mismatch ? el('span', { class: 'pill bad', title: d.mismatch, text: 'פער' }) : null;
      body.append(el('tr', { class: 'doc-row' },
        el('td', {}, d.image ? el('img', { class: 'thumb', src: blobUrl(d.image), alt: '' }) : el('span', { class: 'thumb' })),
        el('td', { text: TYPE[d.type] || 'מסמך' }),
        el('td', { text: d.vendor ? vendorName(d.vendor) || d.supplier || '' : d.supplier || '' }),
        el('td', { class: 'num', text: d.number || '' }),
        el('td', { class: 'n', text: d.date ? d.date.split('-').reverse().join('.') : '' }),
        S.admin ? el('td', { class: 'n', text: fmt(docNet(d)) }) : null,
        el('td', { text: lineName(d.budgetLine) || '—' }),
        el('td', {}, el('span', { class: 'pill ' + st[1], text: st[0] }), ' ', flag),
        el('td', {}, el('button', { type: 'button', class: 'ghost', onclick: () => openDoc(d.id) }, 'פתח'))));
    }
    if (!list.length) body.append(el('tr', {}, el('td', { colspan: 9, class: 'empty', text: S.docs.length ? 'אין מסמכים בסינון הזה' : 'עוד לא נקלטו מסמכים. צלם תעודת משלוח או חשבונית למעלה.' })));
  };
  $('#docFilters').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.docFilter = b.dataset.f; $$('#docFilters button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderDocs(); });

  const scanFile = async file => {
    if (!db) { toast('אין חיבור לנתוני הפרויקט'); return; }
    const box = $('#reviewBox'); box.hidden = false;
    box.replaceChildren(el('div', { class: 'status-line', text: 'מעלה את המסמך…' }));
    let image = null;
    if (assets) { try { image = (await assets.upload(file)).id; } catch (e) { toast('שמירת התמונה נכשלה: ' + (e?.message || '')); } }
    let data = {};
    if (sample) {
      box.replaceChildren(el('div', { class: 'status-line', text: 'קורא את המסמך…' }));
      try {
        data = await sample.json(
`זה צילום של מסמך מספק או קבלן משנה בפרויקט בנייה בישראל (וילה מודולרית "${projObj().name || ''}").
חלץ ממנו את הפרטים והחזר JSON בלבד:
{"type": "delivery" | "invoice" | "partial",   // תעודת משלוח / חשבונית מס / חשבון חלקי (חשבון ביצוע לקבלן משנה)
 "supplier": "שם העסק שהנפיק את המסמך",
 "number": "מספר המסמך",
 "date": "YYYY-MM-DD",
 "net": מספר (סכום לפני מע"מ, או null),
 "vat": מספר או null,
 "total": מספר (כולל מע"מ) או null,
 "items": [{"desc": "...", "qty": מספר או null, "unit": "...", "price": מספר או null}],
 "refs": ["מספרי תעודות משלוח שהחשבונית מפנה אליהן"],
 "vendorId": "ה-id מהרשימה למטה שהכי מתאים לספק, או null",
 "budgetLine": "ה-id של סעיף התקציב שהכי מתאים לפריטים, או null",
 "orderId": "אם זו תעודת משלוח, ה-id של הזמנת הרכש מהרשימה למטה שהפריטים שלה הכי מתאימים, או null",
 "notes": "דבר חריג שכדאי לשים אליו לב, או מחרוזת ריקה"}
אל תנחש מספרים שלא מופיעים. אם משהו לא קריא, החזר null.

ספקים וקבלנים בפרויקט:
${S.vendors.map(v => v.id + ' = ' + v.name + (v.trade ? ' (' + v.trade + ')' : '')).join('\n')}

סעיפי תקציב:
${S.budget.map(b => b.id + ' = ' + b.name).join('\n')}

הזמנות רכש פתוחות:
${S.orders.filter(o => ['new', 'sent'].includes(o.status)).map(o => o.id + ' = ' + (o.items || '').replace(/\s+/g, ' ').slice(0, 120) + (o.supplier ? ' (ספק: ' + o.supplier + ')' : '')).join('\n') || 'אין'}`, { images: [file] });
      } catch (e) {
        toast(e?.code === 'images_unavailable' || e?.code === 'bad_key' ? 'הקריאה האוטומטית עוד לא הוגדרה (חסר מפתח Anthropic), מלא ידנית' : e?.code === 'rate_limited' ? 'יותר מדי בקשות, נסה שוב בעוד דקה או מלא ידנית' : 'הקריאה האוטומטית נכשלה, מלא ידנית');
        data = {};
      }
    }
    showReview({ ...data, image, items: Array.isArray(data?.items) ? data.items : [] }, URL.createObjectURL(file));
  };
  $('#docIn').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) scanFile(f); };
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) scanFile(f); });

  const docFields = (d, prefix) => {
    const vSel = el('select', { id: prefix + 'vendor' }, el('option', { value: '', text: d.supplier ? 'אחר: ' + d.supplier : '—' }), ...S.vendors.map(v => el('option', { value: v.id, text: v.name })));
    vSel.value = S.vendors.some(v => v.id === d.vendorId || v.id === d.vendor) ? (d.vendorId || d.vendor) : '';
    const bSel = el('select', { id: prefix + 'line' }, el('option', { value: '', text: '—' }), ...S.budget.map(b => el('option', { value: b.id, text: b.name })));
    bSel.value = S.budget.some(b => b.id === d.budgetLine) ? d.budgetLine : '';
    const tSel = el('select', { id: prefix + 'type' }, ...Object.entries(TYPE).map(([k, v]) => el('option', { value: k, text: v })));
    tSel.value = TYPE[d.type] ? d.type : 'delivery';
    const lSel = el('select', { id: prefix + 'loc' }, el('option', { value: 'factory', text: 'מפעל' }), el('option', { value: 'site', text: 'אתר' }));
    lSel.value = d.location || 'factory';
    const inp = (id, v, extra = {}) => el('input', { id: prefix + id, value: v ?? '', ...extra });
    return el('div', { class: 'grid2' },
      el('label', { class: 'f' }, 'סוג מסמך', tSel),
      el('label', { class: 'f' }, 'ספק / קבלן', vSel),
      el('label', { class: 'f' }, 'שם כפי שמופיע במסמך', inp('supplier', d.supplier)),
      el('label', { class: 'f' }, 'מספר מסמך', inp('number', d.number, { class: 'num' })),
      el('label', { class: 'f' }, 'תאריך', inp('date', d.date || iso(new Date()), { type: 'date' })),
      S.admin && el('label', { class: 'f' }, 'סכום לפני מע"מ', inp('net', d.net ?? (d.total ? Math.round(d.total / 1.18) : ''), { class: 'num', inputmode: 'decimal' })),
      S.admin && el('label', { class: 'f' }, 'סה"כ כולל מע"מ', inp('total', d.total, { class: 'num', inputmode: 'decimal' })),
      el('label', { class: 'f' }, 'סעיף תקציב', bSel),
      el('label', { class: 'f' }, 'הגיע אל', lSel));
  };
  const readFields = prefix => {
    const v = id => $('#' + prefix + id).value;
    const n = id => { if (!$('#' + prefix + id)) return undefined; const x = Number(String(v(id)).replace(/[^\d.\-]/g, '')); return Number.isFinite(x) && v(id) !== '' ? x : null; };
    return { type: v('type'), vendor: v('vendor') || null, supplier: v('supplier').trim(), number: v('number').trim(), date: v('date'), net: n('net'), total: n('total'), budgetLine: v('line') || null, location: v('loc') };
  };
  const deliveryPicker = (forVendor, selected = [], refs = []) => {
    const cands = S.docs.filter(x => x.type === 'delivery' && (!x.invoicedBy || selected.includes(x.id)) && (!forVendor || x.vendor === forVendor));
    if (!cands.length) return el('div', { class: 'small muted', text: 'אין תעודות משלוח פתוחות של הספק הזה' });
    return el('div', { class: 'tasklist', id: 'dpick' }, ...cands.map(x => {
      const pre = selected.includes(x.id) || (x.number && refs.map(String).includes(String(x.number)));
      return el('label', { class: 'row small' }, el('input', { type: 'checkbox', value: x.id, checked: pre || null, style: 'width:auto' }),
        `תעודה ${x.number || '—'} · ${x.date ? x.date.split('-').reverse().join('.') : ''} ` + (S.admin ? ` · ₪${fmt(docNet(x))}` : ''));
    }));
  };
  const mismatchOf = (fields, linkIds) => {
    if (!linkIds.length || fields.net == null) return null;
    const sum = linkIds.reduce((s, id) => s + docNet(S.docs.find(x => x.id === id) || {}), 0);
    const diff = fields.net - sum;
    return Math.abs(diff) > Math.max(50, sum * 0.01) ? `החשבונית ${diff > 0 ? 'גבוהה' : 'נמוכה'} ב-₪${fmt(Math.abs(diff))} מסכום התעודות (₪${fmt(sum)})` : null;
  };
  const linkDeliveries = async (docId, ids, prev = []) => {
    for (const id of prev.filter(x => !ids.includes(x))) await update('docs/' + id, { invoicedBy: null });
    for (const id of ids) await update('docs/' + id, { invoicedBy: docId });
  };

  const showReview = (d, previewUrl) => {
    const box = $('#reviewBox'); const P = 'rv_';
    const items = d.items?.length ? el('div', { class: 'items' }, 'פריטים: ' + d.items.slice(0, 8).map(i => [i.desc, i.qty != null ? i.qty + (i.unit ? ' ' + i.unit : '') : null].filter(Boolean).join(' ')).join(' · ')) : null;
    const linkBox = el('div', {});
    const refresh = () => {
      const t = $('#' + P + 'type')?.value; linkBox.replaceChildren();
      if (t && t !== 'delivery') linkBox.append(el('h3', { text: 'תעודות משלוח שהחשבונית מכסה' }), deliveryPicker($('#' + P + 'vendor').value, [], d.refs || []));
    };
    const fields = docFields(d, P);
    box.replaceChildren(el('div', { class: 'review' },
      el('div', {}, el('img', { src: previewUrl, alt: 'המסמך שצולם' })),
      el('div', { style: 'display:flex;flex-direction:column;gap:12px;min-width:0' },
        el('div', { class: 'row spread' }, el('h2', { text: 'בדוק ואשר' }), el('span', { class: 'pill accent', text: Object.keys(d).length > 3 ? 'מולא אוטומטית' : 'מילוי ידני' })),
        yearWarning(d.date, v => { $('#' + P + 'date').value = v; }), fields, orderPicker(P, d.orderId), items, d.notes ? el('div', { class: 'banner warn', text: d.notes }) : null, linkBox,
        el('div', { class: 'row' },
          el('button', { class: 'primary', type: 'button', onclick: async e => {
            const f = readFields(P); if (!f.supplier && !f.vendor) { toast('בחר ספק או כתוב את שמו'); return; }
            e.target.disabled = true;
            const links = $$('#dpick input:checked', linkBox).map(i => i.value);
            const rec = { ...f, image: d.image || null, items: d.items || [], status: f.type === 'delivery' ? null : 'pending', links: f.type === 'delivery' ? [] : links, mismatch: f.type === 'delivery' ? null : mismatchOf(f, links), createdAt: Date.now(), createdBy: S.me || null };
            const oid = $('#' + P + 'order')?.value || null; if (f.type === 'delivery') rec.orderId = oid;
            const ref = await add('docs', rec);
            if (ref && links.length) await linkDeliveries(ref.id, links);
            if (ref && f.type === 'delivery' && oid) await linkOrder(ref.id, oid, null, f.date);
            if (ref) { box.hidden = true; box.replaceChildren(); toast(TYPE[f.type] + ' נשמרה'); URL.revokeObjectURL(previewUrl); }
            else e.target.disabled = false;
          } }, 'שמור מסמך'),
          el('button', { type: 'button', onclick: () => { box.hidden = true; box.replaceChildren(); URL.revokeObjectURL(previewUrl); } }, 'בטל')))));
    $('#' + P + 'type').addEventListener('change', refresh); $('#' + P + 'vendor').addEventListener('change', refresh); refresh();
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openDoc = id => {
    const d = S.docs.find(x => x.id === id); if (!d) return; const P = 'dd_';
    const dlg = $('#docDlg'); const body = $('#docDlgBody');
    const linkBox = el('div', {});
    const drawLinks = () => { linkBox.replaceChildren(); if ($('#' + P + 'type').value !== 'delivery') linkBox.append(el('h3', { text: 'תעודות משלוח מקושרות' }), deliveryPicker($('#' + P + 'vendor').value, d.links || [])); };
    const statusSel = el('select', { id: P + 'status' }, ...Object.entries(DSTAT).map(([k, v]) => el('option', { value: k, text: v[0] })));
    statusSel.value = d.status || 'pending';
    body.replaceChildren(
      el('div', { class: 'row spread' }, el('h2', { text: (TYPE[d.type] || 'מסמך') + (d.number ? ' ' + d.number : '') }), el('button', { type: 'button', class: 'ghost', onclick: () => dlg.close(), 'aria-label': 'סגור' }, '✕')),
      d.image ? el('a', { href: blobUrl(d.image), target: '_blank', rel: 'noopener' }, el('img', { src: blobUrl(d.image), alt: 'המסמך', style: 'max-height:240px;border-radius:6px;border:1px solid var(--line)' })) : null,
      yearWarning(d.date, v => { $('#' + P + 'date').value = v; }),
      docFields(d, P),
      d.type === 'delivery' ? orderPicker(P, d.orderId) : null,
      d.type !== 'delivery' ? el('label', { class: 'f' }, 'סטטוס', statusSel) : null,
      d.mismatch ? el('div', { class: 'banner warn', text: d.mismatch }) : null,
      linkBox,
      el('div', { class: 'row spread' },
        el('button', { class: 'primary', type: 'button', onclick: async () => {
          const f = readFields(P); const links = $$('#dpick input:checked', linkBox).map(i => i.value);
          const isDel = f.type === 'delivery';
          const oid = isDel ? ($('#' + P + 'order')?.value || null) : null;
          await update('docs/' + d.id, { ...f, status: isDel ? null : statusSel.value, links: isDel ? [] : links, mismatch: isDel ? null : mismatchOf(f, links), orderId: oid });
          if (isDel && oid !== (d.orderId || null)) await linkOrder(d.id, oid, d.orderId, f.date);
          if (!isDel) await linkDeliveries(d.id, links, d.links || []);
          dlg.close(); toast('נשמר');
        } }, 'שמור'),
        el('button', { type: 'button', class: 'danger', onclick: e => {
          if (e.target.dataset.armed) { (d.links || []).forEach(x => update('docs/' + x, { invoicedBy: null })); remove('docs/' + d.id); dlg.close(); return; }
          e.target.dataset.armed = '1'; e.target.textContent = 'לחץ שוב למחיקה';
        } }, 'מחק מסמך')));
    body.style.display = 'flex'; body.style.flexDirection = 'column'; body.style.gap = '12px';
    $('#' + P + 'type').addEventListener('change', drawLinks); $('#' + P + 'vendor').addEventListener('change', drawLinks); drawLinks();
    dlg.showModal();
  };

  // ---------- db helpers ----------
  const writeErr = e => e?.code === 'permission_denied' ? 'אין לך הרשאת עריכה בפרויקט הזה' : 'השמירה נכשלה: ' + (e?.message || 'נסה שוב');
  const SCOPED = /^(tasks|budget|docs|logs|plans|orders|outbox)(\/|$)/;
  const P = path => SCOPED.test(path) ? `projects/${S.pid}/${path}` : path;
  const add = async (col, data) => { if (!db) return null; try { return await db.collection(P(col)).add(data); } catch (e) { toast(writeErr(e)); return null; } };
  const update = async (path, data) => { if (!db) return; try { await db.doc(P(path)).update(data); } catch (e) { toast(writeErr(e)); } };
  const remove = async path => { if (!db) return; try { await db.doc(P(path)).delete(); } catch (e) { toast(writeErr(e)); } };
  const snapList = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // ---------- boot ----------
  const startView = ['plan', 'gantt', 'log', 'budget', 'docs', 'orders', 'plans', 'workers'].includes(location.hash.slice(1)) ? location.hash.slice(1) : (store.get('view') || 'plan');
  setView(['plan', 'gantt', 'log', 'budget', 'docs', 'orders', 'plans', 'workers'].includes(startView) ? startView : 'plan');
  $('#datePick').value = S.day;
  renderDay(); fillLog(null); renderBudget(); renderDocs(); renderLogList();

  const boot = async () => {
    ({ db, assets, sample, user } = svc);
    if (!db) { $('#offline').hidden = false; return; }
    if (user) { try { S.me = await user.id(); const me = await user.me(); $('#who').replaceChildren(me?.name || '', extras?.signOut ? el('button', { type: 'button', onclick: extras.signOut }, 'יציאה') : ''); } catch {} try { S.admin = !!(await user.canEdit()); S.role = user.role; } catch {} }
    document.body.classList.toggle('is-admin', S.admin);
    document.body.classList.toggle('is-owner', S.role === 'admin');
    if (!S.admin && S.view === 'budget') setView('plan');
    if (!assets) { $('#logPhotoLabel').hidden = true; }
    if (sample) { try { const lim = await sample.limits(); if (!lim?.images) $('#scanHint').textContent = 'הקריאה האוטומטית עוד לא הוגדרה (חסר מפתח Anthropic). העלה את המסמך ומלא את הפרטים ידנית.'; } catch {} }
    else $('#scanHint').textContent = 'קריאה אוטומטית לא זמינה כאן. העלה את המסמך ומלא את הפרטים ידנית.';
    db.collection('vendors').onSnapshot(s => { S.vendors = snapList(s).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)); fillCrewSelect(); fillDatalists(); renderTasks(); renderDocs(); }, () => {});
    if (S.admin) db.doc('private/rates').onSnapshot(s => { S.rates = s.data() || {}; renderWorkers(); renderBudget(); }, () => {});
    if (S.admin) db.doc('private/labor').onSnapshot(s => { const d = s.data() || {}; LAB.dedFrom = d.deductionFrom || LAB.dedFrom; LAB.rate = Number(d.rate) || 61; LAB.week = Number(d.weekdayHours) || 12.5; LAB.fri = Number(d.fridayHours) || 9; LAB.ded = d.dailyDeduction != null ? Number(d.dailyDeduction) : 1; $('#rSettings').textContent = `שעות לתשלום: א׳–ה׳ ${LAB.week - LAB.ded} (06:30–19:00 פחות ${LAB.ded} ש׳ נסיעות והפסקות) · שישי ${LAB.fri - LAB.ded} (07:00–16:00 פחות ${LAB.ded} ש׳) · הניכוי מ-${LAB.dedFrom.split('-').reverse().join('.')}, לפני כן יום מלא · ${LAB.rate} ₪ לשעה לפני מע"מ, אלא אם הוגדר לפועל תעריף אחר`; renderBudget(); if (!$('#logEditor').hidden) renderHours(); if (S.logMode === 'summary') renderSummary(); }, () => {});
    db.doc('settings/equipment').onSnapshot(s => { S.equipList = s.data()?.items || []; fillDatalists(); }, () => {});
    db.collection('jobtypes').onSnapshot(s => { S.jobtypes = snapList(s); fillDatalists(); $$('.job').forEach(c => c._chapters && c._chapters()); }, () => {});
    db.collection('workers').onSnapshot(s => { S.workers = snapList(s); fillDatalists(); renderWorkers(); redrawPickers(); }, () => {});
  };
  let projUnsubs = [];
  const renderProjHeader = () => {
    const p = S.projects.find(x => x.id === S.pid) || {};
    $('#projName').textContent = p.name || 'בחר פרויקט';
    const meta = $('#projMeta'); meta.replaceChildren();
    if (p.modules) meta.append(el('span', {}, el('b', { text: p.modules }), ' מודולים'));
    if (p.factory) meta.append(el('span', { text: 'מפעל: ' + p.factory }));
    if (p.targetMonths) meta.append(el('span', {}, 'יעד: ', el('b', { text: p.targetMonths }), ' חודשי ביצוע נטו'));
    $$('.pill.site').forEach(x => x.textContent = p.name || 'אתר');
    if (p.factory) $$('.pill.factory').forEach(x => x.textContent = p.factory);
    const sel = $('#projSel'); sel.replaceChildren(...[...S.projects].sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).map(x => el('option', { value: x.id, text: x.name })), ...(S.role === 'admin' ? [el('option', { value: '__new', text: '+ פרויקט חדש' })] : []), ...(S.role === 'admin' ? [el('option', { value: '__manage', text: '🗑 ניהול ומחיקת פרויקטים…' })] : []));
    sel.value = S.pid || '';
  };
  const switchProject = pid => {
    if (S.logDirty) saveLog(true);
    projUnsubs.forEach(u => { try { u(); } catch {} }); projUnsubs = [];
    S.pid = pid; store.set('pid', pid);
    S.tasks = []; S.budget = []; S.docs = []; S.logs = []; S.plans = []; renderPlans();
    renderProjHeader(); renderDay(); renderBudget(); renderDocs(); renderLogList(); fillLog(null);
    if (!db || !pid) return;
    const base = 'projects/' + pid + '/';
    projUnsubs.push(db.collection(base + 'tasks').onSnapshot(s => { S.tasks = snapList(s).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); renderDay(); fillOGantt(); renderOrders(); if (S.logMode === 'summary') renderSummary(); }, () => {}));
    projUnsubs.push(db.collection(base + 'budget').onSnapshot(s => { S.budget = snapList(s); renderBudget(); renderDocs(); }, () => {}));
    projUnsubs.push(db.collection(base + 'docs').onSnapshot(s => { S.docs = snapList(s); renderDocs(); renderBudget(); renderGoods(); try { renderOutbox(); } catch {} if (S.logMode === 'summary') renderSummary(); }, () => {}));
    S.hoursMap = {}; S.payroll = [];
    if (S.admin) {
      projUnsubs.push(db.collection('private/hours/' + pid).onSnapshot(s => { S.hoursMap = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); renderBudget(); if (S.logMode === 'summary') renderSummary(); else if (!S.logDirty) { const hd = S.hoursMap[S.day] || {}; S.hrs = Object.fromEntries(Object.entries(hd.workerHours || {}).map(([k, v]) => [k, String(v)])); renderHours(); } }, () => {}));
      projUnsubs.push(db.collection('private/payroll/' + pid).onSnapshot(s => { S.payroll = snapList(s); renderBudget(); renderPayroll(); }, () => {}));
    }
    S.orders = []; renderOrders(); fillOGantt(); oPreview(); S.outbox = {};
    projUnsubs.push(db.collection(base + 'outbox').onSnapshot(s => { S.outbox = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); renderOutbox(); }, () => {}));
    projUnsubs.push(db.collection(base + 'orders').onSnapshot(s => { S.orders = snapList(s); renderOrders(); }, () => {}));
    projUnsubs.push(db.collection(base + 'plans').onSnapshot(s => { S.plans = snapList(s); renderPlans(); }, () => {}));
    projUnsubs.push(db.collection(base + 'logs').onSnapshot(s => { S.logs = snapList(s); renderLogList(); renderWeek(); fillDatalists(); renderBudget(); }, () => {}));
    subscribeLog();
  };
  const deleteProject = async (p, status) => { status('מוחק…'); return await db.deleteProject(p.id); };
  const manageProjects = () => {
    const dlg = $('#docDlg'); const body = $('#docDlgBody');
    const draw = () => {
      const list = [...S.projects].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      body.replaceChildren(
        el('div', { class: 'row spread' }, el('h2', { text: 'ניהול פרויקטים' }), el('button', { type: 'button', class: 'ghost', 'aria-label': 'סגור', onclick: () => dlg.close() }, '✕')),
        el('div', { class: 'small muted', text: 'מחיקת פרויקט מוחקת לצמיתות את כל היומנים, התעודות, הגאנט, התקציב והתוכניות שלו. מאגר הפועלים והקבלנים המשותף לא נפגע.' }),
        ...list.map(p => {
          const row = el('div', { class: 'ask' });
          const status = el('div', { class: 'small', style: 'color:var(--bad)' });
          const start = el('button', { type: 'button', class: 'danger small' }, 'מחק פרויקט');
          start.onclick = () => {
            const conf = el('input', { placeholder: 'הקלד את שם הפרויקט לאישור', 'aria-label': 'אישור מחיקה' });
            const go = el('button', { type: 'button', class: 'danger small', disabled: true }, 'מחק לצמיתות');
            conf.addEventListener('input', () => { go.disabled = conf.value.trim() !== (p.name || '').trim(); });
            go.onclick = async () => {
              go.disabled = true; conf.disabled = true; status.textContent = 'מוחק…';
              try {
                const n = await deleteProject(p, t => status.textContent = t);
                toast('הפרויקט ' + p.name + ' נמחק (' + n + ' רשומות)');
                if (S.pid === p.id) { const next = S.projects.find(x => x.id !== p.id); store.set('pid', next?.id || ''); switchProject(next?.id || null); }
                dlg.close();
              } catch (e) { status.textContent = writeErr(e); go.disabled = false; conf.disabled = false; }
            };
            row.replaceChildren(el('div', { class: 't', text: 'למחוק את "' + p.name + '"?' }),
              el('div', { class: 'sub', text: 'לא ניתן לשחזר. אם יש לפרויקט משימה מתוזמנת לוואטסאפ, היא תפסיק לשלוח.' }),
              conf, el('div', { class: 'row' }, go, el('button', { type: 'button', class: 'ghost small', onclick: draw }, 'ביטול')), status);
            conf.focus();
          };
          row.append(el('div', { class: 'row spread' }, el('div', {}, el('div', { class: 't', text: p.name }), el('div', { class: 'sub', text: [p.factory ? 'מפעל: ' + p.factory : '', p.id === S.pid ? 'הפרויקט הפתוח כרגע' : ''].filter(Boolean).join(' · ') })), start));
          return row;
        }),
        list.length ? null : el('div', { class: 'empty', text: 'אין פרויקטים' }));
      body.style.display = 'flex'; body.style.flexDirection = 'column'; body.style.gap = '12px';
    };
    draw(); dlg.showModal();
  };
  $('#projSel').addEventListener('change', e => {
    if (e.target.value === '__manage') { e.target.value = S.pid || ''; manageProjects(); return; }
    if (e.target.value !== '__new') { switchProject(e.target.value); return; }
    e.target.value = S.pid || '';
    const dlg = $('#docDlg'); const body = $('#docDlgBody');
    const f = el('form', { class: 'grid2' },
      el('label', { class: 'f' }, 'שם הפרויקט', el('input', { id: 'npName', required: true })),
      el('label', { class: 'f' }, 'מפעל', el('input', { id: 'npFactory', value: 'קיבוץ יבנה' })),
      el('label', { class: 'f' }, 'מספר מודולים', el('input', { id: 'npMods', class: 'num', inputmode: 'numeric' })),
      el('label', { class: 'f' }, 'יעד חודשי ביצוע', el('input', { id: 'npMonths', class: 'num', inputmode: 'numeric' })),
      el('label', { class: 'row small', style: 'gap:6px' }, el('input', { type: 'checkbox', id: 'npCopy', checked: true, style: 'width:auto' }), 'העתק את סעיפי התקציב מהפרויקט הנוכחי (בלי סכומים)'),
      el('div', { class: 'row' }, el('button', { class: 'primary', type: 'submit' }, 'צור פרויקט'), el('button', { type: 'button', onclick: () => dlg.close() }, 'ביטול')));
    f.addEventListener('submit', async ev => {
      ev.preventDefault(); const name = $('#npName').value.trim(); if (!name || !db) return;
      try {
        const ref = await db.collection('projects').add({ name, factory: $('#npFactory').value.trim(), modules: Number($('#npMods').value) || null, targetMonths: Number($('#npMonths').value) || null, order: S.projects.length + 1, createdAt: Date.now() });
        if ($('#npCopy').checked) for (const b of S.budget) await db.doc('projects/' + ref.id + '/budget/' + b.id).set({ name: b.name, planned: 0, order: b.order ?? 99 });
        else for (const [id, name, order] of [['labor', 'שכר עובדים (מהיומנים)', 0.5], ['subsday', 'קבלני משנה ביומית (מהיומנים)', 0.6]]) await db.doc('projects/' + ref.id + '/budget/' + id).set({ name, planned: 0, order });
        dlg.close(); switchProject(ref.id); toast('הפרויקט ' + name + ' נוצר');
      } catch (err) { toast(writeErr(err)); }
    });
    body.replaceChildren(el('h2', { text: 'פרויקט חדש' }), f); body.style.display = 'flex'; body.style.flexDirection = 'column'; body.style.gap = '12px';
    dlg.showModal();
  });
  // ---------- payroll invoice (manpower agency, monthly total) ----------
  const PAYST = { approved: ['מאושר', 'ok'], pending: ['ממתין', 'wait'], rejected: ['נדחה', 'bad'] };
  const renderPayroll = () => {
    const box = $('#payList'); if (!box) return;
    const list = [...S.payroll].sort((a, b) => (b.payrollMonth || '').localeCompare(a.payrollMonth || ''));
    box.replaceChildren(...(list.length ? list.map(p => el('div', { class: 'task' },
      el('span', { class: 'pill ' + (PAYST[p.status] || PAYST.pending)[1], text: (PAYST[p.status] || PAYST.pending)[0] }),
      el('div', {}, el('div', { class: 't', text: 'שכר ' + (p.payrollMonth || '').split('-').reverse().join('/') + ' · ' + (p.supplier || 'תאגיד') }),
        el('div', { class: 'sub', text: [p.hours ? p.hours + ' שעות' : '', p.net ? '₪' + fmt(p.net) + ' לפני מע"מ' : '', p.total ? '₪' + fmt(p.total) + ' כולל' : '', p.notes].filter(Boolean).join(' · ') })),
      el('div', { class: 'mini-actions' },
        p.image ? el('a', { class: 'btn', href: blobUrl(p.image), target: '_blank', rel: 'noopener', style: 'font-size:13px;padding:4px 8px;text-decoration:none' }, 'צילום') : null,
        el('button', { type: 'button', class: 'danger', onclick: e => { if (e.target.dataset.armed) { remove('private/payroll/' + S.pid + '/' + p.id); return; } e.target.dataset.armed = '1'; e.target.textContent = 'למחוק?'; } }, '✕')))) :
      [el('div', { class: 'empty', text: 'עוד לא נקלטו חשבוניות שכר לפרויקט הזה. בלי חשבונית, השכר בתקציב מוערך מהיומנים.' })]));
  };
  const payScan = async file => {
    if (!db || !S.pid) return;
    const box = $('#payReview'); box.hidden = false; box.replaceChildren(el('div', { class: 'status-line', text: 'מעלה את החשבונית…' }));
    let image = null; try { image = (await assets.upload(file)).id; } catch (e) { toast('שמירת הקובץ נכשלה: ' + (e?.message || '')); }
    let d = {};
    box.replaceChildren(el('div', { class: 'status-line', text: 'קורא את החשבונית…' }));
    try {
      d = await sample.json(`זו חשבונית חודשית של תאגיד כוח אדם (עובדים זרים) לפרויקט בנייה בישראל. החזר JSON בלבד:
{"supplier": "שם התאגיד", "number": "מספר החשבונית", "date": "YYYY-MM-DD", "payrollMonth": "YYYY-MM (חודש העבודה שהחשבונית מחייבת)", "hours": מספר שעות או null, "rate": תעריף לשעה לפני מע"מ או null, "net": סכום לפני מע"מ או null, "total": סכום כולל מע"מ או null, "notes": "דבר חריג, או מחרוזת ריקה"}
אל תנחש מספרים שלא מופיעים.`, { images: [file] }) || {};
    } catch (e) { toast(e?.code === 'images_unavailable' || e?.code === 'bad_key' ? 'הקריאה האוטומטית עוד לא הוגדרה, מלא ידנית' : 'הקריאה האוטומטית נכשלה, מלא ידנית'); }
    const today = iso(new Date());
    const month = /^\d{4}-\d{2}$/.test(d.payrollMonth || '') ? d.payrollMonth : (d.date || today).slice(0, 7);
    const inp = (id, v, extra = {}) => el('input', { id: 'py_' + id, value: v ?? '', ...extra });
    box.replaceChildren(el('div', { class: 'panel', style: 'background:var(--bg)' },
      el('div', { class: 'row spread' }, el('h2', { text: 'בדוק ואשר' }), el('span', { class: 'pill accent', text: Object.keys(d).length ? 'מולא אוטומטית' : 'מילוי ידני' })),
      yearWarning(d.date, v => { $('#py_date').value = v; $('#py_month').value = v.slice(0, 7); }),
      el('div', { class: 'grid2' },
        el('label', { class: 'f' }, 'חודש עבודה', inp('month', month, { type: 'month' })),
        el('label', { class: 'f' }, 'תאגיד', inp('supplier', d.supplier || 'תאגיד כוח אדם')),
        el('label', { class: 'f' }, 'מספר חשבונית', inp('number', d.number, { class: 'num' })),
        el('label', { class: 'f' }, 'תאריך חשבונית', inp('date', d.date || today, { type: 'date' })),
        el('label', { class: 'f' }, 'שעות', inp('hours', d.hours, { class: 'num', inputmode: 'decimal' })),
        el('label', { class: 'f' }, 'תעריף לשעה', inp('rate', d.rate ?? LAB.rate, { class: 'num', inputmode: 'decimal' })),
        el('label', { class: 'f' }, 'סכום לפני מע"מ', inp('net', d.net, { class: 'num', inputmode: 'decimal' })),
        el('label', { class: 'f' }, 'סה"כ כולל מע"מ', inp('total', d.total, { class: 'num', inputmode: 'decimal' })),
        el('label', { class: 'f', style: 'grid-column:1/-1' }, 'הערות', inp('notes', d.notes))),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'primary', onclick: async e => {
          const v = id => $('#py_' + id).value.trim(); const n = id => { const x = Number(v(id).replace(/[^\d.\-]/g, '')); return v(id) !== '' && Number.isFinite(x) ? x : null; };
          const m = v('month'); if (!/^\d{4}-\d{2}$/.test(m)) { toast('בחר חודש עבודה'); return; }
          if (S.payroll.some(p => p.id === m) && !e.target.dataset.armed) { e.target.dataset.armed = '1'; e.target.textContent = 'כבר יש חשבונית לחודש הזה. לחץ שוב להחלפה'; return; }
          e.target.disabled = true;
          try { await db.doc('private/payroll/' + S.pid + '/' + m).set({ payrollMonth: m, supplier: v('supplier'), number: v('number'), date: v('date'), hours: n('hours'), rate: n('rate'), net: n('net'), total: n('total'), notes: v('notes'), image, status: 'approved', createdAt: Date.now(), createdBy: S.me || null });
            box.hidden = true; box.replaceChildren(); toast('חשבונית השכר נשמרה'); }
          catch (err) { toast(writeErr(err)); e.target.disabled = false; }
        } }, 'שמור חשבונית'),
        el('button', { type: 'button', onclick: () => { box.hidden = true; box.replaceChildren(); } }, 'בטל'))));
  };
  $('#payIn').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) payScan(f); };

  // The AI sometimes misreads the year on a document: flag dates far from today and offer a fix.
  function yearWarning(d, onFix) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return null;
    const y = new Date().getFullYear(); const days = Math.abs(parseISO(d) - new Date()) / 864e5;
    if (+d.slice(0, 4) === y || days < 75) return null;
    const fixed = y + d.slice(4);
    return el('div', { class: 'banner warn' }, `התאריך במסמך הוא ${d.split('-').reverse().join('.')} – רחוק מהיום. ייתכן שהשנה נקראה לא נכון. `,
      onFix ? el('button', { type: 'button', class: 'small', onclick: ev => { onFix(fixed); ev.target.closest('.banner').remove(); } }, 'תקן ל-' + fixed.split('-').reverse().join('.')) : null);
  }

  // ---------- orders pasted from the WhatsApp purchasing group ----------
  const normTxt = t => String(t || '').replace(/[‎‏‪-‮]/g, '').replace(/\s+/g, ' ').trim();
  const parseWaOrders = (raw, projName) => {
    const head = /^‎?\[?(\d{1,2})[./](\d{1,2})[./](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\]?\s*(?:-\s*)?([^:\n]{1,60}):\s?/;
    const msgs = []; let cur = null;
    for (const line of String(raw).split(/\r?\n/)) {
      const m = line.match(head);
      if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; cur = { date: `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, time: m[4].padStart(2, '0') + m[5], sender: m[6].trim(), lines: [line.slice(m[0].length)] }; msgs.push(cur); }
      else if (cur) cur.lines.push(line);
      else { cur = { date: iso(new Date()), time: '', sender: '', lines: [line] }; msgs.push(cur); }
    }
    const out = [];
    for (const msg of msgs) {
      for (const b of msg.lines.join('\n').split(/(?=\*\s*עבור פרויקט)/)) {
        const lines = b.split('\n').map(x => x.trim()).filter(Boolean);
        const first = normTxt(lines[0] || '').match(/^\*\s*עבור פרויקט\s+(.+?)\s*\*$/);
        if (!first || normTxt(first[1]) !== normTxt(projName)) continue;
        let destLine = ''; if (/^\*\s*הובלה/.test(lines[lines.length - 1] || '')) destLine = lines.pop().replace(/\*/g, '').trim();
        const body = lines.slice(1); const supplier = (body.find(l => /^ספק:/.test(l)) || '').replace(/^ספק:\s*/, '');
        const items = body.filter(l => !/^ספק:|^נדרש עד/.test(l)).join('\n');
        const dest = /יבנה/.test(destLine) ? 'factory' : (/אתר/.test(destLine) || (projName && destLine.includes(projName))) ? 'site' : destLine ? 'other' : 'factory';
        out.push({ date: msg.date, time: msg.time, sender: msg.sender, items, supplier, dest, destOther: dest === 'other' ? destLine.replace(/^הובלה\s*ל?/, '') : '', text: lines.concat(destLine ? ['*' + destLine + '*'] : []).join('\n') });
      }
    }
    return out;
  };
  $('#oImportBtn').onclick = async () => {
    if (!db || !S.pid) return;
    const st = $('#oImportSt'); const found = parseWaOrders($('#oImportText').value, projObj().name || '');
    if (!found.length) { st.textContent = 'לא נמצאו הודעות שמתחילות ב-*עבור פרויקט ' + (projObj().name || '') + '*'; return; }
    const seen = new Set(S.orders.flatMap(o => [normTxt(o.text), normTxt(o.items)]).filter(Boolean)); let added = 0, dup = 0;
    for (const [i, o] of found.entries()) {
      if (seen.has(normTxt(o.text)) || seen.has(normTxt(o.items))) { dup++; continue; }
      let id = `wa-${o.date.replace(/-/g, '')}-${o.time || '0000'}-1`; for (let k = 2; S.orders.some(x => x.id === id); k++) id = id.replace(/-\d+$/, '-' + k);
      try { await db.doc(P('orders/' + id)).set({ items: o.items, dest: o.dest, destOther: o.destOther, supplier: o.supplier, needBy: null, ganttCode: null, text: o.text, status: 'sent', date: o.date, sentDate: o.date, sender: o.sender, source: 'whatsapp', createdAt: Date.parse(o.date + 'T12:00:00') + i, createdBy: S.me || null });
        S.orders.push({ id, ...o }); seen.add(normTxt(o.text)); seen.add(normTxt(o.items)); added++; }
      catch (e) { st.textContent = writeErr(e); return; }
    }
    st.textContent = `נקלטו ${added} הזמנות` + (dup ? `, ${dup} כבר היו` : ''); if (added) $('#oImportText').value = '';
  };
  boot().then(() => {
    if (!db) return;
    let first = true;
    db.collection('projects').onSnapshot(s => {
      S.projects = snapList(s);
      if (first) { first = false; const saved = store.get('pid'); const pick = S.projects.find(p => p.id === saved) ? saved : (S.projects.find(p => p.id === 'kbz') ? 'kbz' : S.projects[0]?.id); if (pick) switchProject(pick); else renderProjHeader(); }
      else { renderProjHeader(); renderTasks(); }
    }, () => {});
  });
  window.addEventListener('beforeunload', () => { if (S.logDirty) saveLog(true); });
}
