'use strict';
// Законы с форума: скачиваются целиком при каждом запуске и хранятся только в памяти, на диск не пишутся.
const fs = require('fs');
const path = require('path');
const { fetchThreadList, fetchThread } = require('./forum');
const { parseLaw } = require('./laws-parser');

// Сколько тем качать одновременно: целиком база грузится за 2–3 секунды
const PARALLEL = 6;

class LawStore {
  constructor(dir) {
    this.data = { checkedAt: 0, laws: {} };
    this.updating = null;
    // старые версии хранили кэш законов на диске — убираем его
    for (const f of ['laws.json', 'laws.json.tmp']) fs.rm(path.join(dir, f), { force: true }, () => {});
  }

  list() {
    return { checkedAt: this.data.checkedAt, laws: Object.values(this.data.laws) };
  }

  // onProgress({ done, total, title })
  update(onProgress = () => {}) {
    if (!this.updating) {
      this.updating = this._update(onProgress).finally(() => { this.updating = null; });
    }
    return this.updating;
  }

  async _update(onProgress) {
    const threads = await fetchThreadList();
    const laws = {};
    let done = 0;
    let next = 0;
    onProgress({ done, total: threads.length });
    const worker = async () => {
      while (next < threads.length) {
        const t = threads[next++];
        laws[t.id] = parseLaw(t, await fetchThread(t.url));
        onProgress({ done: ++done, total: threads.length, title: t.title });
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    this.data = { checkedAt: Date.now(), laws };
    return { changed: threads.length, ...this.list() };
  }
}

module.exports = { LawStore };
