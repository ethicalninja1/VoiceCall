'use strict';
/** Web Push (VAPID): rings / notifies users even when the app or browser is closed. */
function createPush({ db, env = process.env, sender }) {
  let wp = null;
  try { wp = require('web-push'); } catch { /* optional */ }
  let pub = db.getMeta('vapid_pub'), priv = db.getMeta('vapid_priv');
  if (wp && (!pub || !priv)) { const k = wp.generateVAPIDKeys(); pub = k.publicKey; priv = k.privateKey; db.setMeta('vapid_pub', pub); db.setMeta('vapid_priv', priv); }
  if (wp) wp.setVapidDetails(env.VAPID_SUBJECT || 'mailto:admin@voicecall.local', pub, priv);

  return {
    enabled: !!(wp || sender), publicKey: pub || '',
    /** Sends to every subscription of `user`; prunes dead ones. Resolves to the number delivered. */
    async send(user, payload, { ttl = 60, urgency = 'normal' } = {}) {
      if (!user.push || !user.push.length) return 0;
      let ok = 0; const dead = [];
      await Promise.all(user.push.map(async (sub) => {
        try { await (sender ? sender(sub, payload, { ttl, urgency }) : wp.sendNotification(sub, JSON.stringify(payload), { TTL: ttl, urgency })); ok++; }
        catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) dead.push(sub.endpoint); }
      }));
      if (dead.length) user.push = user.push.filter((s) => !dead.includes(s.endpoint));
      return ok;
    },
  };
}
module.exports = { createPush };
