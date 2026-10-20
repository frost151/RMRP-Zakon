// Счётчик онлайна «Протокола» на Cloudflare Workers.
// Программы раз в 3 минуты шлют POST /ping {id, faction, version} — id случайный, без данных игрока.
// Онлайн — кто отметился за последние 7 минут. Статистика: GET /stats?key=<ADMIN_KEY> (только для разработчика).
import { DurableObject } from 'cloudflare:workers';

const ONLINE_MS = 7 * 60 * 1000;
const KEEP_DAYS = 30;
const ID_RE = /^[a-f0-9]{16,64}$/;
const FACTIONS = { gibdd: 'ГИБДД', uvd: 'УВД', fsb: 'ФСБ', lawyer: 'Адвокат', sk: 'СК и Прокуратура' };

// Сутки считаем по Москве
const day = (ts) => new Date(ts + 3 * 3600 * 1000).toISOString().slice(0, 10);
const clip = (s, n) => String(s ?? '').slice(0, n);

export class Presence extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // онлайн храним в базе: простаивающий объект Cloudflare выгружает из памяти
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS online (id TEXT PRIMARY KEY, f TEXT, v TEXT, t INTEGER)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS seen (day TEXT, id TEXT, PRIMARY KEY (day, id))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)');
    this.lastDay = null;
  }

  prune(now) {
    this.sql.exec('DELETE FROM online WHERE t < ?', now - ONLINE_MS);
  }

  onlineCount() {
    return this.sql.exec('SELECT COUNT(*) AS n FROM online').one().n;
  }

  getMeta(k) {
    const row = this.sql.exec('SELECT v FROM meta WHERE k = ?', k).toArray()[0];
    return row ? JSON.parse(row.v) : null;
  }

  setMeta(k, v) {
    this.sql.exec('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)', k, JSON.stringify(v));
  }

  ping({ id, faction, version }) {
    const now = Date.now();
    this.sql.exec('INSERT OR REPLACE INTO online (id, f, v, t) VALUES (?, ?, ?, ?)', id, clip(faction, 20), clip(version, 20), now);
    this.prune(now);
    const n = this.onlineCount();
    const today = day(now);
    this.sql.exec('INSERT OR IGNORE INTO seen (day, id) VALUES (?, ?)', today, id);
    if (this.lastDay !== today) {
      this.lastDay = today;
      const cutoff = day(now - KEEP_DAYS * 86400 * 1000);
      this.sql.exec('DELETE FROM seen WHERE day < ?', cutoff);
    }
    const record = this.getMeta('record');
    if (!record || n > record.n) this.setMeta('record', { n, at: now });
  }

  bye(id) {
    this.sql.exec('DELETE FROM online WHERE id = ?', id);
  }

  stats() {
    const now = Date.now();
    this.prune(now);
    const count = (col) => Object.fromEntries(this.sql.exec(`SELECT ${col} AS k, COUNT(*) AS n FROM online GROUP BY ${col}`).toArray().map((r) => [r.k || '—', r.n]));
    const days = this.sql.exec('SELECT day, COUNT(*) AS n FROM seen GROUP BY day ORDER BY day DESC').toArray();
    return {
      online: this.onlineCount(),
      factions: count('f'),
      versions: count('v'),
      record: this.getMeta('record'),
      today: days.find((d) => d.day === day(now))?.n || 0,
      days,
      now,
    };
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const msk = (ts) => new Date(ts).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

function rows(obj, names = {}) {
  const list = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  if (!list.length) return '<tr><td colspan="2" class="mut">никого</td></tr>';
  return list.map(([k, n]) => `<tr><td>${esc(names[k] || k)}</td><td>${n}</td></tr>`).join('');
}

function page(s) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="30"><title>Протокол — онлайн</title>
<style>
body{margin:0;padding:24px 16px;background:#0e1319;color:#dbe4ee;font:15px/1.5 "Segoe UI",system-ui,sans-serif}
main{max-width:640px;margin:auto}h1{font-size:20px;margin:0 0 4px}.mut{color:#8193a8}
.big{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0}.big div{flex:1;min-width:130px;padding:14px;border-radius:12px;background:#141b24;border:1px solid #233040}
.big b{display:block;font-size:32px;line-height:1.1}.big span{font-size:13px;color:#8193a8}
h2{font-size:14px;margin:22px 0 6px;color:#8193a8;font-weight:600}
table{width:100%;border-collapse:collapse}td{padding:6px 2px;border-bottom:1px solid #1d2733}td:last-child{text-align:right;font-weight:600}
</style></head><body><main>
<h1>Протокол — кто в программе</h1>
<div class="mut">обновляется каждые 30 с · ${esc(msk(s.now))} МСК</div>
<div class="big">
<div><b>${s.online}</b><span>онлайн сейчас</span></div>
<div><b>${s.today}</b><span>за сегодня</span></div>
<div><b>${s.record ? s.record.n : 0}</b><span>рекорд${s.record ? ` · ${esc(msk(s.record.at))}` : ''}</span></div>
</div>
<h2>По фракциям</h2><table>${rows(s.factions, FACTIONS)}</table>
<h2>По версиям</h2><table>${rows(s.versions)}</table>
<h2>Разных людей по дням</h2><table>${s.days.map((d) => `<tr><td>${esc(d.day.split('-').reverse().join('.'))}</td><td>${d.n}</td></tr>`).join('') || '<tr><td class="mut">пока пусто</td></tr>'}</table>
</main></body></html>`;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const stub = env.PRESENCE.get(env.PRESENCE.idFromName('main'));

    if (req.method === 'POST' && (url.pathname === '/ping' || url.pathname === '/bye')) {
      let body;
      try { body = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
      if (!body || !ID_RE.test(String(body.id))) return new Response('bad id', { status: 400 });
      if (url.pathname === '/ping') await stub.ping(body);
      else await stub.bye(body.id);
      return new Response(null, { status: 204 });
    }

    if (url.pathname === '/stats') {
      if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) return new Response('нет доступа', { status: 403 });
      const s = await stub.stats();
      if (url.searchParams.has('json')) return Response.json(s);
      return new Response(page(s), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    return new Response('Протокол', { status: 200 });
  },
};
