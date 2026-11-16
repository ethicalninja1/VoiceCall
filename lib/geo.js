'use strict';
const { isPrivateIp } = require('./util');

/**
 * IP -> approximate location (city level). Uses a free HTTPS service by default (ipwho.is).
 * Override with GEOIP_URL (use {ip} as placeholder); disable with GEOIP=off.
 * Results are cached for 24 h so each IP is looked up once.
 */
function createGeo({ url, enabled = true } = {}) {
  const tpl = url || 'https://ipwho.is/{ip}';
  const cache = new Map();
  const TTL = 24 * 3600_000, FAIL_TTL = 10 * 60_000;

  function normalize(d) {
    if (!d || typeof d !== 'object') return null;
    if (d.success === false || d.status === 'fail') return null;
    const lat = Number(d.latitude ?? d.lat), lon = Number(d.longitude ?? d.lon);
    return {
      country: d.country || '', countryCode: d.country_code || d.countryCode || '',
      region: d.region || d.regionName || '', city: d.city || '',
      isp: (d.connection && (d.connection.isp || d.connection.org)) || d.isp || d.org || '',
      tz: (d.timezone && d.timezone.id) || (typeof d.timezone === 'string' ? d.timezone : ''),
      lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null,
      source: 'ip', at: Date.now(),
    };
  }

  async function lookup(ip) {
    if (!ip) return null;
    if (isPrivateIp(ip)) return { local: true, city: 'Local network', country: '', source: 'ip', at: Date.now() };
    if (!enabled) return null;
    const hit = cache.get(ip);
    if (hit && Date.now() - hit.at < (hit.v ? TTL : FAIL_TTL)) return hit.v;
    let v = null;
    try {
      const r = await fetch(tpl.replace('{ip}', encodeURIComponent(ip)), { signal: AbortSignal.timeout(4000), headers: { Accept: 'application/json' } });
      if (r.ok) v = normalize(await r.json());
    } catch { /* network unavailable */ }
    cache.set(ip, { v, at: Date.now() });
    if (cache.size > 5000) cache.clear();
    return v;
  }
  return { lookup };
}
module.exports = { createGeo };
