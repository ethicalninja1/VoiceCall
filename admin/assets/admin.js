(() => {
'use strict';
/* VoiceCall admin console — all user-supplied text is inserted with textContent (no innerHTML). */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const ICONS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  wifi: '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  ban: '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
  userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;
const paintIcons = (root = document) => $$('[data-i]', root).forEach((e) => { if (!e.firstChild) e.innerHTML = icon(e.dataset.i); });

function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) { if (kid == null || kid === false) continue; e.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return e;
}

/* ---------- formatting helpers ---------- */
const pad = (n) => String(n).padStart(2, '0');
const dur = (s) => (s >= 3600 ? Math.floor(s / 3600) + ':' : '') + pad(Math.floor((s % 3600) / 60)) + ':' + pad(Math.floor(s % 60));
function ago(ts) {
  if (!ts) return '—';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 10) return 'just now'; if (s < 60) return Math.floor(s) + 's ago'; if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'; if (s < 86400 * 14) return Math.floor(s / 86400) + 'd ago';
  return new Date(ts).toLocaleDateString();
}
const fmtDate = (ts) => (ts ? new Date(ts).toLocaleString() : '—');
const flag = (cc) => (cc && /^[A-Za-z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🌐');
const fmtId = (n) => String(n).replace(/(\d{3})(?=\d)/, '$1 ');
function parseUA(ua) {
  ua = ua || ''; let os = 'Unknown OS', br = 'Browser', model = '', m;
  if ((m = /Android ([\d.]+)/.exec(ua))) { os = 'Android ' + m[1]; const mm = /Android [\d.]+; ([^;)]+?)(?: Build|\))/.exec(ua); if (mm) model = mm[1].trim(); }
  else if (/iPhone|iPad/.test(ua)) os = 'iOS'; else if (/Windows NT/.test(ua)) os = 'Windows'; else if (/Mac OS X/.test(ua)) os = 'macOS'; else if (/Linux/.test(ua)) os = 'Linux';
  if (/Edg\//.test(ua)) br = 'Edge'; else if (/OPR\//.test(ua)) br = 'Opera'; else if (/Firefox\//.test(ua)) br = 'Firefox'; else if (/Chrome\//.test(ua)) br = 'Chrome'; else if (/Safari\//.test(ua)) br = 'Safari';
  return { os, br, model, label: ua ? `${model || os} · ${br}` : '—' };
}
function locText(u) {
  const g = u.geo;
  if (g && g.local) return { main: 'Local network', sub: u.gps ? 'GPS shared' : 'Private IP' };
  const place = g ? [g.city, g.country].filter(Boolean).join(', ') : '';
  if (place) return { main: flag(g.countryCode) + ' ' + place, sub: u.gps ? `GPS ±${u.gps.acc == null ? '?' : u.gps.acc} m` : 'IP-based (approx.)', gps: !!u.gps };
  if (u.gps) return { main: '📍 GPS location', sub: `${u.gps.lat}, ${u.gps.lon}`, gps: true };
  return { main: 'Unknown', sub: u.ip ? 'Lookup pending/unavailable' : '' };
}
const osm = (lat, lon) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}`;
const gmaps = (lat, lon) => `https://www.google.com/maps?q=${lat},${lon}`;

/* ---------- state ---------- */
const S = { view: 'overview', filter: 'all', q: '', sort: 'last', eq: '', sq: '', timer: null, busy: false, openUser: null, mapDelta: 0, twoFactor: false };
const TITLES = { overview: 'Overview', users: 'Accounts', signins: 'Sign-ins', map: 'Live map', calls: 'Calls', reports: 'Reports', events: 'Activity', tools: 'Tools & security' };

