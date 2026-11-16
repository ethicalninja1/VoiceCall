'use strict';
const crypto = require('crypto');

const TRUST_PROXY = process.env.TRUST_PROXY !== 'false';

const normalizeIp = (ip) => { ip = String(ip || '').trim(); return ip.startsWith('::ffff:') ? ip.slice(7) : ip; };

function isPrivateIp(ip) {
  ip = normalizeIp(ip);
  if (!ip) return true;
  if (ip.includes(':')) { const l = ip.toLowerCase(); return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80'); }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(Number.isNaN)) return true;
  return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
}

/**
 * Real client IP. Forwarded headers (Cloudflare / reverse proxy) are trusted ONLY when the
 * direct TCP peer is a loopback/private address, so they cannot be spoofed from the internet.
 */
function clientIp(req) {
  const direct = normalizeIp(req.socket && req.socket.remoteAddress);
  if (TRUST_PROXY && isPrivateIp(direct)) {
    const h = req.headers || {};
    const v = h['cf-connecting-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || h['x-real-ip'];
    if (v && String(v).trim()) return normalizeIp(v);
  }
  return direct;
}

const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** Tiny per-IP sliding-window rate limiter (Express middleware). */
function limiter(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const ip = clientIp(req), t = Date.now();
    const h = (hits.get(ip) || []).filter((x) => t - x < windowMs);
    if (h.length >= max) return res.status(429).json({ error: 'rate_limited' });
    h.push(t); hits.set(ip, h);
    if (hits.size > 5000) hits.clear();
    next();
  };
}
module.exports = { clientIp, normalizeIp, isPrivateIp, hashToken, safeEq, limiter };
