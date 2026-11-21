const { verify, sb, yangonDay, canRead, canWrite, staffWindow, readBody, send, configured, DAY_PATH } = require('./_lib');

const enc = encodeURIComponent;
const MAX_BODY = 180000;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!configured()) return send(res, 500, { error: 'Server is not set up yet (missing environment variables).' });
  const auth = String(req.headers.authorization || '');
  const user = verify(auth.replace(/^Bearer\s+/i, ''));
  if (!user) return send(res, 401, { error: 'Please sign in again.' });
  const b = readBody(req);
  const role = user.role;
  try {
    if (b.op === 'get') {
      const path = String(b.path || '');
      if (!canRead(role, path)) return send(res, 403, { error: 'Not allowed.' });
      const rows = await sb('GET', 'docs?select=data,updated_at&path=eq.' + enc(path));
      return send(res, 200, rows && rows[0] ? { exists: true, data: rows[0].data, u: rows[0].updated_at } : { exists: false });
    }

    if (b.op === 'poll') {
      let lo = /^\d{4}-\d{2}-\d{2}$/.test(b.from || '') ? b.from : '0000-01-01';
      let hi = '9999-12-31';
      if (role === 'staff') {
        const w = staffWindow();
        if (lo < w.lo) lo = w.lo;
        hi = w.hi;
      }
      const limit = Math.max(1, Math.min(12, parseInt(b.limit, 10) || 12));
      const range = 'path=gte.' + enc('days/' + lo) + '&path=lt.' + enc('days/' + hi + '~');
      let q = 'docs?select=path,data,updated_at&' + range + '&order=path.asc&limit=' + (limit + 1);
      if (b.since) q += '&updated_at=gt.' + enc(String(b.since));
      if (b.after) q += '&path=gt.' + enc(String(b.after));
      const rows = (await sb('GET', q)) || [];
      const more = rows.length > limit;
      const docs = rows.slice(0, limit).map((r) => ({ id: r.path.replace(/^days\//, ''), data: r.data, u: r.updated_at }));
      const out = { docs, more };
      if (!b.after) {
        const idRows = (await sb('GET', 'docs?select=path&' + range + '&order=path.asc&limit=5000')) || [];
        out.ids = idRows.map((r) => r.path.replace(/^days\//, ''));
        const cfg = (await sb('GET', 'docs?select=path,data,updated_at&path=in.(' + enc('"config/menu","config/settings"') + ')')) || [];
        out.cfg = {};
        cfg.forEach((r) => (out.cfg[r.path.replace('config/', '')] = { data: r.data, u: r.updated_at }));
      }
      return send(res, 200, out);
    }

    if (b.op === 'set' || b.op === 'update') {
      const path = String(b.path || '');
      if (!canWrite(role, path)) return send(res, 403, { error: 'Not allowed.' });
      const data = b.data && typeof b.data === 'object' ? b.data : null;
      if (!data || JSON.stringify(data).length > MAX_BODY) return send(res, 400, { error: 'Bad or too large data.', code: 'invalid_argument' });
      const m = DAY_PATH.exec(path);
      if (m) {
        const orders = data.orders && typeof data.orders === 'object' && !Array.isArray(data.orders) ? data.orders : null;
        if (!orders) return send(res, 400, { error: 'Missing orders.', code: 'invalid_argument' });
        await sb('POST', 'rpc/merge_day', { p_path: path, p_date: m[1], p_orders: orders });
      } else {
        if (b.op === 'update') return send(res, 400, { error: 'Use set for settings.', code: 'invalid_argument' });
        await sb('POST', 'docs?on_conflict=path', { path, data }, { Prefer: 'resolution=merge-duplicates,return=minimal' });
      }
      return send(res, 200, { ok: true });
    }

    if (b.op === 'delete') {
      const path = String(b.path || '');
      if (role !== 'owner' || !DAY_PATH.test(path)) return send(res, 403, { error: 'Only the owner can delete.' });
      await sb('DELETE', 'docs?path=eq.' + enc(path));
      return send(res, 200, { ok: true });
    }
    return send(res, 400, { error: 'Unknown request.' });
  } catch (e) {
    return send(res, 502, { error: 'Database problem: ' + (e && e.message ? e.message : 'unknown'), code: 'unavailable' });
  }
};