/* ---------- api ---------- */
async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch('/admin/api' + path, {
    method, credentials: 'same-origin',
    headers: Object.assign({ 'X-Requested-With': 'VoiceCallAdmin' }, body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401 && path !== '/login') { showLogin(); throw new Error('Session expired'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'Request failed (' + r.status + ')'), { status: r.status, data: d });
  return d;
}
let toastT;
function toast(msg, kind) { const t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + (kind || ''); clearTimeout(toastT); toastT = setTimeout(() => (t.className = 'toast'), 3600); }
const fail = (e) => { if (e.message !== 'Session expired') toast(e.message, 'bad'); };

/* ---------- modal prompt ---------- */
function ask({ title, text, fields = [], ok = 'OK', danger = false, hideCancel = false }) {
  return new Promise((resolve) => {
    $('#mTitle').textContent = title; $('#mText').textContent = text || '';
    const box = $('#mFields'); box.replaceChildren();
    fields.forEach((f) => box.append(el('label', { for: 'mf_' + f.name, text: f.label }), el('input', { id: 'mf_' + f.name, class: 'input', type: f.type || 'text', value: f.value || '', placeholder: f.placeholder || '', maxlength: f.maxlength || 120, autocomplete: 'off', readonly: f.readonly })));
    const okBtn = $('#mOk'); okBtn.textContent = ok; okBtn.className = 'btn ' + (danger ? 'danger' : 'primary');
    $('#mCancel').classList.toggle('hidden', hideCancel);
    const modal = $('#modal'); modal.classList.remove('hidden');
    const done = (v) => { modal.classList.add('hidden'); $('#mForm').onsubmit = null; $('#mCancel').onclick = null; resolve(v); };
    $('#mForm').onsubmit = (e) => { e.preventDefault(); done(Object.fromEntries(fields.map((f) => [f.name, $('#mf_' + f.name).value.trim()]))); };
    $('#mCancel').onclick = () => done(null);
    const first = box.querySelector('input'); if (first) { first.focus(); first.select(); } else okBtn.focus();
  });
}

/* ---------- login / session ---------- */
function showLogin() { clearInterval(S.timer); S.timer = null; $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); closeDrawer(); setTimeout(() => $('#lgPass').focus(), 50); }
function showApp() { $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); setView(S.view); startPolling(); }
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const btn = $('#lgBtn'), err = $('#lgErr'); err.textContent = ''; btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    const d = await api('/login', { method: 'POST', body: { username: $('#lgUser').value.trim(), password: $('#lgPass').value, code: $('#lgCode').value.trim() } });
    if (d.need2fa) { $('#lgCodeWrap').classList.remove('hidden'); $('#lgCode').focus(); err.textContent = 'Enter the code from your authenticator app.'; return; }
    $('#lgPass').value = ''; $('#lgCode').value = ''; $('#lgCodeWrap').classList.add('hidden'); showApp();
  } catch (x) {
    err.textContent = x.status === 429 ? `Too many attempts. Try again in ${Math.ceil((x.data.retryAfter || 900) / 60)} min.` : x.data && x.data.locked ? 'Too many attempts — sign-in is locked for 15 minutes.' : 'Incorrect username, password or code.';
  } finally { btn.disabled = false; btn.textContent = 'Sign in'; }
});
$('#logoutBtn').addEventListener('click', async () => { try { await api('/logout', { method: 'POST' }); } catch {} showLogin(); });

