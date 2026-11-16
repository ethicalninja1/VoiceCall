'use strict';
(() => {
/* =====================================================================
 * VoiceCall client
 *  1. Helpers & icons        5. Calling (dial / incoming / hang-up)
 *  2. Session & shared state 6. WebRTC, data channel, filters, tools
 *  3. Tones & notifications  7. In-call chat, emojis, files, voice notes
 *  4. Network (WS + polling) 8. Auth, home, chats, contacts, profile, settings
 * ===================================================================== */

/* ---------------------------- 1. Helpers ---------------------------- */
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rid = () => Math.random().toString(36).slice(2, 10);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('vc_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('vc_' + k, JSON.stringify(v)); } catch {} },
};
const pad = (n) => String(n).padStart(2, '0');
const fmtId = (n) => String(n).replace(/(\d{3})(?=\d)/, '$1 ');
const initial = (s) => ((s || '?').trim()[0] || '?').toUpperCase();
const fmtDur = (s) => (s >= 3600 ? Math.floor(s / 3600) + ':' : '') + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
const fmtClock = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtWhen = (ts) => {
  const d = new Date(ts);
  return d.toDateString() === new Date().toDateString() ? fmtClock(ts) : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + fmtClock(ts);
};
const fmtSize = (b) => (b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
const randomNum = () => String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');

const IC = {
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>',
  video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  speaker: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  wand: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M15 9h.01M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/>',
  flip: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  paperclip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  record: '<circle cx="12" cy="12" r="8"/>',
  pip: '<rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="12" width="8" height="6" rx="1"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  backspace: '<path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
};
Object.assign(IC, {
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  backspace: '<path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/>',
});
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IC[n]}</svg>`;
document.querySelectorAll('[data-ic]').forEach((el) => {
  el.innerHTML = icon(el.dataset.ic) + (el.dataset.label ? `<span>${el.dataset.label}</span>` : '');
});
// tiles / tab buttons keep their text node after the icon span
document.querySelectorAll('.tile > span[data-ic], .tabbtn > span[data-ic]').forEach((el) => { el.style.display = 'contents'; });

let toastT;
function toast(msg, ms = 2800, onClick) {
  const el = $('toast'); el.textContent = msg; el.classList.add('show'); el.onclick = onClick ? () => { el.classList.remove('show'); onClick(); } : null;
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms);
}

/* ------------------------ 2. Settings, session & shared state ------------------------ */
const cfg = {
  vol: store.get('vol', 0.6), vibrate: store.get('vibrate', true), quality: store.get('quality', 'auto'),
  ns: store.get('ns', true), dnd: store.get('dnd', false), loc: store.get('loc', false), view: store.get('view', 'grid'),
};
const saveCfg = () => Object.entries(cfg).forEach(([k, v]) => store.set(k, v));

const session = { token: store.get('token', '') };
let me = store.get('me', null) || { num: '', name: '', avatar: '', about: '', identifier: '', idType: '', verified: false, settings: { showLastSeen: true }, contacts: [], blocks: [] };
let contactMap = new Map((me.contacts || []).map((c) => [c.num, c.name]));
const profiles = new Map(Object.entries(store.get('profiles', {})));   // num -> { name, avatar, about, online, lastSeen }
let callHistory = store.get('callHistory', []);
let verification = { email: false, phone: false };
let vapidKey = '';

/* batched, flicker-free re-rendering */
const RENDER = {}, dirtyR = new Set(); let rafR = 0;
function scheduleRender(...names) {
  names.forEach((n) => dirtyR.add(n));
  if (!rafR) rafR = requestAnimationFrame(() => { rafR = 0; const d = [...dirtyR]; dirtyR.clear(); d.forEach((n) => RENDER[n] && RENDER[n]()); });
}
let saveProfT = 0;
function rememberProfiles(map) {
  if (!map) return;
  for (const [num, p] of Object.entries(map)) profiles.set(num, Object.assign(profiles.get(num) || {}, p));
  clearTimeout(saveProfT); saveProfT = setTimeout(() => store.set('profiles', Object.fromEntries([...profiles].slice(-250))), 800);
}
function setMe(p) {
  me = Object.assign(me, p || {});
  contactMap = new Map((me.contacts || []).map((c) => [c.num, c.name]));
  store.set('me', me); renderMe(); scheduleRender('contacts', 'chats', 'calls');
}

const profileOf = (num) => profiles.get(num) || {};
const avatarOf = (num) => (num === me.num ? me.avatar : profileOf(num).avatar) || '';
const contactName = (num) => contactMap.get(num) || (num === me.num ? me.name : profileOf(num).name) || '';
const displayName = (num) => contactName(num) || fmtId(num);
const isOnline = (num) => !!profileOf(num).online;
const colorFor = (num) => { const n = parseInt(num, 10) || 0; return `linear-gradient(135deg,hsl(${(n * 37) % 360} 68% 52%),hsl(${(n * 37 + 55) % 360} 68% 40%))`; };

function agoText(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short' });
}
function lastSeenText(p) {
  if (!p) return '';
  if (p.online) return 'Online';
  if (p.lastSeen) {
    const d = new Date(p.lastSeen), n = new Date(), t = fmtClock(p.lastSeen);
    if (d.toDateString() === n.toDateString()) return 'Last seen today at ' + t;
    if (d.toDateString() === new Date(n - 86400000).toDateString()) return 'Last seen yesterday at ' + t;
    return 'Last seen ' + d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }
  return 'Offline';
}
const shortSeen = (p) => (p.online ? 'Online' : p.lastSeen ? 'Seen ' + agoText(p.lastSeen) : 'Offline');

/* tiny DOM builder (all user text goes through textContent) */
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) { if (kid == null || kid === false) continue; e.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return e;
}
function ava(num, name, size = 'md', dot = false) {
  const a = h('div', { class: 'ava ' + size }), url = avatarOf(num);
  if (url) { const i = new Image(); i.src = url; i.alt = ''; i.decoding = 'async'; i.loading = 'lazy'; a.append(i); }
  else { a.textContent = initial(name); a.style.background = colorFor(num); }
  if (dot) a.append(h('i', { class: 'pdot' + (isOnline(num) ? ' on' : '') }));
  return a;
}
function setBigAva(elm, peer) {
  elm.replaceChildren(); elm.style.background = '';
  if (peer && peer.avatar) { const i = new Image(); i.src = peer.avatar; i.alt = ''; elm.append(i); }
  else { elm.textContent = initial(peer && peer.name); elm.style.background = colorFor(peer && peer.num); }
}
const $$ = (s) => [...document.querySelectorAll(s)];
let autoAnswerUntil = 0;      // set when the app is opened from an "Answer" notification

/* ------------------- 3. Tones, vibration, notifications ------------------- */
const Tone = {
  ctx: null, timer: null, nodes: [],
  unlock() {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {}
  },
  play(freqs, onMs, offMs, vol) {
    this.stop(); this.unlock();
    if (!this.ctx || vol <= 0) return;
    const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.ctx.destination);
    const oscs = freqs.map((f) => { const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(); return o; });
    this.nodes = [...oscs, g];
    let on = true;
    const step = () => { g.gain.setTargetAtTime(on ? vol : 0, this.ctx.currentTime, 0.015); this.timer = setTimeout(step, on ? onMs : offMs); on = !on; };
    step();
  },
  ring() { this.play([440, 480], 1000, 2000, cfg.vol * 0.5); },
  ringback() { this.play([425], 1000, 3000, 0.08); },
  stop() {
    clearTimeout(this.timer);
    this.nodes.forEach((n) => { try { if (n.stop) n.stop(); n.disconnect(); } catch {} });
    this.nodes = [];
  },
};
const Vib = {
  t: null,
  start() { if (!cfg.vibrate || !navigator.vibrate) return; const go = () => navigator.vibrate([700, 300, 700]); go(); this.t = setInterval(go, 3000); },
  stop() { clearInterval(this.t); if (navigator.vibrate) navigator.vibrate(0); },
};
async function notify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = navigator.serviceWorker ? await navigator.serviceWorker.ready : null;
    if (reg) await reg.showNotification(title, { body, tag, renotify: true, requireInteraction: tag === 'incoming', vibrate: [300, 150, 300], icon: 'icon-192.png', badge: 'icon-192.png' });
    else new Notification(title, { body, tag });
  } catch {}
}
async function clearNotify(tag) {
  try { const reg = navigator.serviceWorker ? await navigator.serviceWorker.ready : null; if (reg) (await reg.getNotifications({ tag })).forEach((n) => n.close()); } catch {}
}
async function enableNotifications() {
  Tone.unlock();
  if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
  if ('serviceWorker' in navigator) { try { await navigator.serviceWorker.register('sw.js'); } catch {} }
}
document.addEventListener('pointerdown', () => Tone.unlock(), { passive: true });

/* ----------------------- 4. Network (WebSocket + HTTP-polling fallback) ----------------------- */
const Net = {
  ws: null, status: 'connecting', started: false, stopped: false, wsFails: 0, polling: false, registered: false,
  hb: null, pongT: null, q: Promise.resolve(), lastError: '',
  get online() { return this.status === 'online'; },
  get mode() { return this.ws && this.ws.readyState === 1 ? 'WebSocket' : this.polling ? 'HTTP polling' : 'none'; },
  setStatus(s) { if (this.status !== s) { this.status = s; renderNet(); } },
  start() { this.started = true; this.stopped = false; this.connectWS(); },
  restart() { this.started = true; this.stopped = false; this.wsFails = 0; this.registered = false; this.polling = false; if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; } this.connectWS(); },
  stop() { this.stopped = true; this.started = false; this.polling = false; this.registered = false; clearInterval(this.hb); try { if (this.ws) this.ws.close(); } catch {} },

  connectWS() {
    if (this.stopped || !session.token || (this.ws && this.ws.readyState <= 1)) return;
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    let ws, opened = false, t0 = 0;
    try { ws = new WebSocket(url); } catch (e) { this.lastError = String(e); this.wsFails++; return this.afterFail(); }
    this.ws = ws;
    const guard = setTimeout(() => { if (!opened) try { ws.close(); } catch {} }, 7000);
    ws.onopen = () => {
      opened = true; t0 = Date.now(); clearTimeout(guard); this.polling = false; this.registered = false;
      ws.send(JSON.stringify({ type: 'register', token: session.token }));
      clearInterval(this.hb); this.hb = setInterval(() => this.rawSend({ type: 'ping' }), 20000);
    };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.onRaw(m); };
    ws.onclose = () => {
      clearTimeout(guard); clearInterval(this.hb);
      if (this.ws !== ws) return;
      this.ws = null; this.registered = false;
      if (this.stopped) return;
      if (!opened || Date.now() - t0 < 5000) this.wsFails++; else this.wsFails = 0;
      if (!this.polling) this.setStatus('connecting');
      this.afterFail();
    };
    ws.onerror = () => { this.lastError = 'WebSocket error'; };
  },
  afterFail() {
    if (this.wsFails >= 2) this.pollLoop();
    setTimeout(() => this.connectWS(), Math.min(1000 * 2 ** this.wsFails, 20000));
  },

  async api(method, url, body, timeout = 10000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(url, { method, signal: ctl.signal, cache: 'no-store', headers: Object.assign({ 'X-VC-Token': session.token }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
      if (r.status === 401) { this.registered = false; throw new Error('auth'); }
      if (!r.ok) throw new Error('http ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  },
  async pollLoop() {
    if (this.polling || this.stopped) return;
    this.polling = true; let backoff = 1000;
    while (this.polling && !this.stopped) {
      try {
        if (!this.registered) {
          const r = await this.api('POST', '/api/register', { token: session.token });
          this.onRaw(r);
          if (r.type !== 'registered') { await sleep(1500); continue; }
        }
        const r = await this.api('GET', '/api/poll', null, 35000);
        (r.msgs || []).forEach((m) => this.onRaw(m));
        backoff = 1000;
      } catch (e) { this.lastError = String(e.message || e); this.setStatus('connecting'); await sleep(backoff); backoff = Math.min(backoff * 2, 10000); }
    }
  },
  rawSend(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); },
  send(obj) {
    if (this.ws && this.ws.readyState === 1 && this.registered) { this.ws.send(JSON.stringify(obj)); return true; }
    if (this.polling && this.registered) { this.q = this.q.then(() => this.api('POST', '/api/send', { msg: obj })).catch(() => {}); return true; }
    return false;
  },
  check() {
    if (!this.started || this.stopped) return;
    if (!this.ws || this.ws.readyState !== 1) return this.connectWS();
    this.rawSend({ type: 'ping' });
    clearTimeout(this.pongT); this.pongT = setTimeout(() => { try { this.ws.close(); } catch {} }, 4000);
  },
  onRaw(m) { if (m.type === 'pong') { clearTimeout(this.pongT); return; } onServer(m); },
};
function renderNet() {
  const e = $('net'), s = Net.status;
  e.classList.toggle('on', s === 'online'); e.classList.toggle('off', s === 'offline');
  e.lastElementChild.textContent = s === 'online' ? 'Online' : s === 'offline' ? 'Offline' : 'Connecting…';
}

function onServer(m) {
  switch (m.type) {
    case 'registered':
      Net.registered = true; Net.setStatus('online'); vapidKey = m.vapid || vapidKey; setMe(m.profile); onRegistered(); break;
    case 'error':
      if (m.code === 'auth') { Net.stop(); signOutLocal('Your session has expired. Please sign in again.'); }
      else if (m.code === 'banned') { Net.stop(); Net.setStatus('offline'); showBlocked('Account blocked', m.message || 'Your account has been blocked by the administrator.'); }
      break;
    case 'replaced':
      Net.stop(); Net.setStatus('offline');
      if (confirm('Your account was opened on another device or tab. Use it here instead?')) location.reload();
      break;
    case 'kicked':
      Net.stop(); Net.setStatus('offline');
      if (C) finishCall('Disconnected by the administrator', { status: 'failed' });
      if (INC) stopIncoming();
      if (m.reason === 'deleted') { wipeAll(); location.reload(); }
      else if (m.reason === 'signed_out') signOutLocal('You were signed out. Please sign in again.');
      else if (m.reason === 'banned') showBlocked('Account blocked', 'Your account has been blocked by the administrator.');
      else showBlocked('Disconnected', 'You were disconnected by the administrator.', true);
      break;
    case 'profile': setMe(m.profile); break;
    case 'name_error': toast(m.message || 'Could not change the name', 4000); break;
    case 'contacts': me.contacts = m.list; rememberProfiles(m.profiles); setMe({}); syncWatch(); break;
    case 'blocks': me.blocks = m.list; setMe({}); renderBlockCount(); refreshProfileDlg(); renderDirectHeader(); break;
    case 'presence': rememberProfiles(m.profiles); scheduleRender('chats', 'contacts', 'direct', 'calls'); break;
    case 'presence_update': rememberProfiles({ [m.profile.num]: m.profile }); scheduleRender('chats', 'contacts', 'direct', 'dial'); break;
    case 'profiles': rememberProfiles(m.profiles); scheduleRender('chats', 'contacts', 'direct', 'calls', 'dial'); break;
    case 'lookup_result': onLookup(m); break;
    case 'chats': onChats(m); break;
    case 'history': onHistory(m); break;
    case 'msg': onDirectMsg(m); break;
    case 'msg_sent': onMsgSent(m); break;
    case 'msg_status': onMsgStatus(m); break;
    case 'msg_fail': onMsgFail(m); break;
    case 'typing_from': onTypingFrom(m); break;
    case 'call_history': callHistory = m.list; store.set('callHistory', callHistory.slice(0, 40)); rememberProfiles(m.profiles); scheduleRender('calls', 'badges'); syncWatch(); break;
    case 'call_rec': callHistory = [m.rec, ...callHistory.filter((x) => x.id !== m.rec.id)].slice(0, 60); store.set('callHistory', callHistory.slice(0, 40)); scheduleRender('calls', 'badges'); break;
    case 'toast': toast(m.text); break;
    case 'announcement': toast('📢 ' + m.text, 9000); if (document.hidden) notify('Announcement', m.text, 'announce'); break;
    case 'incoming': onIncoming(m); break;
    case 'ringing': if (C && C.dir === 'out') { C.id = m.callId; C.state = 'ringing'; setStatus('Ringing…'); } break;
    case 'busy': case 'unavailable': onRejected(m); break;
    case 'accepted': onAccepted(); break;
    case 'signal': onSignal(m.data); break;
    case 'ended': onEnded(m); break;
    default: break;
  }
}

/* ----------------------------- 5. Calling ----------------------------- */
let C = null;      // active (outgoing / connecting / connected) call
let INC = null;    // ringing incoming call, not answered yet
const ui = { endT: null };
let ICE = [{ urls: 'stun:stun.l.google.com:19302' }];

function newCall(o) {
  return Object.assign({
    id: null, dir: 'out', peer: { num: '', name: '' }, video: false, remoteWantsVideo: false, state: 'calling',
    startedAt: null, mic: null, cam: null, out: null, ctx: null, pc: null, dc: null, vSender: null, pending: [],
    remote: new MediaStream(), peerCam: false, peerMic: true, peerShare: false, micOn: true, camOn: true, spkOn: true,
    filter: 0, facing: 'user', sharing: false, shareStream: null, rec: null, poor: false, unread: 0, sendQ: Promise.resolve(),
    rx: null, files: {}, timers: [],
  }, o);
}

async function getLocalMedia(video) {
  const raw = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: cfg.ns, autoGainControl: true, channelCount: 1 },
    video: video ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : false,
  });
  if (!C) { raw.getTracks().forEach((t) => t.stop()); throw new Error('cancelled'); }
  C.mic = new MediaStream(raw.getAudioTracks());
  if (video) { C.cam = new MediaStream(raw.getVideoTracks()); await startPipeline(); }
}

async function placeCall(num, video) {
  if (C || INC) return toast('You are already in a call');
  if (!/^\d{6}$/.test(num)) return toast('Enter a 6-digit ID');
  if (num === me.num) return toast("You can't call yourself");
  if (!Net.online) return toast('Not connected to the server yet — please wait');
  Tone.unlock();
  C = newCall({ dir: 'out', peer: { num, name: displayName(num), avatar: avatarOf(num) }, video });
  showCall(); setStatus('Calling…');
  try { await getLocalMedia(video); }
  catch (e) { if (C) finishCall(video ? 'Camera / microphone permission is required' : 'Microphone permission is required', { status: 'failed' }); return; }
  if (!C) return;
  if (!Net.send({ type: 'call', to: num, video })) return finishCall('Not connected to the server', { status: 'failed' });
  Tone.ringback();
  C.timers.push(setTimeout(() => { if (C && C.state !== 'active') hangup('No answer'); }, 50000));
}

function onRejected(m) {
  if (!C || C.dir !== 'out' || C.state === 'active') return;
  let msg = 'Could not connect the call';
  if (m.type === 'busy') msg = m.reason === 'dnd' ? 'User is not available (Do not disturb)' : m.reason === 'self' ? 'You are already in a call' : 'User is busy on another call';
  else msg = m.reason === 'blocked' ? 'You have blocked this contact' : m.reason === 'invalid' ? 'Invalid ID' : 'User is offline — they need VoiceCall open to receive calls';
  finishCall(msg, { status: m.type === 'busy' ? 'busy' : 'noanswer', delay: 2200 });
}

function onAccepted() {
  if (!C || C.dir !== 'out') return;
  Tone.stop(); C.state = 'connecting'; setStatus('Connecting…');
  startAsCaller().catch((e) => finishCall('Call setup failed: ' + e.message, { status: 'failed' }));
}

function onIncoming(m) {
  if (C || INC) return;
  INC = { callId: m.callId, from: m.from, name: contactName(m.from) || m.name || fmtId(m.from), video: !!m.video, avatar: m.avatar || avatarOf(m.from) };
  setBigAva($('incAva'), { num: INC.from, name: INC.name, avatar: INC.avatar }); $('incName').textContent = INC.name;
  $('incSub').textContent = `${INC.video ? 'Incoming video call' : 'Incoming voice call'} · ${fmtId(INC.from)}`;
  $('incVoiceWrap').classList.toggle('hidden', !INC.video);
  $('incoming').classList.remove('hidden');
  Tone.ring(); Vib.start();
  if (document.hidden) notify('Incoming ' + (INC.video ? 'video' : 'voice') + ' call', INC.name, 'incoming');
  if (Date.now() < autoAnswerUntil) acceptIncoming(INC.video);
}
function stopIncoming() {
  Tone.stop(); Vib.stop(); clearNotify('incoming');
  $('incoming').classList.add('hidden'); INC = null;
}
async function acceptIncoming(withVideo) {
  if (!INC) return;
  const inc = INC; stopIncoming(); Tone.unlock();
  C = newCall({ dir: 'in', id: inc.callId, peer: { num: inc.from, name: inc.name, avatar: inc.avatar }, video: withVideo, remoteWantsVideo: inc.video, state: 'connecting' });
  showCall(); setStatus('Connecting…');
  try { await getLocalMedia(withVideo); }
  catch { Net.send({ type: 'decline' }); if (C) finishCall('Camera / microphone permission is required', { status: 'failed' }); return; }
  if (!C) return;
  createPC();
  Net.send({ type: 'accept' });
  C.timers.push(setTimeout(() => { if (C && C.state !== 'active') hangup('Connection timed out'); }, 30000));
}
function declineIncoming() {
  if (!INC) return;
  const i = INC; Net.send({ type: 'decline' });
  logRecent({ num: i.from, name: i.name, dir: 'in', status: 'declined', video: i.video });
  stopIncoming();
}

function hangup(msg) {
  if (!C) return;
  const st = C.state;
  Net.send({ type: st === 'calling' || st === 'ringing' ? 'cancel' : 'bye' });
  finishCall(msg || 'Call ended', { status: st === 'active' ? 'completed' : C.dir === 'out' ? 'cancelled' : 'failed' });
}

function onEnded(m) {
  const text = { declined: 'Call declined', cancelled: 'Call cancelled', hangup: 'Call ended', timeout: 'No answer', lost: 'Connection lost', unavailable: 'User went offline' }[m.reason] || 'Call ended';
  if (INC && (!m.callId || INC.callId === m.callId)) {
    const i = INC; stopIncoming();
    logRecent({ num: i.from, name: i.name, dir: 'in', status: 'missed', video: i.video });
    notify('Missed call', `${i.name} (${fmtId(i.from)})`, 'missed'); toast('Missed call from ' + i.name);
    return;
  }
  if (C && (!m.callId || !C.id || C.id === m.callId)) {
    const status = C.state === 'active' ? 'completed' : C.dir === 'out' ? (m.reason === 'declined' ? 'declined' : 'noanswer') : 'missed';
    finishCall(text, { status });
  }
}

function logRecent() {}   // call history now comes from the server (call_rec / call_history)

function finishCall(msg, o = {}) {
  const c = C; if (!c) return;
  C = null;
  Tone.stop();
  c.timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
  stopRecording(c, true);
  if (VN.rec) vnStop(false);
  if (c.shareStream) c.shareStream.getTracks().forEach((t) => t.stop());
  [c.mic, c.cam].forEach((s) => s && s.getTracks().forEach((t) => t.stop()));
  try { if (c.dc) c.dc.close(); } catch {}
  try { if (c.pc) c.pc.close(); } catch {}
  try { if (document.pictureInPictureElement) document.exitPictureInPicture(); } catch {}
  if (wake) { try { wake.release(); } catch {} wake = null; }
  logRecent({ num: c.peer.num, name: c.peer.name, dir: c.dir, status: o.status || 'completed', video: c.video || c.remoteWantsVideo, dur: c.startedAt ? Math.round((Date.now() - c.startedAt) / 1000) : 0 });
  // show the outcome briefly, then return to the home screen
  $('call').classList.add('pre'); $('stage').classList.remove('hidden'); $('remote').style.visibility = 'hidden';
  $('stageSub').textContent = msg; $('timer').textContent = '—'; $('dot').className = 'dot bad';
  closeTrays(); openChat(false);
  clearTimeout(ui.endT);
  ui.endT = setTimeout(() => { if (!C) { $('call').classList.add('hidden'); $('remote').srcObject = null; } }, o.delay || 1200);
  if (c.dir === 'in' || o.delay) { /* status already visible on stage */ } else toast(msg);
}

/* --------------------------- Call screen UI --------------------------- */
let wake = null;
async function showCall() {
  clearTimeout(ui.endT);
  closeTrays(); openChat(false);
  $('msgs').innerHTML = ''; $('badge').classList.add('hidden');
  $('remote').srcObject = null; $('remote').style.visibility = 'hidden';
  $('call').classList.remove('hidden'); $('call').classList.add('pre'); $('call').classList.remove('sharing');
  $('stage').classList.remove('hidden');
  const n = C.peer.name;
  setBigAva($('avatar'), C.peer); $('stageTitle').textContent = n; $('topName').textContent = n;
  $('chatTitle').textContent = n; setBigAva($('chatAv'), C.peer); $('chatSub').textContent = 'online';
  $('timer').textContent = 'Calling…'; $('quality').textContent = ''; $('dot').className = 'dot';
  $('recBanner').classList.add('hidden'); $('banner').classList.add('hidden'); $('peerMuted').classList.add('hidden'); $('stats').classList.add('hidden');
  buildFilterTray(); buildReactTray(); syncVideoUI(); syncButtons(); renderSendBtn();
  try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch {}
}
function setStatus(t) { if (C || $('call').classList.contains('hidden') === false) { $('stageSub').textContent = t; if (C && C.state !== 'active') $('timer').textContent = t; } }
function banner(t) { const b = $('banner'); if (!t) return b.classList.add('hidden'); b.textContent = t; b.classList.remove('hidden'); }
function closeTrays() { ['filterTray', 'reactTray', 'more'].forEach((id) => $(id).classList.add('hidden')); }
function syncVideoUI() {
  if (!C) return;
  $('pip').classList.toggle('hidden', !C.out);
  $('local').classList.toggle('mirror', C.facing === 'user');
  const fx = 'filter' in CanvasRenderingContext2D.prototype;
  $('mFilters').classList.toggle('hidden', !fx);
  $('mShare').classList.toggle('hidden', !(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia));
  $('mPip').classList.toggle('hidden', !document.pictureInPictureEnabled);
  $('mFilters').classList.toggle('dis', !C.out); $('mFlip').classList.toggle('dis', !C.out);
}
function syncButtons() {
  if (!C) return;
  $('bMic').classList.toggle('off', !C.micOn);
  $('bCam').classList.toggle('off', !(C.out && C.camOn));
  $('bSpk').classList.toggle('off', !C.spkOn);
  $('pip').classList.toggle('camoff', !!C.out && !C.camOn);
  $('mRecLbl').textContent = C.rec ? 'Stop recording' : 'Record';
  $('mRec').classList.toggle('on', !!C.rec);
  $('mShareLbl').textContent = C.sharing ? 'Stop sharing' : 'Share screen';
  $('mShare').classList.toggle('on', !!C.sharing);
  $('mQualityLbl').textContent = 'Quality: ' + ({ auto: 'Auto', hd: 'HD', sd: 'Standard', low: 'Data saver' }[cfg.quality]);
  $('mNsLbl').textContent = 'Noise cancel: ' + (cfg.ns ? 'On' : 'Off');
  $('mNs').classList.toggle('on', cfg.ns);
}
function updateRemote() {
  if (!C) return;
  const show = C.state === 'active' && (C.peerCam || C.peerShare);
  $('remote').style.visibility = show ? 'visible' : 'hidden';
  $('stage').classList.toggle('hidden', show);
  $('call').classList.toggle('sharing', !!C.peerShare);
  $('peerMuted').classList.toggle('hidden', C.peerMic !== false);
}
function goActive() {
  C.state = 'active'; C.startedAt = Date.now(); Tone.stop();
  C.timers.forEach((t) => clearTimeout(t));
  $('call').classList.remove('pre'); $('dot').className = 'dot ok'; $('stageSub').textContent = 'Connected';
  C.timers.push(setInterval(tick, 1000), setInterval(pollStats, 2500));
  tick(); applyQuality(); sendState(); updateRemote();
}
function tick() { if (C && C.startedAt) $('timer').textContent = fmtDur(Math.floor((Date.now() - C.startedAt) / 1000)); }

/* Dock controls */
$('bMic').onclick = () => { if (!C) return; C.micOn = !C.micOn; C.mic && C.mic.getAudioTracks().forEach((t) => (t.enabled = C.micOn)); syncButtons(); sendState(); };
$('bCam').onclick = async () => {
  if (!C || C.state !== 'active') return toast('Available once the call connects');
  if (!C.out) return enableCamera();
  C.camOn = !C.camOn; C.out.enabled = C.camOn; syncButtons(); sendState();
};
$('bSpk').onclick = () => { if (!C) return; C.spkOn = !C.spkOn; $('remote').muted = !C.spkOn; syncButtons(); toast(C.spkOn ? '🔊 Speaker on' : '🔇 Speaker off'); };
$('bChat').onclick = () => openChat(!chatOpen);
$('bMore').onclick = () => { syncButtons(); $('more').classList.toggle('hidden'); };
$('moreClose').onclick = () => $('more').classList.add('hidden');
$('more').onclick = (e) => { if (e.target === $('more')) $('more').classList.add('hidden'); };
$('bEnd').onclick = () => hangup();
$('remote').onclick = () => document.querySelector('.dock').classList.toggle('hidden');
$('incAccept').onclick = () => acceptIncoming(!!(INC && INC.video));
$('incVoice').onclick = () => acceptIncoming(false);
$('incDecline').onclick = declineIncoming;

/* ----------------- 6. WebRTC, data channel, tools ----------------- */
const FILTERS = [
  { n: 'Normal', e: '🙂', css: '' },
  { n: 'Beauty', e: '✨', css: 'brightness(1.08) saturate(1.1) contrast(.96)', soft: { blur: 4, alpha: 0.45 } },
  { n: 'Warm', e: '🌅', css: 'sepia(.25) saturate(1.35) hue-rotate(-8deg) brightness(1.05)' },
  { n: 'Cool', e: '❄️', css: 'saturate(1.1) hue-rotate(15deg) brightness(1.05) contrast(1.05)' },
  { n: 'Vivid', e: '🌈', css: 'saturate(1.8) contrast(1.1)' },
  { n: 'Dreamy', e: '☁️', css: 'brightness(1.12) saturate(1.2)', soft: { blur: 8, alpha: 0.4 } },
  { n: 'Vintage', e: '📷', css: 'sepia(.6) contrast(1.1) brightness(.95)', vignette: true },
  { n: 'B&W', e: '⚫', css: 'grayscale(1) contrast(1.15)' },
  { n: 'Cinema', e: '🎬', css: 'contrast(1.2) saturate(.9) sepia(.15)', bars: true, vignette: true },
  { n: 'Night', e: '🌙', css: 'grayscale(1) sepia(1) hue-rotate(65deg) saturate(3) brightness(1.3)' },
];
const REACTIONS = ['❤️', '👍', '😂', '😮', '👏', '🔥', '🎉', '🙏'];

async function startPipeline() {
  const cam = $('cam');
  cam.srcObject = C.cam;
  await cam.play().catch(() => {});
  if (!cam.videoWidth) await Promise.race([new Promise((r) => cam.addEventListener('loadedmetadata', r, { once: true })), sleep(3000)]);
  const c = $('local');
  c.width = cam.videoWidth || 640; c.height = cam.videoHeight || 480;
  C.ctx = c.getContext('2d');
  C.out = c.captureStream(30).getVideoTracks()[0];
  C.camOn = true;
  // setInterval (not rAF) so the picture keeps flowing while the tab is in the background
  C.timers.push(setInterval(renderFrame, 33));
  syncVideoUI();
}
function renderFrame() {
  if (!C || !C.ctx) return;
  const cam = $('cam'), c = $('local'), ctx = C.ctx, w = cam.videoWidth, h = cam.videoHeight;
  if (!w || !h) return;
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const f = FILTERS[C.filter];
  ctx.save(); ctx.filter = f.css || 'none'; ctx.drawImage(cam, 0, 0, w, h); ctx.restore();
  if (f.soft) { ctx.save(); ctx.filter = `${f.css} blur(${f.soft.blur}px)`; ctx.globalAlpha = f.soft.alpha; ctx.drawImage(cam, 0, 0, w, h); ctx.restore(); }
  if (f.vignette) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  if (f.bars) { const b = h * 0.1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, b); ctx.fillRect(0, h - b, w, b); }
}
function buildFilterTray() {
  const t = $('filterTray'); t.innerHTML = '';
  FILTERS.forEach((f, i) => {
    const b = document.createElement('button'); b.className = 'chip' + (C && i === C.filter ? ' on' : '');
    b.innerHTML = `<b>${f.e}</b>${f.n}`;
    b.onclick = () => { if (!C) return; C.filter = i; [...t.children].forEach((x, j) => x.classList.toggle('on', j === i)); };
    t.appendChild(b);
  });
}
function buildReactTray() {
  const t = $('reactTray'); t.innerHTML = '';
  REACTIONS.forEach((e) => {
    const b = document.createElement('button'); b.className = 'rx'; b.textContent = e;
    b.onclick = () => { floatEmoji(e); dcSend({ t: 'react', e }); };
    t.appendChild(b);
  });
}
function floatEmoji(e) {
  const s = document.createElement('span'); s.className = 'float'; s.textContent = e; s.style.left = 10 + Math.random() * 75 + '%';
  $('floaters').appendChild(s); setTimeout(() => s.remove(), 2500);
}

const sig = (data) => Net.send({ type: 'signal', data });

function createPC() {
  const pc = new RTCPeerConnection({ iceServers: ICE, iceCandidatePoolSize: 2 });
  C.pc = pc;
  pc.onicecandidate = (e) => { if (e.candidate) sig({ k: 'ice', c: e.candidate }); };
  pc.ontrack = (e) => {
    if (!C.remote.getTracks().includes(e.track)) C.remote.addTrack(e.track);
    const v = $('remote'); v.srcObject = C.remote; v.muted = !C.spkOn; v.play().catch(() => {});
  };
  pc.ondatachannel = (e) => setupDC(e.channel);
  pc.onconnectionstatechange = onConn;
  return pc;
}
async function startAsCaller() {
  const pc = createPC();
  C.mic.getAudioTracks().forEach((t) => pc.addTrack(t, C.mic));
  const vt = pc.addTransceiver(C.out || 'video', { direction: 'sendrecv' });
  C.vSender = vt.sender;
  setupDC(pc.createDataChannel('data', { ordered: true }));
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sig({ k: 'offer', sdp: pc.localDescription });
}
async function onSignal(d) {
  if (!C || !d) return;
  try {
    if (d.k === 'offer') {
      if (!C.pc) createPC();
      const pc = C.pc;
      await pc.setRemoteDescription(d.sdp); await flushIce();
      // attach our tracks to the transceivers created from the offer
      for (const t of pc.getTransceivers()) {
        const kind = t.receiver.track.kind;
        if (kind === 'audio' && !t.sender.track && C.mic) await t.sender.replaceTrack(C.mic.getAudioTracks()[0]);
        if (kind === 'video') { C.vSender = t.sender; if (!t.sender.track && C.out) await t.sender.replaceTrack(C.out); }
        if (t.direction !== 'sendrecv' && t.currentDirection !== 'stopped') t.direction = 'sendrecv';
      }
      const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
      sig({ k: 'answer', sdp: pc.localDescription });
    } else if (d.k === 'answer') {
      await C.pc.setRemoteDescription(d.sdp); await flushIce();
    } else if (d.k === 'ice') {
      if (C.pc && C.pc.remoteDescription) { try { await C.pc.addIceCandidate(d.c); } catch {} } else C.pending.push(d.c);
    }
  } catch (e) { console.error('signal error', e); }
}
async function flushIce() { for (const c of C.pending) { try { await C.pc.addIceCandidate(c); } catch {} } C.pending = []; }

function onConn() {
  if (!C || !C.pc) return;
  const st = C.pc.connectionState;
  if (st === 'connected') { clearTimeout(C.reconT); clearTimeout(C.failT); banner(''); if (C.state !== 'active') goActive(); }
  else if (st === 'disconnected') { banner('Reconnecting…'); C.reconT = setTimeout(() => { if (C && C.pc && C.pc.connectionState !== 'connected') iceRestart(); }, 4000); }
  else if (st === 'failed') {
    banner('Connection lost — retrying…'); iceRestart();
    C.failT = setTimeout(() => { if (C && C.pc.connectionState !== 'connected') hangup('Connection failed. A TURN server may be required (see README).'); }, 20000);
  }
}
async function iceRestart() {
  if (!C || C.dir !== 'out' || !C.pc) return;
  try { const o = await C.pc.createOffer({ iceRestart: true }); await C.pc.setLocalDescription(o); sig({ k: 'offer', sdp: C.pc.localDescription }); } catch {}
}

/* ---- Data channel (chat, state, reactions, files all go peer-to-peer) ---- */
function setupDC(dc) {
  C.dc = dc; dc.binaryType = 'arraybuffer';
  dc.onopen = () => { sendState(); renderSendBtn(); };
  dc.onmessage = onDC;
}
const dcOpen = () => !!(C && C.dc && C.dc.readyState === 'open');
function dcSend(o) { if (!dcOpen()) return false; C.dc.send(JSON.stringify(o)); return true; }
const sendState = () => { if (C) dcSend({ t: 'state', cam: !!(C.out && C.camOn), mic: C.micOn, share: !!C.sharing }); };

function onDC(ev) {
  if (!C) return;
  if (typeof ev.data !== 'string') { // binary file chunk
    if (C.rx) { C.rx.chunks.push(ev.data); C.rx.got += ev.data.byteLength; setProgress(C.rx.id, C.rx.got / C.rx.size); }
    return;
  }
  let m; try { m = JSON.parse(ev.data); } catch { return; }
  switch (m.t) {
    case 'chat':
      addBubble({ id: m.id, mine: false, kind: 'text', text: String(m.text).slice(0, 2000), ts: m.ts });
      dcSend({ t: 'ack', id: m.id }); incomingNotice(String(m.text)); break;
    case 'ack': { const el = document.querySelector(`.m[data-id="${m.id}"] .tick`); if (el) { el.textContent = ' ✓✓'; el.classList.add('read'); } break; }
    case 'typing': $('chatSub').textContent = 'typing…'; clearTimeout(C.typT); C.typT = setTimeout(() => { $('chatSub').textContent = 'online'; }, 2000); break;
    case 'react': floatEmoji(String(m.e).slice(0, 4)); break;
    case 'state': C.peerCam = !!m.cam; C.peerMic = m.mic !== false; C.peerShare = !!m.share; updateRemote(); break;
    case 'rec': $('recBanner').classList.toggle('hidden', !m.on); if (m.on) toast('The other person started recording this call'); break;
    case 'file-start':
      C.rx = { id: m.id, name: m.name, size: m.size, mime: m.mime || 'application/octet-stream', kind: m.kind, chunks: [], got: 0 };
      addBubble({ id: m.id, mine: false, kind: 'file', file: { name: m.name, size: m.size, mime: C.rx.mime, kind: m.kind }, ts: Date.now() }); break;
    case 'file-end': {
      const r = C.rx; if (!r || r.id !== m.id) break;
      const url = URL.createObjectURL(new Blob(r.chunks, { type: r.mime }));
      finishBubble(r.id, { name: r.name, size: r.size, mime: r.mime, kind: r.kind, url });
      C.rx = null; dcSend({ t: 'ack', id: r.id }); incomingNotice('📎 ' + r.name); break;
    }
    default: break;
  }
}
function incomingNotice(text) {
  if (!chatOpen) { C.unread++; $('badge').textContent = C.unread; $('badge').classList.remove('hidden'); toast(`${C.peer.name}: ${text}`.slice(0, 80)); if (navigator.vibrate) navigator.vibrate(40); }
}

/* ---- Camera upgrade, flip, screen share ---- */
async function enableCamera() {
  try {
    const raw = await navigator.mediaDevices.getUserMedia({ video: { facingMode: C.facing, width: { ideal: 1280 }, height: { ideal: 720 } } });
    if (!C) { raw.getTracks().forEach((t) => t.stop()); return; }
    C.cam = new MediaStream(raw.getVideoTracks()); C.video = true;
    await startPipeline();
    if (C.vSender) await C.vSender.replaceTrack(C.out);
    syncButtons(); sendState(); applyQuality(); toast('Camera on');
  } catch { toast('Camera permission denied'); }
}
async function flipCamera() {
  if (!C || !C.cam) return toast('Turn on the camera first');
  if (C.flipping) return; C.flipping = true;
  const want = C.facing === 'user' ? 'environment' : 'user';
  C.cam.getTracks().forEach((t) => t.stop());
  const get = (f) => navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: f }, width: { ideal: 1280 }, height: { ideal: 720 } } });
  try { const s = await get(want); C.cam = new MediaStream(s.getVideoTracks()); C.facing = want; }
  catch { try { const s = await get(C.facing); C.cam = new MediaStream(s.getVideoTracks()); toast('Could not switch camera'); } catch {} }
  $('cam').srcObject = C.cam; await $('cam').play().catch(() => {});
  $('local').classList.toggle('mirror', C.facing === 'user'); C.flipping = false;
}
async function toggleShare() {
  if (!C || C.state !== 'active') return;
  if (C.sharing) return stopShare();
  try {
    const ds = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
    const t = ds.getVideoTracks()[0]; C.shareStream = ds; C.sharing = true;
    await C.vSender.replaceTrack(t); t.onended = stopShare;
    syncButtons(); sendState(); toast('Sharing your screen');
  } catch { toast('Screen sharing was cancelled'); }
}
async function stopShare() {
  if (!C || !C.sharing) return;
  C.shareStream.getTracks().forEach((t) => t.stop()); C.sharing = false; C.shareStream = null;
  try { await C.vSender.replaceTrack(C.out || null); } catch {}
  syncButtons(); sendState();
}

/* ---- Quality, stats ---- */
async function applyQuality() {
  if (!C || !C.vSender) return;
  const q = cfg.quality; let max = 1500000, scale = 1;
  if (q === 'hd') max = 2500000;
  else if (q === 'sd') { max = 800000; scale = 1.5; }
  else if (q === 'low') { max = 300000; scale = 2.5; }
  else if (C.poor) { max = 400000; scale = 2; }
  try {
    const p = C.vSender.getParameters(); if (!p.encodings || !p.encodings.length) p.encodings = [{}];
    p.encodings[0].maxBitrate = max; p.encodings[0].scaleResolutionDownBy = scale;
    await C.vSender.setParameters(p);
  } catch {}
}
async function pollStats() {
  if (!C || !C.pc) return;
  let rtt = null, lost = 0, recv = 0, inV = null, outV = null;
  try {
    (await C.pc.getStats()).forEach((r) => {
      if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.currentRoundTripTime != null) rtt = r.currentRoundTripTime * 1000;
      if (r.type === 'inbound-rtp') { lost += r.packetsLost || 0; recv += r.packetsReceived || 0; if (r.kind === 'video') inV = r; }
      if (r.type === 'outbound-rtp' && r.kind === 'video') outV = r;
    });
  } catch { return; }
  const t = Date.now(), L = C.last || {}, dt = L.t ? (t - L.t) / 1000 : 0;
  const inK = inV && L.inB != null && dt ? Math.round(((inV.bytesReceived - L.inB) * 8) / dt / 1000) : null;
  const outK = outV && L.outB != null && dt ? Math.round(((outV.bytesSent - L.outB) * 8) / dt / 1000) : null;
  C.last = { t, inB: inV ? inV.bytesReceived : null, outB: outV ? outV.bytesSent : null };
  const lossPct = recv + lost ? (lost / (recv + lost)) * 100 : 0;
  const q = rtt == null ? '' : rtt < 150 && lossPct < 3 ? '🟢' : rtt < 350 && lossPct < 8 ? '🟡' : '🔴';
  $('quality').textContent = rtt == null ? '' : `· ${Math.round(rtt)} ms ${q}`;
  const poor = rtt != null && (rtt > 350 || lossPct > 8);
  if (poor !== C.poor) { C.poor = poor; if (cfg.quality === 'auto') { applyQuality(); if (poor) toast('Weak network — lowering video quality'); } }
  if (!$('stats').classList.contains('hidden')) {
    $('stats').textContent = [
      `RTT: ${rtt == null ? '–' : Math.round(rtt) + ' ms'}   Loss: ${lossPct.toFixed(1)}%`,
      `Download: ${inK == null ? '–' : inK + ' kbps'}   Upload: ${outK == null ? '–' : outK + ' kbps'}`,
      inV && inV.frameWidth ? `Remote video: ${inV.frameWidth}×${inV.frameHeight} @ ${Math.round(inV.framesPerSecond || 0)} fps` : 'Remote video: –',
      `Quality mode: ${cfg.quality}${C.poor ? ' (reduced)' : ''}`,
    ].join('\n');
  }
}

/* ---- Recording (the other person is notified) ---- */
function toggleRecording() {
  if (!C || C.state !== 'active') return;
  if (C.rec) return stopRecording(C, false);
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)(), dest = ac.createMediaStreamDestination();
    [C.remote, C.mic].forEach((s) => { if (s && s.getAudioTracks().length) ac.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(dest); });
    const hasVideo = C.remote.getVideoTracks().length > 0;
    const stream = new MediaStream([...dest.stream.getAudioTracks(), ...(hasVideo ? C.remote.getVideoTracks() : [])]);
    const mime = hasVideo && MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'audio/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime }), chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      ac.close();
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: mime }));
      a.download = `call-${C ? C.peer.num : 'recording'}-${Date.now()}.webm`; a.click();
    };
    rec.start(1000); C.rec = { rec }; dcSend({ t: 'rec', on: true });
    $('recBanner').classList.remove('hidden'); $('recBanner').textContent = '● Recording'; syncButtons(); toast('Recording started — the other person was notified');
  } catch (e) { toast('Recording is not supported on this browser'); }
}
function stopRecording(c, silent) {
  if (!c.rec) return;
  try { c.rec.rec.stop(); } catch {}
  c.rec = null;
  if (!silent) { dcSend({ t: 'rec', on: false }); $('recBanner').classList.add('hidden'); syncButtons(); toast('Recording saved to your downloads'); }
}

/* "More" tiles */
$('mFilters').onclick = () => { if (!C.out) return toast('Turn on the camera first'); $('more').classList.add('hidden'); $('reactTray').classList.add('hidden'); $('filterTray').classList.remove('hidden'); };
$('mReact').onclick = () => { $('more').classList.add('hidden'); $('filterTray').classList.add('hidden'); $('reactTray').classList.remove('hidden'); };
$('mFlip').onclick = flipCamera;
$('mShare').onclick = () => { $('more').classList.add('hidden'); toggleShare(); };
$('mRec').onclick = () => { $('more').classList.add('hidden'); toggleRecording(); };
$('mPip').onclick = async () => { $('more').classList.add('hidden'); try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await $('remote').requestPictureInPicture(); } catch { toast('Pop-out needs an active video'); } };
$('mQuality').onclick = () => { const o = ['auto', 'hd', 'sd', 'low']; cfg.quality = o[(o.indexOf(cfg.quality) + 1) % o.length]; saveCfg(); applyQuality(); syncButtons(); };
$('mNs').onclick = () => {
  cfg.ns = !cfg.ns; saveCfg();
  if (C && C.mic) C.mic.getAudioTracks().forEach((t) => t.applyConstraints({ noiseSuppression: cfg.ns }).catch(() => {}));
  syncButtons();
};
$('mStats').onclick = () => { $('more').classList.add('hidden'); $('stats').classList.toggle('hidden'); pollStats(); };

/* ------------------- 7. Chat, emojis, files, voice notes ------------------- */
const EMOJI = {
  '😀': '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽 🤖',
  '👍': '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 👏 🙌 👐 🤲 🙏 ✍️ 💪 🦾 👀 👅 👄 🧠',
  '❤️': '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 😻 💑 💏 💋 🌹 🥀 💐',
  '🐶': '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🦆 🦉 🦋 🐝 🐢 🐍 🐙 🐬 🐳 🌸 🌺 🌻 🌞 🌙 ⭐ 🌈 🔥 ❄️ ☔',
  '🍕': '🍎 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🥭 🍍 🥥 🥑 🌽 🌶️ 🍞 🧀 🍔 🍟 🍕 🌭 🌮 🌯 🍜 🍝 🍣 🍤 🍦 🍩 🍪 🎂 🍫 🍿 ☕ 🍵 🍺 🥂 🍷',
  '⚽': '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏏 🎱 🏓 🏸 🥊 🎯 🎮 🎲 🎵 🎶 🎤 🎧 🎸 🎬 🏆 🥇 🚗 ✈️ 🚀 🏠 📱 💻 📷 💡 🎁 🎉 🎊 💯 ✅ ❌ ⚡',
};
let chatOpen = false, recentEmoji = store.get('recentEmoji', []);

function openChat(open) {
  chatOpen = open; $('chat').classList.toggle('open', open);
  if (open) { if (C) { C.unread = 0; } $('badge').classList.add('hidden'); $('toast').classList.remove('show'); scrollMsgs(); }
  else { $('emojiPanel').classList.remove('open'); $('msg').blur(); }
}
$('chatClose').onclick = () => openChat(false);
const scrollMsgs = () => { $('msgs').scrollTop = $('msgs').scrollHeight; };
const onlyEmoji = (t) => /^(\p{Extended_Pictographic}|\u200d|\ufe0f|\s){1,6}$/u.test(t);

function fileBody(f, showProg) {
  const w = document.createElement('div'); w.className = 'file';
  const mime = f.mime || '';
  if (f.url) {
    if (mime.startsWith('image/')) { const i = document.createElement('img'); i.src = f.url; i.onclick = () => window.open(f.url, '_blank'); w.appendChild(i); }
    else if (f.kind === 'voice' || mime.startsWith('audio/')) { const a = document.createElement('audio'); a.controls = true; a.src = f.url; w.appendChild(a); }
    else if (mime.startsWith('video/')) { const v = document.createElement('video'); v.controls = true; v.playsInline = true; v.src = f.url; w.appendChild(v); }
    else { const a = document.createElement('a'); a.href = f.url; a.download = f.name; a.textContent = '📎 ' + f.name + ' (' + fmtSize(f.size) + ')'; w.appendChild(a); }
  } else { const s = document.createElement('span'); s.textContent = '📎 ' + f.name + ' (' + fmtSize(f.size) + ')'; w.appendChild(s); }
  if (showProg) { const p = document.createElement('div'); p.className = 'prog'; p.innerHTML = '<i></i>'; w.appendChild(p); }
  return w;
}
function addBubble(m) {
  const d = document.createElement('div'); d.className = 'm ' + (m.mine ? 'me' : 'them'); d.dataset.id = m.id;
  if (m.kind === 'file') d.appendChild(fileBody(m.file, !m.file.url || m.mine));
  else { const t = document.createElement('span'); t.textContent = m.text; d.appendChild(t); if (onlyEmoji(m.text)) d.classList.add('big'); }
  const s = document.createElement('small'); s.textContent = fmtClock(m.ts);
  if (m.mine) { const k = document.createElement('i'); k.className = 'tick'; k.style.fontStyle = 'normal'; k.textContent = ' ✓'; s.appendChild(k); }
  d.appendChild(s); $('msgs').appendChild(d); scrollMsgs(); return d;
}
function setProgress(id, frac) {
  const el = document.querySelector(`.m[data-id="${id}"] .prog i`); if (el) el.style.width = Math.min(100, Math.round(frac * 100)) + '%';
}
function finishBubble(id, f) {
  const b = document.querySelector(`.m[data-id="${id}"]`); if (!b) return;
  const old = b.querySelector('.file'); if (old) old.replaceWith(fileBody(f, false)); scrollMsgs();
}

function sendText() {
  const text = $('msg').value.trim(); if (!text || !C) return;
  const m = { t: 'chat', id: rid(), text, ts: Date.now() };
  if (!dcSend(m)) return toast('Chat is not ready yet');
  addBubble({ id: m.id, mine: true, kind: 'text', text, ts: m.ts });
  $('msg').value = ''; autosize(); renderSendBtn();
}
function autosize() { const el = $('msg'); el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 110) + 'px'; }
function renderSendBtn() { $('sendBtn').innerHTML = icon($('msg').value.trim() ? 'send' : 'mic'); }
$('sendBtn').onclick = () => { if ($('msg').value.trim()) sendText(); else vnStart(); };
$('msg').addEventListener('input', () => {
  autosize(); renderSendBtn();
  if (C && Date.now() - (C.lastTyping || 0) > 1500) { C.lastTyping = Date.now(); dcSend({ t: 'typing' }); }
});
$('msg').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) { e.preventDefault(); sendText(); } });
$('msg').addEventListener('focus', () => $('emojiPanel').classList.remove('open'));
$('emojiBtn').onclick = () => { const p = $('emojiPanel'), open = !p.classList.contains('open'); p.classList.toggle('open', open); if (open) $('msg').blur(); else $('msg').focus(); setTimeout(scrollMsgs, 220); };
$('attachBtn').onclick = () => $('filePick').click();
$('filePick').onchange = (e) => { [...e.target.files].forEach((f) => sendFile(f)); e.target.value = ''; };

function buildEmoji() {
  const tabs = $('emojiTabs'); tabs.innerHTML = '';
  ['🕘', ...Object.keys(EMOJI)].forEach((k) => { const b = document.createElement('button'); b.textContent = k; b.onclick = () => showCat(k); tabs.appendChild(b); });
  showCat(recentEmoji.length ? '🕘' : '😀');
}
function showCat(k) {
  [...$('emojiTabs').children].forEach((b) => b.classList.toggle('on', b.textContent === k));
  const g = $('emojiGrid'); g.innerHTML = '';
  (k === '🕘' ? recentEmoji : EMOJI[k].split(' ')).forEach((e) => { const b = document.createElement('button'); b.textContent = e; b.onclick = () => insertEmoji(e); g.appendChild(b); });
  g.scrollTop = 0;
}
function insertEmoji(e) {
  const el = $('msg'), a = el.selectionStart == null ? el.value.length : el.selectionStart, b = el.selectionEnd == null ? a : el.selectionEnd;
  el.value = el.value.slice(0, a) + e + el.value.slice(b); el.selectionStart = el.selectionEnd = a + e.length; autosize(); renderSendBtn();
  recentEmoji = [e, ...recentEmoji.filter((x) => x !== e)].slice(0, 24); store.set('recentEmoji', recentEmoji);
}

/* File transfer over the data channel (16 KB chunks with back-pressure) */
const CHUNK = 16384;
function sendFile(file, kind) {
  if (!dcOpen()) return toast('Chat is not ready yet');
  if (file.size > 25 * 1024 * 1024) return toast('Files up to 25 MB only');
  const c = C;
  c.sendQ = c.sendQ.then(async () => {
    if (C !== c || !dcOpen()) return;
    const id = rid(), url = URL.createObjectURL(file), mime = file.type || 'application/octet-stream';
    addBubble({ id, mine: true, kind: 'file', file: { name: file.name, size: file.size, mime, kind, url }, ts: Date.now() });
    c.dc.send(JSON.stringify({ t: 'file-start', id, name: file.name, size: file.size, mime, kind }));
    const buf = await file.arrayBuffer();
    for (let off = 0; off < buf.byteLength; off += CHUNK) {
      while (c.dc.bufferedAmount > 1 << 20) { await sleep(20); if (C !== c) return; }
      c.dc.send(buf.slice(off, off + CHUNK)); setProgress(id, off / buf.byteLength);
    }
    c.dc.send(JSON.stringify({ t: 'file-end', id }));
    const p = document.querySelector(`.m[data-id="${id}"] .prog`); if (p) p.remove();
  }).catch(() => toast('File transfer failed'));
}

/* Voice notes */
const VN = { rec: null, chunks: [], stream: null, t0: 0, timer: null };
async function vnStart() {
  if (!C || !C.mic) return;
  if (!dcOpen()) return toast('Chat is not ready yet');
  try {
    const track = C.mic.getAudioTracks()[0].clone(); track.enabled = true;
    VN.stream = new MediaStream([track]); VN.chunks = [];
    VN.rec = new MediaRecorder(VN.stream);
    VN.rec.ondataavailable = (e) => e.data.size && VN.chunks.push(e.data);
    VN.rec.start(); VN.t0 = Date.now();
    $('composerMain').classList.add('hidden'); $('vnBar').classList.remove('hidden'); $('sendBtn').innerHTML = icon('send');
    VN.timer = setInterval(() => { const s = Math.floor((Date.now() - VN.t0) / 1000); $('vnTime').textContent = Math.floor(s / 60) + ':' + pad(s % 60); }, 500);
    $('sendBtn').onclick = () => vnStop(true);
  } catch { toast('Voice notes are not supported here'); }
}
function vnStop(send) {
  if (!VN.rec) return;
  clearInterval(VN.timer);
  const rec = VN.rec, chunks = VN.chunks, stream = VN.stream; VN.rec = null;
  rec.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    if (send && chunks.length && C) { const type = rec.mimeType || 'audio/webm'; sendFile(new File([new Blob(chunks, { type })], 'voice-note.webm', { type }), 'voice'); }
  };
  try { rec.stop(); } catch {}
  $('vnBar').classList.add('hidden'); $('composerMain').classList.remove('hidden'); $('vnTime').textContent = '0:00';
  $('sendBtn').onclick = () => { if ($('msg').value.trim()) sendText(); else vnStart(); };
  renderSendBtn();
}
$('vnCancel').onclick = () => vnStop(false);

/* ====================== 8. Screens: auth, permissions, home, chats, contacts, profile ====================== */
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*[\p{L}\p{N}]$/u;
const RESERVED = ['admin', 'administrator', 'voicecall', 'support', 'system', 'root', 'moderator', 'staff', 'official', 'guest', 'null', 'undefined', 'server'];
function checkNameLocal(raw) {
  const name = String(raw || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (name.length < 3 || name.length > 24) return { ok: false, msg: 'Name must be 3–24 characters' };
  if (!NAME_RE.test(name)) return { ok: false, msg: 'Use letters, numbers, spaces and . _ - only' };
  const key = name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (key.length < 3) return { ok: false, msg: 'Use at least 3 letters or numbers' };
  if (RESERVED.includes(key)) return { ok: false, msg: 'That name is reserved' };
  return { ok: true, name };
}
const iconBtn = (name, cls, action, label) => { const b = h('button', { class: cls || '', 'data-a': action, 'aria-label': label }); b.innerHTML = icon(name); return b; };

/* generic prompt dialog */
function ask({ title, text = '', fields = [], ok = 'OK', danger = false, node = null, hideCancel = false }) {
  return new Promise((resolve) => {
    $('askTitle').textContent = title; $('askText').textContent = text;
    const box = $('askFields'); box.replaceChildren();
    if (node) box.append(node);
    fields.forEach((f) => box.append(h('label', { for: 'af_' + f.name, text: f.label }), h('input', { id: 'af_' + f.name, class: 'field', type: f.type || 'text', value: f.value || '', placeholder: f.placeholder || '', maxlength: f.maxlength || 120, autocomplete: 'off' })));
    const okB = $('askOk'); okB.textContent = ok; okB.className = 'primary slim' + (danger ? ' dangerbtn' : '');
    $('askCancel').classList.toggle('hidden', hideCancel);
    const dlg = $('askDlg'); dlg.classList.remove('hidden');
    const done = (v) => { dlg.classList.add('hidden'); $('askForm').onsubmit = null; $('askCancel').onclick = null; resolve(v); };
    $('askForm').onsubmit = (e) => { e.preventDefault(); done(Object.fromEntries(fields.map((f) => [f.name, $('af_' + f.name).value.trim()]))); };
    $('askCancel').onclick = () => done(null);
    const first = box.querySelector('input'); if (first) first.focus(); else okB.focus();
  });
}
const confirmAsk = (title, text, ok, danger) => ask({ title, text, ok, danger }).then(Boolean);

function showBlocked(title, text, canReconnect) {
  $('blkTitle').textContent = title; $('blkText').textContent = text;
  $('blkBtn').classList.toggle('hidden', !canReconnect); $('blocked').classList.remove('hidden');
}
$('blkBtn').onclick = () => { $('blocked').classList.add('hidden'); startSession(); };

/* ---------------- sign in / create account ---------------- */
let auMode = 'in', auPending = '', resendT = 0, nameOk = false, nameT = 0, nameSeq = 0;
const authRequest = async (path, body) => {
  const r = await fetch('/api/auth/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, d: await r.json().catch(() => ({})) };
};
function showAuth(mode, msg, good) {
  $('home').classList.add('hidden'); $('perms').classList.add('hidden'); $('auth').classList.remove('hidden');
  ['auPane', 'auOtp', 'auReset'].forEach((x) => $(x).classList.toggle('hidden', x !== 'auPane'));
  setAuMode(mode || 'in'); $('auId').value = store.get('lastId', ''); setMsg($('auMsg'), msg, good);
}
const setMsg = (e, t, good) => { e.textContent = t || ''; e.className = 'formmsg' + (good ? ' ok' : ''); };
function setAuMode(m) {
  auMode = m; $('auTabIn').classList.toggle('on', m === 'in'); $('auTabUp').classList.toggle('on', m === 'up');
  $('auNameWrap').classList.toggle('hidden', m !== 'up'); $('auConsentWrap').classList.toggle('hidden', m !== 'up'); $('auForgot').classList.toggle('hidden', m !== 'in');
  $('auGo').textContent = m === 'in' ? 'Sign in' : 'Create account'; $('auPw').autocomplete = m === 'in' ? 'current-password' : 'new-password'; setMsg($('auMsg'), '');
}
$('auTabIn').onclick = () => setAuMode('in'); $('auTabUp').onclick = () => setAuMode('up');
$('auEye').onclick = () => { const p = $('auPw'); p.type = p.type === 'password' ? 'text' : 'password'; };
$('auName').addEventListener('input', () => {
  nameOk = false; clearTimeout(nameT); const raw = $('auName').value, m = $('auNameMsg');
  if (!raw.trim()) { m.textContent = '\u00a0'; m.className = 'namemsg'; return; }
  const c = checkNameLocal(raw); if (!c.ok) { m.textContent = '✗ ' + c.msg; m.className = 'namemsg bad'; return; }
  m.textContent = 'Checking…'; m.className = 'namemsg'; const seq = ++nameSeq;
  nameT = setTimeout(async () => {
    try { const r = await (await fetch('/api/name-available?name=' + encodeURIComponent(c.name))).json(); if (seq !== nameSeq) return; nameOk = r.available; m.textContent = r.available ? '✓ “' + r.name + '” is available' : '✗ ' + (r.reason || 'Not available'); m.className = 'namemsg ' + (r.available ? 'ok' : 'bad'); }
    catch { if (seq === nameSeq) { m.textContent = ''; } }
  }, 350);
});
$('auGo').onclick = submitAuth;
[$('auId'), $('auPw'), $('auName')].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); }));
async function submitAuth() {
  const id = $('auId').value.trim(), pw = $('auPw').value, msg = $('auMsg'); setMsg(msg, '');
  if (!id || !pw) return setMsg(msg, 'Enter your email / mobile number and password');
  if (auMode === 'up') {
    const c = checkNameLocal($('auName').value); if (!c.ok) return setMsg(msg, c.msg);
    if (pw.length < 8) return setMsg(msg, 'Password must be at least 8 characters');
    if (!$('auConsent').checked) return setMsg(msg, 'Please accept the privacy notice to continue');
  }
  $('auGo').disabled = true;
  try {
    const { ok, status, d } = await authRequest(auMode === 'in' ? 'signin' : 'signup', { identifier: id, password: pw, name: $('auName').value });
    if (status === 403 && d.error === 'banned') showBlocked('Account blocked', d.message || 'Your account has been blocked by the administrator.');
    else if (!ok) setMsg(msg, d.error || 'Something went wrong');
    else if (d.needsVerification) showOtp(d);
    else onAuthed(d, id);
  } catch { setMsg(msg, 'Could not reach the server. Check your connection.'); }
  $('auGo').disabled = false;
}
function showOtp(d) {
  auPending = d.identifier; $('auPane').classList.add('hidden'); $('auOtp').classList.remove('hidden');
  $('auOtpText').textContent = 'We sent a 6-digit code to ' + d.masked + '.'; $('auCode').value = ''; setMsg($('auOtpMsg'), ''); startResendTimer(); $('auCode').focus();
}
function startResendTimer() {
  clearInterval(resendT); let s = 30; const b = $('auResend'); b.disabled = true;
  resendT = setInterval(() => { s--; b.textContent = s > 0 ? `Resend code (${s}s)` : 'Resend code'; if (s <= 0) { b.disabled = false; clearInterval(resendT); } }, 1000); b.textContent = 'Resend code (30s)';
}
$('auVerify').onclick = async () => {
  const code = $('auCode').value.trim(); if (code.length !== 6) return setMsg($('auOtpMsg'), 'Enter the 6-digit code');
  const { ok, d } = await authRequest('verify', { identifier: auPending, code }).catch(() => ({ ok: false, d: { error: 'Could not reach the server' } }));
  if (!ok) setMsg($('auOtpMsg'), d.error || 'Incorrect code'); else onAuthed(d, auPending);
};
$('auResend').onclick = async () => { const { ok, d } = await authRequest('resend', { identifier: auPending }).catch(() => ({ ok: false, d: {} })); setMsg($('auOtpMsg'), ok ? 'A new code was sent.' : d.error || 'Could not send the code', ok); if (ok) startResendTimer(); };
$('auOtpBack').onclick = () => showAuth(auMode);
$('auForgot').onclick = async () => {
  const id = $('auId').value.trim(), msg = $('auMsg'); if (!id) return setMsg(msg, 'Enter your email or mobile number first');
  const { ok, d } = await authRequest('forgot', { identifier: id }).catch(() => ({ ok: false, d: { error: 'Could not reach the server' } }));
  if (!ok) return setMsg(msg, d.error || 'Could not start the reset');
  auPending = id; $('auPane').classList.add('hidden'); $('auReset').classList.remove('hidden'); $('auResetText').textContent = 'If an account exists for that email / number, we sent a 6-digit code.'; setMsg($('auRsMsg'), '');
};
$('auRsGo').onclick = async () => {
  const code = $('auRsCode').value.trim(), password = $('auRsPw').value;
  const { ok, d } = await authRequest('reset', { identifier: auPending, code, password }).catch(() => ({ ok: false, d: { error: 'Could not reach the server' } }));
  if (!ok) setMsg($('auRsMsg'), d.error || 'Could not reset the password'); else { showAuth('in', 'Password updated — please sign in.', true); }
};
$('auRsBack').onclick = () => showAuth('in');
function onAuthed(d, identifier) {
  session.token = d.token; store.set('token', d.token); store.set('lastId', identifier); store.set('consent', Date.now());
  setMe(d.profile); $('auth').classList.add('hidden'); $('auPw').value = ''; showHome();
  if (!store.get('permsDone', false)) showPerms(); else startSession();
}
const KEEP = ['permsDone', 'lastId', 'vol', 'vibrate', 'quality', 'ns', 'view', 'recentEmoji'];
function wipeAll() { Object.keys(localStorage).filter((k) => k.startsWith('vc_') && !KEEP.includes(k.slice(3))).forEach((k) => localStorage.removeItem(k)); }
function signOutLocal(msg) { wipeAll(); try { sessionStorage.setItem('vc_msg', msg || ''); } catch {} location.reload(); }
async function signOut() {
  if (!(await confirmAsk('Sign out?', 'You can sign in again any time — your ID, contacts and chats stay exactly the same.', 'Sign out'))) return;
  try { const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration()); const sub = reg && (await reg.pushManager.getSubscription()); if (sub) { await Net.api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); } } catch {}
  try { await fetch('/api/auth/signout', { method: 'POST', headers: { 'X-VC-Token': session.token } }); } catch {}
  Net.stop(); signOutLocal('You have been signed out.');
}

/* ---------------- one-time permissions, push, location ---------------- */
const PM = { mic: 'pmMic', cam: 'pmCam', notif: 'pmNotif', loc: 'pmLoc' };
function setPerm(k, state) { const e = $(PM[k]); e.textContent = { ok: 'Allowed', bad: 'Blocked', na: 'Unavailable', wait: 'Waiting…' }[state]; e.className = 'pstat ' + (state === 'ok' ? 'ok' : state === 'bad' ? 'bad' : ''); }
const getPosition = () => new Promise((res, rej) => { if (!navigator.geolocation) return rej(new Error('unsupported')); navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }); });
async function reportLocation() {
  if (!cfg.loc || !Net.online) return;
  try { const p = await getPosition(); Net.send({ type: 'location', lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }); }
  catch (e) { if (e && e.code === 1) { cfg.loc = false; saveCfg(); renderSettings(); } }
}
function showPerms() { $('perms').classList.remove('hidden'); $('permGo').disabled = false; $('permSkip').classList.remove('hidden'); }
async function requestAllPermissions() {
  $('permGo').disabled = true; $('permSkip').classList.add('hidden');
  let micOk = false, camOk = false; setPerm('mic', 'wait'); setPerm('cam', 'wait');
  try { const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); s.getTracks().forEach((t) => t.stop()); micOk = camOk = true; }
  catch { try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); micOk = true; } catch {} }
  setPerm('mic', micOk ? 'ok' : 'bad'); setPerm('cam', camOk ? 'ok' : 'bad');
  if ('Notification' in window) { setPerm('notif', 'wait'); try { setPerm('notif', (await Notification.requestPermission()) === 'granted' ? 'ok' : 'bad'); } catch { setPerm('notif', 'bad'); } } else setPerm('notif', 'na');
  setPerm('loc', 'wait'); try { await getPosition(); cfg.loc = true; setPerm('loc', 'ok'); } catch { cfg.loc = false; setPerm('loc', 'bad'); }
  saveCfg();
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch {}
  if ('serviceWorker' in navigator) { try { await navigator.serviceWorker.register('sw.js'); } catch {} }
  await sleep(800); finishPerms();
}
function finishPerms() { store.set('permsDone', true); $('perms').classList.add('hidden'); renderSettings(); startSession(); if (Net.online) setupPush(vapidKey); }
$('permGo').onclick = requestAllPermissions; $('permSkip').onclick = finishPerms;
const b64 = (s) => { const raw = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); };
let pushDone = false;
async function setupPush(key) {
  if (pushDone || !key || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || Notification.permission !== 'granted') return;
  pushDone = true;
  try {
    const reg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription(); if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
    await Net.api('POST', '/api/push/subscribe', { subscription: sub.toJSON() });
  } catch (e) { pushDone = false; Net.lastError = 'push: ' + (e.message || e); }
}

/* ---------------- home shell ---------------- */
let currentTab = 'Chats', locTimer = null, watchT = 0;
function showHome() { $('home').classList.remove('hidden'); switchTab(currentTab); }
function switchTab(name) {
  currentTab = name;
  ['Chats', 'Calls', 'Contacts', 'Me'].forEach((t) => $('tab' + t).classList.toggle('hidden', t !== name));
  $$('.tabbtn').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $('hTitle').textContent = name === 'Me' ? 'Profile' : name; $('hSub').textContent = '';
  if (name === 'Calls') store.set('seenAt', Date.now());
  scheduleRender('chats', 'calls', 'contacts', 'badges', 'dial'); if (name === 'Me') renderSettings();
}
$$('.tabbtn').forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));
$('meBtn').onclick = () => switchTab('Me'); $('fabChat').onclick = () => switchTab('Contacts');
function startSession() {
  if (!session.token) return;
  if (!Net.started) Net.start(); else if (!Net.online) Net.restart();
  if (!locTimer) locTimer = setInterval(reportLocation, 300000);
}
function onRegistered() {
  Net.send({ type: 'chats' }); Net.send({ type: 'call_history' }); syncWatch(true);
  if (cfg.dnd) Net.send({ type: 'dnd', on: true });
  outbox.forEach(pushOut); reportLocation(); setupPush(vapidKey); renderSettings();
  if (directOpenNum) Net.send({ type: 'history', with: directOpenNum });
}
function syncWatch(immediate) {
  clearTimeout(watchT);
  const run = () => { const n = new Set([...(me.contacts || []).map((c) => c.num), ...chatList.map((c) => c.num), ...callHistory.map((r) => (r.caller === me.num ? r.callee : r.caller))]); if (directOpenNum) n.add(directOpenNum); if (n.size) Net.send({ type: 'watch', nums: [...n].slice(0, 300) }); };
  if (immediate) run(); else watchT = setTimeout(run, 400);
}

/* ---------------- chats list ---------------- */
const chats = new Map(), outbox = [];
let chatList = store.get('chatList', []), directOpenNum = null;
const getChat = (num) => { let c = chats.get(num); if (!c) { c = { msgs: [], more: true, loaded: false }; chats.set(num, c); } return c; };
const msgPreview = (m) => (m.kind === 'image' ? '📷 ' + (m.body || 'Photo') : m.body);
function chatTime(ts) {
  const d = new Date(ts), n = new Date(); if (d.toDateString() === n.toDateString()) return fmtClock(ts);
  if (d.toDateString() === new Date(n - 86400000).toDateString()) return 'Yesterday'; return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
function tickEl(status, id) {
  const t = { '-1': '🕓', '0': '✓', '1': '✓✓', '2': '✓✓', '-2': '⚠ retry' }[String(status)] || '✓';
  return h('span', { class: 'tk' + (status === 2 ? ' read' : '') + (status === -2 ? ' fail' : ''), 'data-retry': status === -2 ? id : null, text: t });
}
function renderChats() {
  const q = $('chatSearch').value.trim().toLowerCase(), box = $('chatList');
  const list = chatList.filter((c) => !q || displayName(c.num).toLowerCase().includes(q) || String(msgPreview(c.last) || '').toLowerCase().includes(q));
  if (!list.length) { box.replaceChildren(h('div', { class: 'empty' }, h('b', { text: q ? 'No matches' : 'No chats yet' }), q ? '' : 'Tap the button below, pick a contact and say hi 👋')); return; }
  box.replaceChildren(...list.map((c) => {
    const m = c.last, mine = m.from === me.num;
    return h('div', { class: 'row', 'data-num': c.num }, ava(c.num, displayName(c.num), 'md', true),
      h('div', { class: 'meta' }, h('div', { class: 'top' }, h('b', { text: displayName(c.num) }), h('time', { class: c.unread ? 'hot' : '', text: chatTime(m.ts) })),
        h('div', { class: 'sub' }, mine ? tickEl(m.status, m.id) : null, h('span', { class: 'pv', text: msgPreview(m) }), c.unread ? h('span', { class: 'unread', text: c.unread > 99 ? '99+' : c.unread }) : null)));
  }));
}
$('chatList').onclick = (e) => { const r = e.target.closest('.row'); if (r) openDirect(r.dataset.num); };
$('chatSearch').addEventListener('input', () => scheduleRender('chats'));
function onChats(m) { rememberProfiles(m.profiles); chatList = m.chats; store.set('chatList', chatList.slice(0, 80)); syncWatch(); scheduleRender('chats', 'badges'); }
function touchChat(num, msg, unread) {
  let c = chatList.find((x) => x.num === num);
  if (!c) { if (!msg) return; c = { num, last: msg, unread: 0 }; chatList.unshift(c); }
  if (msg && (!c.last || msg.ts >= c.last.ts)) c.last = msg;
  if (unread === 'reset') c.unread = 0; else if (typeof unread === 'number') c.unread = (c.unread || 0) + unread;
  chatList.sort((a, b) => b.last.ts - a.last.ts); store.set('chatList', chatList.slice(0, 80)); scheduleRender('chats', 'badges');
}
function renderBadges() {
  const un = chatList.reduce((a, c) => a + (c.unread || 0), 0), seen = store.get('seenAt', 0);
  const missed = callHistory.filter((r) => r.callee === me.num && !r.answeredAt && r.reason !== 'declined' && r.startedAt > seen).length;
  const set = (id, n) => { const e = $(id); e.textContent = n > 99 ? '99+' : n; e.classList.toggle('hidden', !n); };
  set('chatBadge', un); set('missedBadge', currentTab === 'Calls' ? 0 : missed);
  document.title = un ? `(${un}) VoiceCall` : 'VoiceCall';
}

/* ---------------- calls tab: keypad + history ---------------- */
let dialStr = '';
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '<'];
function buildKeypad() {
  const kp = $('keypad');
  KEYS.forEach((k) => { const b = h('button', { class: 'key' }); if (k === '') b.style.visibility = 'hidden'; else if (k === '<') { b.innerHTML = icon('backspace'); b.setAttribute('aria-label', 'Backspace'); } else b.textContent = k; b.onclick = () => pressKey(k); kp.append(b); });
}
function pressKey(k) { if (k === '<') dialStr = dialStr.slice(0, -1); else if (dialStr.length < 6) dialStr += k; renderDial(); if (dialStr.length === 6) Net.send({ type: 'profiles', nums: [dialStr] }); }
function renderDial() {
  const d = $('dialDisplay'); d.textContent = dialStr ? fmtId(dialStr) : 'Enter 6-digit ID'; d.classList.toggle('placeholder', !dialStr);
  const ok = dialStr.length === 6; $('dialVoice').disabled = !ok; $('dialVideo').disabled = !ok;
  const hint = $('dialHint'), p = profiles.get(dialStr); hint.replaceChildren();
  if (ok) { if (p && p.name) hint.append(h('span', { text: contactName(dialStr) || p.name }), ' · ', h('span', { class: p.online ? 'on' : '', text: p.online ? '● Online' : lastSeenText(p) })); else hint.textContent = 'Looking up…'; } else hint.innerHTML = '&nbsp;';
}
$('dialVoice').onclick = () => placeCall(dialStr, false); $('dialVideo').onclick = () => placeCall(dialStr, true);
$('dialPaste').onclick = async () => {
  try { const t = (await navigator.clipboard.readText()).replace(/\D/g, '').slice(0, 6); if (t) { dialStr = t; renderDial(); if (t.length === 6) Net.send({ type: 'profiles', nums: [t] }); } else toast('No ID found in the clipboard'); } catch { toast('Clipboard access was blocked'); }
};
$('clKeys').onclick = () => { $('clKeys').classList.add('on'); $('clHist').classList.remove('on'); $('paneKeys').classList.remove('hidden'); $('paneHist').classList.add('hidden'); };
$('clHist').onclick = () => { $('clHist').classList.add('on'); $('clKeys').classList.remove('on'); $('paneHist').classList.remove('hidden'); $('paneKeys').classList.add('hidden'); scheduleRender('calls'); };
function callInfo(r) {
  const out = r.caller === me.num, num = out ? r.callee : r.caller;
  const status = r.answeredAt ? 'Completed' : r.reason === 'declined' ? 'Declined' : out ? 'No answer' : 'Missed';
  return { out, num, status, missed: status === 'Missed' };
}
function renderHistory() {
  const box = $('histList');
  if (!callHistory.length) { box.replaceChildren(h('div', { class: 'empty' }, h('b', { text: 'No calls yet' }), 'Your voice and video calls will appear here.')); return; }
  box.replaceChildren(...callHistory.map((r) => {
    const i = callInfo(r);
    return h('div', { class: 'row', 'data-num': i.num }, ava(i.num, displayName(i.num), 'md', true),
      h('div', { class: 'meta' }, h('b', { text: displayName(i.num) }), h('small', { class: i.missed ? 'missed' : '', text: `${i.out ? '↗' : '↙'} ${r.video ? 'Video' : 'Voice'} · ${i.status}${r.duration ? ' · ' + fmtDur(r.duration) : ''} · ${fmtWhen(r.startedAt)}` })),
      h('div', { class: 'acts' }, iconBtn('phone', 'g', 'voice', 'Voice call'), iconBtn('video', 'b', 'video', 'Video call')));
  }));
}
$('histList').onclick = (e) => {
  const row = e.target.closest('.row'); if (!row) return; const b = e.target.closest('button');
  if (b) placeCall(row.dataset.num, b.dataset.a === 'video'); else openProfile(row.dataset.num);
};

/* ---------------- contacts grid ---------------- */
function renderContacts() {
  const q = $('ctSearch').value.trim().toLowerCase(), grid = $('contactGrid'), grid4 = cfg.view === 'grid';
  $('ctView').innerHTML = icon(grid4 ? 'list' : 'grid'); $('ctView').setAttribute('aria-label', grid4 ? 'Switch to list' : 'Switch to grid');
  const list = (me.contacts || []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.num.includes(q));
  list.sort((a, b) => (isOnline(b.num) - isOnline(a.num)) || a.name.localeCompare(b.name));
  if (!list.length) { grid.className = 'cgrid list'; grid.replaceChildren(h('div', { class: 'empty' }, h('b', { text: q ? 'No matches' : 'No contacts yet' }), q ? '' : 'Tap the + button to add someone by their ID or name.')); return; }
  grid.className = 'cgrid ' + (grid4 ? 'grid' : 'list');
  grid.replaceChildren(...list.map((c) => {
    const p = profileOf(c.num);
    return h('div', { class: 'ccard', 'data-num': c.num }, ava(c.num, c.name, grid4 ? 'xl' : 'md', true),
      h('div', { class: 'meta' }, h('b', { text: c.name }), h('span', { class: 'st' + (p.online ? ' on' : ''), text: shortSeen(p) })),
      h('div', { class: 'acts' }, iconBtn('chat', 'c', 'chat', 'Chat'), iconBtn('phone', 'g', 'voice', 'Voice call'), iconBtn('video', 'b', 'video', 'Video call')));
  }));
}
$('contactGrid').onclick = (e) => {
  const card = e.target.closest('.ccard'); if (!card) return; const num = card.dataset.num, b = e.target.closest('button');
  if (!b) return openProfile(num);
  if (b.dataset.a === 'chat') openDirect(num); else placeCall(num, b.dataset.a === 'video');
};
$('ctSearch').addEventListener('input', () => scheduleRender('contacts'));
$('ctView').onclick = () => { cfg.view = cfg.view === 'grid' ? 'list' : 'grid'; saveCfg(); scheduleRender('contacts'); };

/* ---------------- add contact, profile sheet ---------------- */
$('ctAdd').onclick = () => { $('addDlg').classList.remove('hidden'); $('adQ').value = ''; $('adResult').replaceChildren(); $('adQ').focus(); };
$('adClose').onclick = () => $('addDlg').classList.add('hidden');
const findContact = () => { const q = $('adQ').value.trim(); if (!q) return; $('adResult').replaceChildren(h('p', { class: 'muted small', text: 'Searching…' })); Net.send({ type: 'lookup', q: q.replace(/\s/g, '').match(/^\d{6}$/) ? q.replace(/\s/g, '') : q }); };
$('adFind').onclick = findContact; $('adQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') findContact(); });
function onLookup(m) {
  if (!$('addDlg') || $('addDlg').classList.contains('hidden')) return;
  const box = $('adResult');
  if (!m.profile) return box.replaceChildren(h('p', { class: 'muted small', text: 'No user found. Check the ID or the exact name.' }));
  const p = m.profile; rememberProfiles({ [p.num]: p });
  const have = contactMap.has(p.num);
  const add = h('button', { text: have ? 'Open' : 'Add' });
  add.onclick = async () => {
    if (have) { $('addDlg').classList.add('hidden'); return openProfile(p.num); }
    const v = await ask({ title: 'Save contact', text: 'You can rename them.', fields: [{ name: 'name', label: 'Name', value: p.name, maxlength: 24 }], ok: 'Save' });
    if (v) { Net.send({ type: 'contact_add', num: p.num, name: v.name || p.name }); $('addDlg').classList.add('hidden'); toast('Contact saved'); }
  };
  box.replaceChildren(h('div', { class: 'adcard' }, ava(p.num, p.name, 'md', true), h('div', { class: 'meta' }, h('b', { text: p.name }), h('small', { text: `ID ${fmtId(p.num)} · ${lastSeenText(p)}` })), add));
}
function openProfile(num) {
  if (num === me.num) return switchTab('Me');
  $('profileDlg').dataset.num = num; $('profileDlg').classList.remove('hidden'); refreshProfileDlg();
  if (!profiles.has(num)) Net.send({ type: 'profiles', nums: [num] });
}
function refreshProfileDlg() {
  const dlg = $('profileDlg'), num = dlg.dataset.num; if (!num || dlg.classList.contains('hidden')) return;
  const p = profileOf(num), nm = displayName(num);
  setBigAva($('pfAva'), { num, name: nm, avatar: avatarOf(num) }); $('pfName').textContent = nm; $('pfAbout').textContent = p.about || '';
  $('pfMeta').textContent = `ID ${fmtId(num)} · ${lastSeenText(p)}`;
  $('pfContact').textContent = contactMap.has(num) ? 'Rename / edit contact' : 'Add to contacts';
  $('pfBlock').textContent = me.blocks.includes(num) ? 'Unblock' : 'Block';
}
const pfNum = () => $('profileDlg').dataset.num;
$('pfClose').onclick = () => $('profileDlg').classList.add('hidden');
$('pfChat').onclick = () => { const n = pfNum(); $('profileDlg').classList.add('hidden'); openDirect(n); };
$('pfVoice').onclick = () => { const n = pfNum(); $('profileDlg').classList.add('hidden'); placeCall(n, false); };
$('pfVideo').onclick = () => { const n = pfNum(); $('profileDlg').classList.add('hidden'); placeCall(n, true); };
$('pfContact').onclick = async () => {
  const n = pfNum(), v = await ask({ title: contactMap.has(n) ? 'Edit contact' : 'Add contact', fields: [{ name: 'name', label: 'Name', value: contactName(n) || fmtId(n), maxlength: 24 }], ok: 'Save' });
  if (v) { Net.send({ type: 'contact_add', num: n, name: v.name }); toast('Contact saved'); }
};
$('pfBlock').onclick = () => toggleBlock(pfNum());
$('pfReport').onclick = () => reportUser(pfNum());
async function toggleBlock(num) {
  if (me.blocks.includes(num)) { Net.send({ type: 'unblock', num }); return toast('Unblocked'); }
  if (await confirmAsk('Block ' + displayName(num) + '?', 'They will not be able to call you or see your last seen, and you will not receive their messages.', 'Block', true)) { Net.send({ type: 'block', num }); toast('Blocked'); }
}
async function reportUser(num) {
  const v = await ask({ title: 'Report ' + displayName(num), text: 'Tell the administrator what happened.', fields: [{ name: 'reason', label: 'Reason', placeholder: 'e.g. Spam or abuse', maxlength: 200 }], ok: 'Send report', danger: true });
  if (v) Net.send({ type: 'report', num, reason: v.reason });
}

/* ---------------- direct chat ---------------- */
const typingUntil = {};
function dayLabel(ts) {
  const d = new Date(ts), n = new Date(); if (d.toDateString() === n.toDateString()) return 'Today'; if (d.toDateString() === new Date(n - 86400000).toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}
function openDirect(num) {
  if (!num || num === me.num) return;
  directOpenNum = num; $('dchat').classList.remove('hidden'); try { history.pushState({ chat: num }, ''); } catch {}
  const c = getChat(num); c.stick = true; renderDirectHeader();
  if (!c.loaded) Net.send({ type: 'history', with: num });
  markRead(num); if (!profiles.has(num)) Net.send({ type: 'profiles', nums: [num] });
  syncWatch(); scheduleRender('direct');
}
function closeDirect(fromPop) {
  if (!directOpenNum) return;
  directOpenNum = null; $('dchat').classList.add('hidden'); $('dEmojiPanel').classList.remove('open'); $('dMenu').classList.add('hidden');
  if (!fromPop) { try { history.back(); } catch {} } scheduleRender('chats');
}
window.addEventListener('popstate', () => { if (directOpenNum) closeDirect(true); });
$('dBack').onclick = () => closeDirect(false);
function markRead(num) { Net.send({ type: 'msg_read', from: num }); touchChat(num, null, 'reset'); }
function renderDirectHeader() {
  const num = directOpenNum; if (!num) return;
  const nm = displayName(num), p = profileOf(num), typing = (typingUntil[num] || 0) > Date.now();
  $('dAva').replaceChildren(ava(num, nm, 'sm', true)); $('dName').textContent = nm;
  const st = $('dStatus'); st.textContent = typing ? 'typing…' : lastSeenText(p); st.className = typing || p.online ? 'on' : '';
  $('dmBlock').textContent = me.blocks.includes(num) ? 'Unblock' : 'Block';
}
function bubble(m) {
  const mine = m.from === me.num, b = h('div', { class: 'm ' + (mine ? 'me' : 'them') + (m.kind === 'image' ? ' img' : '') + (m.pending ? ' pending' : ''), 'data-id': m.id });
  if (m.kind === 'image') { const i = new Image(); i.className = 'chatimg'; i.src = m.url; i.alt = 'Photo'; i.loading = 'lazy'; i.dataset.full = m.url; b.append(i); if (m.body) b.append(h('div', { class: 'cap', text: m.body })); }
  else { b.append(h('span', { text: m.body })); if (/^(\p{Extended_Pictographic}|\u200d|\ufe0f|\s){1,6}$/u.test(m.body)) b.classList.add('big'); }
  const meta = h('small', {}, fmtClock(m.ts)); if (mine) meta.append(tickEl(m.status, m.id)); b.append(meta); return b;
}
function renderDirect() {
  if (!directOpenNum) return;
  renderDirectHeader();
  const c = getChat(directOpenNum), box = $('dMsgs'), near = box.scrollHeight - box.scrollTop - box.clientHeight < 160, frag = document.createDocumentFragment();
  let day = '';
  if (c.more && c.loaded && c.msgs.length) frag.append(h('button', { class: 'loadmore', 'data-a': 'older', text: 'Load older messages' }));
  for (const m of c.msgs.slice(-300)) { const d = new Date(m.ts).toDateString(); if (d !== day) { day = d; frag.append(h('div', { class: 'day', text: dayLabel(m.ts) })); } frag.append(bubble(m)); }
  if (!c.msgs.length) frag.append(h('div', { class: 'empty' }, c.loaded ? 'No messages yet — say hi 👋' : 'Loading…'));
  const prevH = box.scrollHeight, prevTop = box.scrollTop; box.replaceChildren(frag);
  if (c.keepScroll) { box.scrollTop = box.scrollHeight - prevH + prevTop; c.keepScroll = false; } else if (near || c.stick) { box.scrollTop = box.scrollHeight; c.stick = false; }
}
$('dMsgs').onclick = (e) => {
  if (e.target.closest('[data-a="older"]')) { const c = getChat(directOpenNum), first = c.msgs[0]; if (first) Net.send({ type: 'history', with: directOpenNum, before: first.ts }); return; }
  const img = e.target.closest('.chatimg'); if (img) { $('viewerImg').src = img.dataset.full; $('viewer').classList.remove('hidden'); return; }
  const rt = e.target.closest('[data-retry]'); if (rt) { const c = getChat(directOpenNum), m = c.msgs.find((x) => x.id === rt.dataset.retry); if (m && m.kind === 'text') { m.status = -1; outbox.push(m); pushOut(m); scheduleRender('direct'); } else toast('Please send the photo again'); }
};
$('viewerClose').onclick = () => $('viewer').classList.add('hidden'); $('viewer').onclick = (e) => { if (e.target === $('viewer')) $('viewer').classList.add('hidden'); };
function onHistory(m) {
  rememberProfiles(m.profile ? { [m.with]: m.profile } : null);
  const c = getChat(m.with);
  if (m.before) { const ids = new Set(c.msgs.map((x) => x.id)); c.msgs = [...m.msgs.filter((x) => !ids.has(x.id)), ...c.msgs]; c.keepScroll = true; }
  else { const map = new Map(m.msgs.map((x) => [x.id, x])); c.msgs.forEach((x) => { if (!map.has(x.id)) map.set(x.id, x); }); c.msgs = [...map.values()].sort((a, b) => a.ts - b.ts); c.stick = true; }
  c.more = m.more; c.loaded = true;
  const unseen = m.msgs.filter((x) => x.from === m.with && x.status < 1).map((x) => x.id); if (unseen.length) Net.send({ type: 'msg_ack', ids: unseen });
  if (directOpenNum === m.with) markRead(m.with);
  scheduleRender('direct', 'chats');
}
function onDirectMsg(m) {
  const msg = m.msg; if (m.profile) rememberProfiles({ [m.profile.num]: m.profile });
  const peer = msg.from, c = getChat(peer);
  if (c.loaded && !c.msgs.some((x) => x.id === msg.id)) { c.msgs.push(msg); c.stick = true; }
  Net.send({ type: 'msg_ack', ids: [msg.id] }); delete typingUntil[peer];
  if (!profiles.has(peer)) Net.send({ type: 'profiles', nums: [peer] });
  if (directOpenNum === peer && !document.hidden) { Net.send({ type: 'msg_read', from: peer }); touchChat(peer, msg, 'reset'); }
  else { touchChat(peer, msg, 1); if (document.hidden) notify(displayName(peer), msgPreview(msg), 'msg-' + peer); else { toast(displayName(peer) + ': ' + msgPreview(msg), 3500, () => openDirect(peer)); if (navigator.vibrate) navigator.vibrate(40); } }
  scheduleRender('direct');
}
function onMsgSent(m) {
  for (const c of chats.values()) { const x = c.msgs.find((y) => y.id === m.id); if (x) { x.status = Math.max(x.status, 0); x.ts = m.ts || x.ts; } }
  const i = outbox.findIndex((x) => x.id === m.id); if (i >= 0) outbox.splice(i, 1);
  const cl = chatList.find((c) => c.last && c.last.id === m.id); if (cl) cl.last.status = Math.max(cl.last.status, 0);
  scheduleRender('direct', 'chats');
}
function onMsgStatus(m) {
  const c = chats.get(m.by), set = new Set(m.ids);
  if (c) c.msgs.forEach((x) => { if (set.has(x.id)) x.status = Math.max(x.status, m.status); });
  const cl = chatList.find((x) => x.num === m.by); if (cl && set.has(cl.last.id)) cl.last.status = Math.max(cl.last.status, m.status);
  scheduleRender('direct', 'chats');
}
function onMsgFail(m) {
  for (const c of chats.values()) { const x = c.msgs.find((y) => y.id === m.id); if (x) x.status = -2; }
  const i = outbox.findIndex((x) => x.id === m.id); if (i >= 0) outbox.splice(i, 1);
  toast(m.reason === 'blocked' ? 'You blocked this contact. Unblock to send messages.' : 'Message could not be sent'); scheduleRender('direct');
}
function onTypingFrom(m) { typingUntil[m.from] = Date.now() + 4000; if (directOpenNum === m.from) { renderDirectHeader(); setTimeout(renderDirectHeader, 4100); } }
function pushOut(msg) { Net.send({ type: 'msg_send', to: msg.to, id: msg.id, kind: msg.kind, body: msg.body, url: msg.url }); }
function queueDirect(to, kind, body, url, extra) {
  const msg = Object.assign({ id: rid() + rid(), from: me.num, to, kind, body, url: url || null, ts: Date.now(), status: -1 }, extra || {});
  const c = getChat(to); c.msgs.push(msg); c.stick = true; touchChat(to, msg, null);
  if (!msg.pending) { outbox.push(msg); pushOut(msg); } scheduleRender('direct'); return msg;
}
function sendDirectText() {
  const t = $('dMsg').value.trim(); if (!t || !directOpenNum) return;
  $('dMsg').value = ''; autosizeD(); renderSendIcon(); queueDirect(directOpenNum, 'text', t);
}
const autosizeD = () => { const e = $('dMsg'); e.style.height = 'auto'; e.style.height = Math.min(e.scrollHeight, 110) + 'px'; };
const renderSendIcon = () => { $('dSend').innerHTML = icon('send'); };
$('dSend').onclick = sendDirectText;
let lastTypingSent = 0;
$('dMsg').addEventListener('input', () => { autosizeD(); if (directOpenNum && Date.now() - lastTypingSent > 2500) { lastTypingSent = Date.now(); Net.send({ type: 'typing_to', to: directOpenNum }); } });
$('dMsg').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) { e.preventDefault(); sendDirectText(); } });
$('dMsg').addEventListener('focus', () => $('dEmojiPanel').classList.remove('open'));
$('dEmojiBtn').onclick = () => { const p = $('dEmojiPanel'), open = !p.classList.contains('open'); p.classList.toggle('open', open); if (open) $('dMsg').blur(); else $('dMsg').focus(); };
$('dAttach').onclick = () => $('dFile').click();
$('dFile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f && directOpenNum) sendPhoto(directOpenNum, f); };
$('dVoice').onclick = () => directOpenNum && placeCall(directOpenNum, false); $('dVideo').onclick = () => directOpenNum && placeCall(directOpenNum, true);
$('dPeer').onclick = () => directOpenNum && openProfile(directOpenNum);
$('dMore').onclick = (e) => { e.stopPropagation(); $('dMenu').classList.toggle('hidden'); };
document.addEventListener('click', () => $('dMenu').classList.add('hidden'));
$('dmProfile').onclick = () => openProfile(directOpenNum); $('dmBlock').onclick = () => toggleBlock(directOpenNum); $('dmReport').onclick = () => reportUser(directOpenNum);
function resizeImage(file, max, quality, square) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url); let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (square) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s; }
      const k = Math.min(1, max / Math.max(sw, sh)), w = Math.round(sw * k), hh = Math.round(sh * k), c = document.createElement('canvas');
      c.width = w; c.height = hh; c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, w, hh); c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality);
    };
    img.onerror = () => reject(new Error('decode')); img.src = url;
  });
}
async function sendPhoto(to, file) {
  if (!/^image\//.test(file.type)) return toast('Please choose a photo');
  let blob; try { blob = await resizeImage(file, 1280, 0.72); } catch { return toast('Could not read that photo'); }
  const msg = queueDirect(to, 'image', '', URL.createObjectURL(blob), { pending: true });
  try {
    const r = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'X-VC-Token': session.token }, body: blob }), d = await r.json();
    if (!r.ok) throw new Error(d.error || 'upload failed');
    msg.url = d.url; msg.pending = false; outbox.push(msg); pushOut(msg);
  } catch (e) { msg.status = -2; msg.pending = false; toast('Photo could not be sent: ' + (e.message || 'network error')); }
  scheduleRender('direct');
}
function buildEmojiFor(tabsEl, gridEl, onPick) {
  const show = (k) => {
    [...tabsEl.children].forEach((b) => b.classList.toggle('on', b.textContent === k));
    gridEl.replaceChildren(...(k === '🕘' ? recentEmoji : EMOJI[k].split(' ')).map((e) => { const b = h('button', { text: e }); b.onclick = () => onPick(e); return b; })); gridEl.scrollTop = 0;
  };
  tabsEl.replaceChildren(...['🕘', ...Object.keys(EMOJI)].map((k) => { const b = h('button', { text: k }); b.onclick = () => show(k); return b; }));
  show(recentEmoji.length ? '🕘' : '😀');
}
function pickDirectEmoji(e) {
  const el = $('dMsg'), a = el.selectionStart == null ? el.value.length : el.selectionStart, b = el.selectionEnd == null ? a : el.selectionEnd;
  el.value = el.value.slice(0, a) + e + el.value.slice(b); el.selectionStart = el.selectionEnd = a + e.length; autosizeD();
  recentEmoji = [e, ...recentEmoji.filter((x) => x !== e)].slice(0, 24); store.set('recentEmoji', recentEmoji);
}

/* ---------------- me tab, settings, security ---------------- */
function renderMe() {
  const nm = me.name || 'Guest';
  setBigAva($('meDp'), { num: me.num, name: nm, avatar: me.avatar }); setBigAva($('meBtn'), { num: me.num, name: nm, avatar: me.avatar });
  $('meNameTxt').textContent = nm; $('meAbout').textContent = me.about || 'Hey there! I am using VoiceCall';
  $('meId').textContent = fmtId(me.num || '------'); $('meIdent').textContent = me.identifier || '—';
  const v = $('meVerified'); v.textContent = me.verified ? '✓ Verified' : 'Not verified'; v.className = me.verified ? 'verified' : 'unverified';
  if (document.activeElement !== $('meName')) $('meName').value = me.name || '';
  if (document.activeElement !== $('meAboutIn')) $('meAboutIn').value = me.about || '';
  renderBlockCount(); renderSettings();
}
const renderBlockCount = () => { $('blockCount').textContent = me.blocks && me.blocks.length ? me.blocks.length + ' blocked' : 'None'; };
async function renderSettings() {
  $('sSeen').checked = !me.settings || me.settings.showLastSeen !== false; $('sLoc').checked = cfg.loc; $('sDnd').checked = cfg.dnd; $('sVib').checked = cfg.vibrate; $('sNs').checked = cfg.ns;
  $('sVol').value = cfg.vol; $('sQuality').value = cfg.quality;
  if (currentTab === 'Me' && navigator.permissions) {
    const out = [];
    for (const [n, l] of [['microphone', 'Microphone'], ['camera', 'Camera'], ['geolocation', 'Location'], ['notifications', 'Notifications']]) { try { out.push(`${l}: ${(await navigator.permissions.query({ name: n })).state}`); } catch {} }
    $('sPermInfo').textContent = out.join(' · ') || 'Status is not available in this browser';
  }
}
RENDER.chats = renderChats; RENDER.calls = renderHistory; RENDER.contacts = renderContacts; RENDER.badges = renderBadges; RENDER.direct = renderDirect; RENDER.dial = () => { renderDial(); refreshProfileDlg(); };
$('meDp').onclick = () => $('dpFile').click();
$('dpFile').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const blob = await resizeImage(f, 256, 0.85, true);
    const r = await fetch('/api/me/avatar', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'X-VC-Token': session.token }, body: blob }), d = await r.json();
    if (!r.ok) throw new Error(d.error || 'upload failed'); setMe({ avatar: d.avatar }); toast('Profile photo updated');
  } catch (x) { toast('Could not update the photo: ' + (x.message || 'error')); }
};
$('meDpDel').onclick = async () => { try { await Net.api('DELETE', '/api/me/avatar'); setMe({ avatar: '' }); toast('Photo removed'); } catch { toast('Could not remove the photo'); } };
$('meSave').onclick = () => {
  const c = checkNameLocal($('meName').value); if (!c.ok) return toast(c.msg, 3500);
  if (!Net.send({ type: 'profile_update', name: c.name, about: $('meAboutIn').value.trim() })) return toast('Not connected — try again in a moment'); toast('Profile saved');
};
$('meId').onclick = async () => { try { await navigator.clipboard.writeText(me.num); toast('ID copied'); } catch { toast('Your ID is ' + fmtId(me.num)); } };
$('sSeen').onchange = (e) => Net.send({ type: 'settings', showLastSeen: e.target.checked });
$('sDnd').onchange = (e) => { cfg.dnd = e.target.checked; saveCfg(); Net.send({ type: 'dnd', on: cfg.dnd }); };
$('sVib').onchange = (e) => { cfg.vibrate = e.target.checked; saveCfg(); };
$('sNs').onchange = (e) => { cfg.ns = e.target.checked; saveCfg(); };
$('sLoc').onchange = async (e) => {
  if (!e.target.checked) { cfg.loc = false; saveCfg(); Net.send({ type: 'location', off: true }); return; }
  try { await getPosition(); cfg.loc = true; saveCfg(); reportLocation(); toast('Location sharing is on'); }
  catch { e.target.checked = false; cfg.loc = false; saveCfg(); toast('Location permission is blocked — enable it in Chrome → Site settings', 5000); }
};
$('sVol').oninput = (e) => { cfg.vol = +e.target.value; saveCfg(); };
$('sVol').onchange = () => { Tone.ring(); setTimeout(() => Tone.stop(), 900); };
$('sQuality').onchange = (e) => { cfg.quality = e.target.value; saveCfg(); };
$('sPerms').onclick = () => { ['pmMic', 'pmCam'].forEach((id) => { $(id).textContent = 'Required'; $(id).className = 'pstat'; }); $('pmNotif').textContent = 'Recommended'; $('pmNotif').className = 'pstat'; $('pmLoc').textContent = 'Optional'; $('pmLoc').className = 'pstat'; showPerms(); };
$('sBlocked').onclick = async () => {
  const names = (me.blocks || []).map((n) => `${displayName(n)} (${fmtId(n)})`).join(', ') || 'No one is blocked.';
  const v = await ask({ title: 'Blocked contacts', text: names, fields: me.blocks.length ? [{ name: 'num', label: 'Enter an ID to unblock', placeholder: '123456' }] : [], ok: me.blocks.length ? 'Unblock' : 'OK' });
  if (v && v.num) { const n = v.num.replace(/\D/g, ''); if (me.blocks.includes(n)) Net.send({ type: 'unblock', num: n }); else toast('That ID is not blocked'); }
};
$('sPass').onclick = async () => {
  const v = await ask({ title: 'Change password', fields: [{ name: 'cur', label: 'Current password', type: 'password' }, { name: 'next', label: 'New password (min 8 characters)', type: 'password' }], ok: 'Update' });
  if (!v) return;
  try { const r = await fetch('/api/me/password', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-VC-Token': session.token }, body: JSON.stringify({ current: v.cur, next: v.next }) }), d = await r.json(); toast(r.ok ? 'Password updated' : d.error || 'Could not update the password', 3500); } catch { toast('Could not reach the server'); }
};
$('sOut').onclick = signOut;
$('sDelete').onclick = async () => {
  if (!(await confirmAsk('Delete your account?', 'This permanently deletes your account, contacts, chats and photo. Your name, ID and email/mobile become free again.', 'Delete forever', true))) return;
  Net.send({ type: 'delete_me' }); setTimeout(() => { wipeAll(); location.reload(); }, 600);
};
$('sDiag').onclick = async () => {
  const out = $('sDiagOut'); out.classList.remove('hidden'); out.textContent = 'Running…';
  let health = 'unreachable', ms = '–';
  try { const t = performance.now(); const r = await fetch('/health', { cache: 'no-store' }); await r.json(); ms = Math.round(performance.now() - t) + ' ms'; health = 'OK'; } catch (e) { health = 'FAILED (' + e.message + ')'; }
  out.textContent = [`Server: ${health} (${ms})`, `Transport: ${Net.mode}`, `Status: ${Net.status}`, `Registered: ${Net.registered}`, `Last error: ${Net.lastError || 'none'}`, `Secure context: ${window.isSecureContext}`,
    `Push: ${'PushManager' in window ? (pushDone ? 'subscribed' : 'not subscribed') : 'unsupported'}`, `ICE servers: ${ICE.length}`, `Notifications: ${'Notification' in window ? Notification.permission : 'n/a'}`, `Your ID: ${me.num}`].join('\n');
};

/* ---------------- security code (call verification) ---------------- */
async function showSecurityCode() {
  if (!C || !C.pc || C.state !== 'active') return toast('Available once the call connects');
  const fp = (sdp) => (/a=fingerprint:\S+ ([0-9A-F:]+)/i.exec(sdp || '') || [])[1] || '';
  const parts = [fp(C.pc.localDescription && C.pc.localDescription.sdp), fp(C.pc.remoteDescription && C.pc.remoteDescription.sdp)].sort();
  if (!parts[0] || !parts[1]) return toast('Security code is not available yet');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('|'))));
  const SYM = ['🐶', '🐱', '🦊', '🐼', '🐸', '🦁', '🐵', '🐧', '🦋', '🐢', '🐙', '🐳', '🌵', '🌻', '🍎', '🍋', '🍇', '🍉', '🍕', '🍩', '⚽', '🎸', '🚀', '🌙', '⭐', '🔥', '💎', '🎈', '🔑', '🎁', '☂️', '⚓'];
  $('more').classList.add('hidden');
  await ask({ title: 'Security code', text: 'Ask the other person to read theirs. If the symbols match, nobody is listening in on this call.', node: h('div', { class: 'sec-code', text: [...digest.slice(0, 6)].map((x) => SYM[x % 32]).join(' ') }), ok: 'Done', hideCancel: true });
}
$('mCode').onclick = showSecurityCode;

/* ------------------------------ boot ------------------------------ */
function openFromUrl() {
  const q = new URLSearchParams(location.search), chat = q.get('chat'), call = /call=(\d{6})/.exec(location.hash);
  if (q.get('answer')) autoAnswerUntil = Date.now() + 45000;
  if (call) { dialStr = call[1]; renderDial(); switchTab('Calls'); }
  if (chat && /^\d{6}$/.test(chat)) setTimeout(() => openDirect(chat), 150);
  if (q.toString() || location.hash) history.replaceState(null, '', location.pathname);
}
async function boot() {
  buildEmojiFor($('dEmojiTabs'), $('dEmojiGrid'), pickDirectEmoji); buildEmoji(); buildKeypad(); renderDial(); renderSendIcon(); renderNet();
  fetch('/config').then((r) => r.json()).then((c) => { ICE = c.iceServers; vapidKey = c.vapid || ''; verification = c.verification || verification; }).catch(() => {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => { const d = e.data || {}; if (d.type === 'open-chat') openDirect(d.num); else if (d.type === 'answer') autoAnswerUntil = Date.now() + 45000; });
  if (!session.token) { let msg = ''; try { msg = sessionStorage.getItem('vc_msg') || ''; sessionStorage.removeItem('vc_msg'); } catch {} showAuth('in', msg); return; }
  setMe({}); showHome(); renderChats(); renderHistory(); openFromUrl();
  if (!store.get('permsDone', false)) showPerms(); else startSession();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  Net.check(); if (directOpenNum) markRead(directOpenNum);
  if (C && !wake && navigator.wakeLock) navigator.wakeLock.request('screen').then((w) => (wake = w)).catch(() => {});
});
window.addEventListener('online', () => Net.check());
window.addEventListener('beforeunload', () => { if (C) Net.send({ type: 'bye' }); });
document.addEventListener('keydown', (e) => {
  if (C || INC || currentTab !== 'Calls' || directOpenNum || $('paneKeys').classList.contains('hidden') || document.querySelector('.overlay:not(.hidden), .screen:not(.hidden)') || /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) return;
  if (/^\d$/.test(e.key)) pressKey(e.key); else if (e.key === 'Backspace') pressKey('<'); else if (e.key === 'Enter' && dialStr.length === 6) placeCall(dialStr, false);
});
boot();
})();
