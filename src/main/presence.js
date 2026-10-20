'use strict';
// Отметка «программа открыта» для счётчика онлайна (server/). Шлётся только случайный номер копии,
// выбранная фракция и версия — без данных игрока. Ошибки сети молча пропускаем.
const crypto = require('crypto');

// адрес воркера Cloudflare; пусто — счётчик выключен (для проверки можно задать PROTOKOL_ONLINE_URL)
const URL_BASE = process.env.PROTOKOL_ONLINE_URL || '';
const EVERY = 3 * 60 * 1000;

function setupPresence(settings, version) {
  if (!URL_BASE) return { ping() {}, bye: async () => {} };
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
  return { ping, bye: () => send('/bye', {}, 1500) };
}

module.exports = { setupPresence };
