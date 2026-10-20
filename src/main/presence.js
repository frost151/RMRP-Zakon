'use strict';
// Отметка «программа открыта» для счётчика онлайна (server/). Шлётся только случайный номер копии,
// выбранная фракция и версия — без данных игрока. Ошибки сети молча пропускаем.
const crypto = require('crypto');

// адрес воркера Cloudflare (server/); для проверки на локальном сервере — PROTOKOL_ONLINE_URL
const URL_BASE = process.env.PROTOKOL_ONLINE_URL || 'https://protokol-online.protokol-online.workers.dev';
const EVERY = 3 * 60 * 1000;

function setupPresence(settings, version) {
  if (!URL_BASE) return { ping() {}, bye: async () => {}, online: async () => null };
  let { clientId } = settings.get();
  if (!clientId) {
    clientId = crypto.randomBytes(16).toString('hex');
    settings.set({ clientId });
  }
  const send = (path, body, ms) => fetch(URL_BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: clientId, ...body }),
    signal: AbortSignal.timeout(ms),
  }).catch(() => {});

  const ping = () => send('/ping', { faction: settings.get().faction, version }, 10000);
  ping();
  setInterval(ping, EVERY).unref();
  // онлайн для разработчика: сервер отдаёт статистику только по ключу ADMIN_KEY
  const online = async (key) => {
    if (!key) return null;
    try {
      const res = await fetch(`${URL_BASE}/stats?json&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(10000) });
      if (res.status === 403) return { error: 'Неверный ключ' };
      if (!res.ok) return null;
      return { online: (await res.json()).online };
    } catch {
      return null;
    }
  };
  return { ping, bye: () => send('/bye', {}, 1500), online };
}

module.exports = { setupPresence };