/* ---------- navigation ---------- */
function setView(v) {
  S.view = v;
  $$('.navbtn[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  $$('.view').forEach((s) => s.classList.toggle('hidden', s.id !== 'v-' + v));
  $('#viewTitle').textContent = TITLES[v]; closeSide(); tick();
}
$$('.navbtn[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
$$('[data-goto]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.goto)));
const openSide = () => { $('#side').classList.add('open'); $('#scrim').classList.remove('hidden'); };
const closeSide = () => { $('#side').classList.remove('open'); $('#scrim').classList.add('hidden'); };
$('#menuBtn').addEventListener('click', openSide); $('#scrim').addEventListener('click', closeSide);
function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem('vc_admin_theme', t); } catch {} }
$('#themeBtn').addEventListener('click', () => applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'));
try { applyTheme(localStorage.getItem('vc_admin_theme') || 'dark'); } catch { applyTheme('dark'); }

/* ---------- polling ---------- */
function startPolling() { clearInterval(S.timer); S.timer = setInterval(() => { if (!document.hidden) tick(); }, 3000); }
async function tick() {
  if (S.busy || $('#app').classList.contains('hidden')) return;
  S.busy = true;
  try {
    const ov = await api('/overview');
    $('#navUsers').textContent = ov.totals.users;
    const nc = $('#navCalls'); nc.textContent = ov.totals.activeCalls; nc.classList.toggle('hidden', !ov.totals.activeCalls); nc.classList.toggle('live', !!ov.totals.activeCalls);
    const nr = $('#navReports'); nr.textContent = ov.totals.reportsOpen; nr.classList.toggle('hidden', !ov.totals.reportsOpen);
    const v = S.view;
    if (v === 'overview') await renderOverview(ov); else if (v === 'users') await renderUsers(); else if (v === 'signins') await renderSignins();
    else if (v === 'map') await renderMap(); else if (v === 'calls') await renderCalls(); else if (v === 'reports') await renderReports();
    else if (v === 'events') await renderEvents(); else if (v === 'tools') { renderServer(ov); await renderTwoFactor(); }
    if (S.openUser) await refreshDrawer();
    $('#live').classList.remove('err'); $('#liveTxt').textContent = 'Live · ' + new Date().toLocaleTimeString();
  } catch (e) { if (e.message !== 'Session expired') { $('#live').classList.add('err'); $('#liveTxt').textContent = 'Connection lost'; } }
  S.busy = false;
}

/* ---------- shared widgets ---------- */
function avatar(u, extra) {
  const a = el('div', { class: 'ava' + (extra ? ' ' + extra : '') }, u.avatar ? el('img', { src: u.avatar, alt: '', loading: 'lazy' }) : (u.name || '?')[0].toUpperCase());
  if (u.online != null) a.append(el('i', { class: 'st ' + (u.banned ? 'ban' : u.inCall ? 'call' : u.online ? 'on' : '') }));
  return a;
}
function statusTag(u) {
  if (u.banned) return el('span', { class: 'tag bad', text: 'Banned' });
  if (u.inCall) return el('span', { class: 'tag info', text: 'In a call' });
  if (u.online) return el('span', { class: 'tag ok', text: u.dnd ? 'Online · DND' : 'Online' });
  return el('span', { class: 'tag', text: 'Offline' });
}
const verifiedTag = (u) => el('span', { class: 'tag ' + (u.verified ? 'vf' : 'warn'), text: u.verified ? '✓ Verified' : 'Unverified' });

/* ---------- overview ---------- */
const STATS = [['users', 'Total accounts', 'users', '#4f8cff'], ['online', 'Online now', 'wifi', '#22c55e'], ['inCall', 'In a call', 'phone', '#38bdf8'], ['callsToday', 'Calls today', 'calendar', '#f59e0b'],
  ['newToday', 'New today', 'userplus', '#a78bfa'], ['verified', 'Verified', 'shield', '#14b8a6'], ['messages', 'Chat messages', 'chat', '#7c5cff'], ['reportsOpen', 'Open reports', 'flag', '#ef4444']];
async function renderOverview(ov) {
  $('#stats').replaceChildren(...STATS.map(([k, label, ic, color]) => {
    const card = el('div', { class: 'stat' }, el('div', { class: 'ico', 'data-i': ic }), el('div', { class: 'v', text: ov.totals[k] }), el('div', { class: 'l', text: label }));
    card.style.setProperty('--c', color); paintIcons(card); return card;
  }));
  drawSpark(ov.samples);
  const max = Math.max(1, ...ov.countries.map((c) => c.count));
  $('#countries').replaceChildren(...(ov.countries.length ? ov.countries.map((c) => { const fill = el('i'); fill.style.width = Math.round((c.count / max) * 100) + '%'; return el('div', { class: 'bar' }, el('span', { class: 'nm', text: flag(c.code) + ' ' + c.name }), el('div', { class: 'tr' }, fill), el('span', { class: 'n', text: c.count })); }) : [el('div', { class: 'empty', text: 'No location data yet.' })]));
  const [on, ev] = await Promise.all([api('/users?filter=online&sort=last'), api('/events?limit=8')]);
  $('#onlineList').replaceChildren(...(on.users.length ? on.users.slice(0, 7).map((u) => el('div', { class: 'mrow', onclick: () => openDrawer(u.num) }, avatar(u), el('div', { class: 'mt' }, el('b', { text: u.name }), el('small', { text: `${fmtId(u.num)} · ${u.ip || 'no IP'}` })), statusTag(u))) : [el('div', { class: 'empty', text: 'Nobody is online.' })]));
  $('#recentEvents').replaceChildren(...(ev.events.length ? ev.events.map((e) => el('div', { class: 'mrow' }, el('div', { class: 'mt' }, el('b', { text: e.msg }), el('small', { text: ago(e.t) + ' · ' + e.type })))) : [el('div', { class: 'empty', text: 'No activity yet.' })]));
}
function drawSpark(samples) {
  const NS = 'http://www.w3.org/2000/svg', W = 600, H = 150, box = $('#spark');
  if (!samples || samples.length < 2) { box.replaceChildren(el('div', { class: 'empty', text: 'Collecting data…' })); return; }
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none');
  const mk = (t, a) => { const n = document.createElementNS(NS, t); for (const k in a) n.setAttribute(k, a[k]); return n; };
  const max = Math.max(2, ...samples.map((s) => s.online), ...samples.map((s) => s.calls));
  const X = (i) => (i / (samples.length - 1)) * W, Y = (v) => H - 14 - (v / max) * (H - 30);
  [0, 0.5, 1].forEach((f) => svg.append(mk('line', { x1: 0, x2: W, y1: Y(max * f), y2: Y(max * f), stroke: 'rgba(148,163,184,.18)', 'stroke-dasharray': '4 4' })));
  const line = (key) => samples.map((s, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(s[key]).toFixed(1)}`).join(' ');
  svg.append(mk('path', { d: line('online') + ` L${W},${H - 14} L0,${H - 14} Z`, fill: 'rgba(79,140,255,.18)' }), mk('path', { d: line('online'), fill: 'none', stroke: '#4f8cff', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }), mk('path', { d: line('calls'), fill: 'none', stroke: '#22c55e', 'stroke-width': 2, 'stroke-dasharray': '5 3' }));
  const lab = (x, y, t, anchor) => { const n = mk('text', { x, y, fill: '#8d9bb8', 'font-size': 11, 'text-anchor': anchor || 'start' }); n.textContent = t; return n; };
  svg.append(lab(4, 11, `max ${max}`), lab(W - 4, H - 2, '● online  - - calls', 'end')); box.replaceChildren(svg);
}

/* ---------- accounts ---------- */
const FILTERS = [['all', 'All'], ['online', 'Online'], ['incall', 'In a call'], ['offline', 'Offline'], ['unverified', 'Unverified'], ['banned', 'Banned'], ['gps', 'GPS shared']];
function buildChips() { $('#chips').replaceChildren(...FILTERS.map(([k, l]) => el('button', { class: 'chip' + (S.filter === k ? ' on' : ''), onclick: () => { S.filter = k; buildChips(); renderUsers(); } }, l))); }
async function renderUsers() {
  const d = await api(`/users?q=${encodeURIComponent(S.q)}&filter=${S.filter}&sort=${S.sort}`);
  $('#ubody').replaceChildren(...d.users.map((u) => {
    const loc = locText(u), dev = parseUA(u.ua);
    return el('tr', { onclick: () => openDrawer(u.num) },
      el('td', {}, el('div', { class: 'ucell' }, avatar(u), el('div', {}, el('b', { text: u.name }), el('small', { text: u.transport || 'not connected' })))),
      el('td', { class: 'mono', text: fmtId(u.num) }),
      el('td', {}, el('div', { class: 'loc' }, el('span', { class: 'mono', text: u.identifier }), verifiedTag(u))),
      el('td', { class: 'mono', text: u.ip || '—' }),
      el('td', {}, el('div', { class: 'loc' }, el('span', { text: loc.main }), el('small', { class: loc.gps ? 'gpsbadge' : '', text: loc.sub }))),
      el('td', { text: dev.label }), el('td', {}, statusTag(u)), el('td', { text: u.online ? 'now' : ago(u.lastActive) }));
  }));
  $('#uempty').classList.toggle('hidden', d.users.length > 0);
}
let uqT; $('#uq').addEventListener('input', (e) => { clearTimeout(uqT); uqT = setTimeout(() => { S.q = e.target.value.trim(); renderUsers().catch(fail); }, 250); });
$('#usort').addEventListener('change', (e) => { S.sort = e.target.value; renderUsers().catch(fail); });

/* ---------- account drawer ---------- */
const kv = (rows) => el('dl', { class: 'kv' }, rows.filter(Boolean).flatMap(([k, v]) => [el('dt', { text: k }), el('dd', {}, v == null || v === '' ? '—' : v)]));
const sec = (title, ...kids) => el('div', { class: 'sec' }, el('h4', { text: title }), ...kids);
const mapLinks = (lat, lon) => el('div', { class: 'mapbtns' }, el('a', { class: 'btn sm', href: osm(lat, lon), target: '_blank', rel: 'noopener noreferrer' }, 'OpenStreetMap ↗'), el('a', { class: 'btn sm', href: gmaps(lat, lon), target: '_blank', rel: 'noopener noreferrer' }, 'Google Maps ↗'));
const copyBtn = (text) => el('button', { class: 'btn sm', onclick: async () => { try { await navigator.clipboard.writeText(text); toast('Copied', 'good'); } catch { toast(text); } } }, 'Copy');
async function openDrawer(num) { S.openUser = num; $('#drawer').classList.remove('hidden'); $('#dScrim').classList.remove('hidden'); $('#dBody').replaceChildren(el('div', { class: 'empty', text: 'Loading…' })); try { await refreshDrawer(); } catch (e) { fail(e); closeDrawer(); } }
function closeDrawer() { S.openUser = null; $('#drawer').classList.add('hidden'); $('#dScrim').classList.add('hidden'); }
$('#dClose').addEventListener('click', closeDrawer); $('#dScrim').addEventListener('click', closeDrawer);

async function refreshDrawer() {
  if (!S.openUser) return;
  let d; try { d = await api('/users/' + S.openUser); } catch (e) { if (e.status === 404) { closeDrawer(); return; } throw e; }
  const u = d.user, dev = parseUA(u.ua), g = u.geo;
  $('#dAva').replaceChildren(...(u.avatar ? [el('img', { src: u.avatar, alt: '' })] : [(u.name || '?')[0].toUpperCase()])); $('#dName').textContent = u.name; $('#dSub').textContent = `ID ${fmtId(u.num)}${u.about ? ' · ' + u.about : ''}`;
  const body = $('#dBody'), keep = body.scrollTop, parts = [];
  parts.push(sec('Account', kv([['Email / Mobile', el('span', {}, el('span', { class: 'mono', text: u.identifier }), ' ', copyBtn(u.identifier))], ['Verification', el('span', {}, verifiedTag(u), ' ', u.verified ? null : el('button', { class: 'btn sm', onclick: () => doVerify(u) }, 'Mark verified'))], ['Status', statusTag(u)], ['Connection', u.transport || 'Not connected'], ['Created', `${fmtDate(u.firstSeen)} (${ago(u.firstSeen)})`], ['Last active', u.online ? 'Now' : `${fmtDate(u.lastActive)} (${ago(u.lastActive)})`], ['Last sign-in', u.lastSignin ? `${fmtDate(u.lastSignin.t)} · ${u.lastSignin.ip}` : '—'], u.banned && ['Ban reason', u.banReason || '—']])));
  parts.push(sec('Activity counters', kv([['Calls', u.calls], ['Chat messages', u.messages + ' (content is private)'], ['Contacts', u.contacts], ['Push devices', u.pushDevices], ['Reports against', u.reports]])));
  parts.push(sec('Network', kv([['IP address', el('span', {}, el('span', { class: 'mono', text: u.ip || '—' }), ' ', u.ip ? copyBtn(u.ip) : null)], ['ISP', g && g.isp]]),
    u.ipHistory.length > 1 ? el('div', { class: 'small muted' }, 'Previous IPs') : null, ...u.ipHistory.slice(1).map((h) => el('div', { class: 'iprow' }, el('span', { class: 'mono', text: h.ip }), el('span', { class: 'muted', text: ago(h.at) })))));
  parts.push(sec('Location · from IP address (approximate)', g && !g.local ? kv([['Country', flag(g.countryCode) + ' ' + (g.country || '—')], ['Region', g.region], ['City', g.city], ['Time zone', g.tz], ['Coordinates', g.lat != null ? `${g.lat}, ${g.lon}` : '—']]) : el('div', { class: 'muted', text: g && g.local ? 'Private / local network address — no public location.' : 'Not available (lookup pending or offline).' }), g && g.lat != null ? mapLinks(g.lat, g.lon) : null));
  parts.push(sec('Location · GPS (shared by user)', u.gps ? kv([['Latitude', u.gps.lat], ['Longitude', u.gps.lon], ['Accuracy', u.gps.acc == null ? '—' : '±' + u.gps.acc + ' m'], ['Updated', ago(u.gps.at)]]) : el('div', { class: 'muted', text: 'Not shared — the user did not allow (or turned off) precise location.' }), u.gps ? mapLinks(u.gps.lat, u.gps.lon) : null));
  parts.push(sec('Device', kv([['Browser', dev.br], ['System', dev.os], ['Model', dev.model || '—']]), el('div', { class: 'small muted mono', text: u.ua || '' })));
  parts.push(sec('Signed-in devices', ...(d.sessions.length ? d.sessions.map((s) => el('div', { class: 'iprow' }, el('span', { text: `${parseUA(s.ua).label} · ${s.ip || '?'}` }), el('span', { class: 'muted', text: 'used ' + ago(s.last) }))) : [el('div', { class: 'muted', text: 'No active sessions.' })])));
  parts.push(sec('Sign-in history', ...(d.signins.length ? d.signins.slice(0, 10).map((s) => el('div', { class: 'iprow' }, el('span', {}, el('span', { class: 'tag ' + (s.ok ? 'ok' : 'bad'), text: s.ok ? s.method : 'failed' }), ' ', el('span', { class: 'mono', text: s.ip || '' })), el('span', { class: 'muted', text: ago(s.t) }))) : [el('div', { class: 'muted', text: 'No sign-ins recorded.' })])));
  parts.push(sec('Actions', el('div', { class: 'actions' },
    el('button', { class: 'btn', onclick: () => doRename(u) }, 'Rename'), el('button', { class: 'btn', disabled: !u.online, onclick: () => doKick(u) }, 'Disconnect'),
    el('button', { class: 'btn', onclick: () => doSignOut(u) }, 'Sign out everywhere'), el('button', { class: 'btn', onclick: () => doReset(u) }, 'Reset password'),
    u.banned ? el('button', { class: 'btn ok', onclick: () => doUnban(u) }, 'Unban') : el('button', { class: 'btn warn', onclick: () => doBan(u) }, 'Ban'), el('button', { class: 'btn danger', onclick: () => doDelete(u) }, 'Delete'))));
  parts.push(sec('Recent calls', ...(d.calls.length ? d.calls.slice(0, 8).map((c) => el('div', { class: 'iprow' }, el('span', { text: `${c.callerName} → ${c.calleeName} · ${c.video ? 'video' : 'voice'}` }), el('span', { class: 'muted', text: `${c.reason || 'active'} · ${c.duration ? dur(c.duration) : '—'} · ${ago(c.startedAt)}` }))) : [el('div', { class: 'muted', text: 'No calls yet.' })])));
  parts.push(sec('Recent activity', ...(d.events.length ? d.events.slice(0, 8).map((e) => el('div', { class: 'iprow' }, el('span', { text: e.msg }), el('span', { class: 'muted', text: ago(e.t) }))) : [el('div', { class: 'muted', text: 'Nothing yet.' })])));
  body.replaceChildren(...parts); body.scrollTop = keep;
}
const act = async (fn, okMsg) => { try { await fn(); if (okMsg) toast(okMsg, 'good'); refreshDrawer(); tick(); } catch (e) { fail(e); } };
async function doRename(u) { const v = await ask({ title: 'Rename account', text: 'The new name must be unique.', fields: [{ name: 'name', label: 'New name', value: u.name, maxlength: 24 }], ok: 'Rename' }); if (v) act(() => api(`/users/${u.num}/rename`, { method: 'POST', body: { name: v.name } }), 'Renamed'); }
const doKick = (u) => act(() => api(`/users/${u.num}/kick`, { method: 'POST' }), u.name + ' disconnected');
const doVerify = (u) => act(() => api(`/users/${u.num}/verify`, { method: 'POST' }), 'Marked as verified');
async function doSignOut(u) { const v = await ask({ title: 'Sign out everywhere?', text: `${u.name} will be signed out on all devices and must sign in again.`, ok: 'Sign out' }); if (v) act(() => api(`/users/${u.num}/signout`, { method: 'POST' }), 'Signed out everywhere'); }
async function doReset(u) {
  const v = await ask({ title: 'Reset password?', text: `Creates a temporary password for ${u.name} and signs them out everywhere. Share it with them privately.`, ok: 'Reset password' }); if (!v) return;
  try { const r = await api(`/users/${u.num}/reset-password`, { method: 'POST' }); await ask({ title: 'Temporary password', text: 'Shown only once. Ask the user to change it after signing in.', fields: [{ name: 'p', label: 'Temporary password', value: r.temporaryPassword, readonly: true }], ok: 'Done', hideCancel: true }); refreshDrawer(); } catch (e) { fail(e); }
}
async function doBan(u) { const v = await ask({ title: 'Ban ' + u.name + '?', text: 'They are disconnected immediately and cannot sign in until unbanned.', fields: [{ name: 'reason', label: 'Reason (shown to the user)', placeholder: 'e.g. Spam' }], ok: 'Ban account', danger: true }); if (v) act(() => api(`/users/${u.num}/ban`, { method: 'POST', body: { reason: v.reason } }), 'Account banned'); }
const doUnban = (u) => act(() => api(`/users/${u.num}/unban`, { method: 'POST' }), 'Account unbanned');
async function doDelete(u) { const v = await ask({ title: 'Delete ' + u.name + '?', text: 'Removes the account, its contacts and chat history, frees the name/email/ID and signs them out. This cannot be undone.', ok: 'Delete', danger: true }); if (v) { try { await api('/users/' + u.num, { method: 'DELETE' }); toast('Account deleted', 'good'); closeDrawer(); tick(); } catch (e) { fail(e); } } }

/* ---------- sign-ins ---------- */
async function renderSignins() {
  const d = await api('/signins?q=' + encodeURIComponent(S.sq));
  $('#signBody').replaceChildren(...d.signins.map((s) => {
    const loc = s.geo && !s.geo.local ? flag(s.geo.countryCode) + ' ' + [s.geo.city, s.geo.country].filter(Boolean).join(', ') : s.geo && s.geo.local ? 'Local network' : '—';
    return el('tr', { onclick: s.num ? () => openDrawer(s.num) : null }, el('td', { text: fmtDate(s.t) }), el('td', { text: s.name || '—' }), el('td', { class: 'mono', text: s.identifier || '—' }), el('td', { text: s.method }),
      el('td', {}, el('span', { class: 'tag ' + (s.ok ? 'ok' : 'bad'), text: s.ok ? 'Success' : s.reason || 'Failed' })), el('td', { class: 'mono', text: s.ip || '—' }), el('td', { text: loc }), el('td', { text: parseUA(s.ua).label }));
  }));
  $('#sempty').classList.toggle('hidden', d.signins.length > 0);
}
let sqT; $('#sq').addEventListener('input', (e) => { clearTimeout(sqT); sqT = setTimeout(() => { S.sq = e.target.value.trim(); renderSignins().catch(fail); }, 250); });

/* ---------- live map (OpenStreetMap tiles, no library) ---------- */
const proj = (lat, lon, z) => { const n = 256 * 2 ** z, r = (lat * Math.PI) / 180; return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n }; };
async function renderMap() {
  const { points } = await api('/map'), box = $('#mapBox');
  if (!points.length) { box.replaceChildren(el('div', { class: 'empty', text: 'No location data yet — pins appear once users have an IP location or share GPS.' })); return; }
  const W = box.clientWidth || 800, H = box.clientHeight || 520, lats = points.map((p) => p.lat), lons = points.map((p) => p.lon);
  let z = 2; for (let zz = 14; zz >= 1; zz--) { const a = proj(Math.max(...lats), Math.min(...lons), zz), b = proj(Math.min(...lats), Math.max(...lons), zz); if (b.x - a.x < W - 140 && b.y - a.y < H - 140) { z = zz; break; } }
  z = Math.max(1, Math.min(18, z + S.mapDelta));
  const c = proj((Math.max(...lats) + Math.min(...lats)) / 2, (Math.max(...lons) + Math.min(...lons)) / 2, z), left = c.x - W / 2, top = c.y - H / 2, n = 2 ** z, kids = [];
  for (let tx = Math.floor(left / 256); tx <= Math.floor((left + W) / 256); tx++) for (let ty = Math.floor(top / 256); ty <= Math.floor((top + H) / 256); ty++) {
    if (ty < 0 || ty >= n) continue;
    const t = el('img', { class: 'maptile', src: `https://tile.openstreetmap.org/${z}/${((tx % n) + n) % n}/${ty}.png`, alt: '', referrerpolicy: 'origin', loading: 'lazy' });
    t.style.left = tx * 256 - left + 'px'; t.style.top = ty * 256 - top + 'px'; kids.push(t);
  }
  points.forEach((p) => {
    const q = proj(p.lat, p.lon, z), pin = el('div', { class: `pin ${p.online ? 'on' : ''} ${p.src}`, title: `${p.name} — ${[p.city, p.country].filter(Boolean).join(', ') || p.src.toUpperCase()}`, onclick: () => openDrawer(p.num) }, p.avatar ? el('img', { src: p.avatar, alt: '' }) : (p.name || '?')[0].toUpperCase());
    pin.style.left = q.x - left + 'px'; pin.style.top = q.y - top + 'px'; kids.push(pin);
  });
  box.replaceChildren(...kids);
}
$('#zoomIn').addEventListener('click', () => { S.mapDelta = Math.min(5, S.mapDelta + 1); renderMap().catch(fail); });
$('#zoomOut').addEventListener('click', () => { S.mapDelta = Math.max(-5, S.mapDelta - 1); renderMap().catch(fail); });

/* ---------- calls, reports, activity ---------- */
async function renderCalls() {
  const d = await api('/calls');
  $('#activeBody').replaceChildren(...d.active.map((c) => el('tr', {}, el('td', { text: `${c.callerName} (${fmtId(c.caller)})` }), el('td', { text: `${c.calleeName} (${fmtId(c.callee)})` }), el('td', { text: c.video ? 'Video' : 'Voice' }), el('td', {}, el('span', { class: 'tag ' + (c.state === 'active' ? 'ok' : 'warn'), text: c.state })), el('td', { class: 'mono', text: c.answeredAt ? dur((Date.now() - c.answeredAt) / 1000) : '—' }))));
  $('#aempty').classList.toggle('hidden', d.active.length > 0);
  const tone = (r) => (r === 'hangup' ? 'ok' : r === 'declined' || r === 'lost' ? 'bad' : r ? 'warn' : 'info');
  $('#histBody').replaceChildren(...d.history.map((c) => el('tr', {}, el('td', { text: fmtDate(c.startedAt) }), el('td', { text: c.callerName }), el('td', { text: c.calleeName }), el('td', { text: c.video ? 'Video' : 'Voice' }), el('td', {}, el('span', { class: 'tag ' + tone(c.reason), text: c.reason || 'in progress' })), el('td', { class: 'mono', text: c.duration ? dur(c.duration) : '—' }))));
  $('#hempty').classList.toggle('hidden', d.history.length > 0);
}
async function renderReports() {
  const d = await api('/reports');
  $('#repBody').replaceChildren(...d.reports.map((r) => el('tr', {}, el('td', { text: fmtDate(r.ts) }), el('td', {}, el('a', { class: 'link', href: '#', onclick: (e) => { e.preventDefault(); openDrawer(r.target); } }, r.targetName || r.target)), el('td', { text: r.reporterName || r.reporter }), el('td', { text: r.reason || '—' }),
    el('td', {}, el('span', { class: 'tag ' + (r.status === 'open' ? 'warn' : 'ok'), text: r.status })), el('td', {}, r.status === 'open' ? el('button', { class: 'btn sm', onclick: async () => { try { await api(`/reports/${r.id}/resolve`, { method: 'POST' }); renderReports(); tick(); } catch (e) { fail(e); } } }, 'Resolve') : null))));
  $('#rempty').classList.toggle('hidden', d.reports.length > 0);
}
async function renderEvents() {
  const d = await api('/events?q=' + encodeURIComponent(S.eq));
  const tone = { signup: 'ok', signin: 'info', admin: 'warn', call: 'info', rename: 'info', account: 'bad', report: 'bad', system: '' };
  $('#eventList').replaceChildren(...d.events.map((e) => el('div', { class: 'ev' }, el('span', { class: 'when', text: ago(e.t) }), el('span', { class: 'tag ' + (tone[e.type] || ''), text: e.type }), el('span', { class: 'msg', text: e.msg }))));
  $('#eempty').classList.toggle('hidden', d.events.length > 0);
}
let eqT; $('#eq').addEventListener('input', (e) => { clearTimeout(eqT); eqT = setTimeout(() => { S.eq = e.target.value.trim(); renderEvents().catch(fail); }, 250); });

/* ---------- tools ---------- */
function renderServer(ov) {
  const s = ov.server, up = s.uptime, yn = (b) => (b ? 'Enabled' : 'Not configured');
  $('#serverInfo').replaceChildren(...[['Uptime', `${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m`], ['Node.js', s.node], ['Memory', s.memoryMB + ' MB'], ['Database', s.dataFile], ['IP geolocation', s.geoip ? 'Enabled' : 'Disabled'],
    ['Web Push (closed-app calls)', yn(s.push)], ['Email verification codes', yn(s.otpEmail)], ['SMS verification codes', yn(s.otpSms)], ['Telegram alerts', yn(s.telegram)]].flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));
}
async function renderTwoFactor() {
  const s = await fetch('/admin/api/session', { credentials: 'same-origin' }).then((r) => r.json()); S.twoFactor = !!s.twoFactor;
  const tag = $('#tfTag'); tag.textContent = S.twoFactor ? 'On' : 'Off'; tag.className = 'tag ' + (S.twoFactor ? 'ok' : '');
  if ($('#tfBody').dataset.mode === (S.twoFactor ? 'on' : 'off') && $('#tfBody').children.length) return;
  $('#tfBody').dataset.mode = S.twoFactor ? 'on' : 'off';
  if (S.twoFactor) {
    $('#tfBody').replaceChildren(el('div', { class: 'tfsetup' }, el('label', { for: 'tfPw', text: 'Password' }), el('input', { id: 'tfPw', type: 'password', class: 'input', autocomplete: 'current-password' }), el('label', { for: 'tfCode', text: 'Current authenticator code' }), el('input', { id: 'tfCode', class: 'input', inputmode: 'numeric', maxlength: 6 }),
      el('button', { class: 'btn danger', onclick: async () => { try { await api('/2fa/disable', { method: 'POST', body: { password: $('#tfPw').value, code: $('#tfCode').value } }); toast('Two-factor authentication disabled', 'good'); $('#tfBody').replaceChildren(); renderTwoFactor(); } catch (e) { fail(e); } } }, 'Disable 2FA')));
  } else {
    $('#tfBody').replaceChildren(el('button', { class: 'btn primary', onclick: async () => {
      try {
        const r = await api('/2fa/setup', { method: 'POST' });
        $('#tfBody').replaceChildren(el('div', { class: 'tfsetup' }, el('p', { class: 'small muted', text: 'In your authenticator app choose “Enter a setup key” and type this key (account: admin, type: time-based):' }), el('div', { class: 'secret', text: r.secret }), copyBtn(r.secret),
          el('a', { class: 'link', href: r.uri }, 'Open in authenticator app ↗'), el('label', { for: 'tfNew', text: 'Enter the 6-digit code to confirm' }), el('input', { id: 'tfNew', class: 'input', inputmode: 'numeric', maxlength: 6 }),
          el('button', { class: 'btn primary', onclick: async () => { try { await api('/2fa/enable', { method: 'POST', body: { code: $('#tfNew').value } }); toast('Two-factor authentication enabled', 'good'); $('#tfBody').replaceChildren(); renderTwoFactor(); } catch (e) { fail(e); } } }, 'Enable 2FA')));
      } catch (e) { fail(e); }
    } }, 'Set up 2FA'));
  }
}
$('#bcBtn').addEventListener('click', async () => { const text = $('#bcText').value.trim(); if (!text) return toast('Write a message first', 'bad'); try { const r = await api('/broadcast', { method: 'POST', body: { text } }); toast(`Sent to ${r.delivered} online user${r.delivered === 1 ? '' : 's'}`, 'good'); $('#bcText').value = ''; } catch (e) { fail(e); } });
$('#pwBtn').addEventListener('click', async () => { try { await api('/password', { method: 'POST', body: { current: $('#pwCur').value, next: $('#pwNew').value } }); toast('Password updated', 'good'); $('#pwCur').value = ''; $('#pwNew').value = ''; } catch (e) { fail(e); } });
$('#bkBtn').addEventListener('click', async () => { try { const r = await api('/backup', { method: 'POST' }); toast('Backup saved: ' + r.file, 'good'); } catch (e) { fail(e); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('#modal').classList.contains('hidden')) $('#mCancel').click(); else closeDrawer(); } });

/* ---------- boot ---------- */
paintIcons(); buildChips();
fetch('/admin/api/session', { credentials: 'same-origin' }).then((r) => r.json()).then((s) => (s.authenticated ? showApp() : showLogin())).catch(showLogin);
})();
