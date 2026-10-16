'use strict';
// Кэш законов на диске: скачивает с форума только темы, изменившиеся с прошлого раза.
const fs = require('fs');
const path = require('path');
const { fetchThreadList, fetchThread } = require('./forum');
const { parseLaw } = require('./laws-parser');

// Версия формата: при изменении парсера кэш пересобирается целиком
const FORMAT = 1;

class LawStore {
  constructor(dir) {
    this.file = path.join(dir, 'laws.json');
    this.data = { format: FORMAT, checkedAt: 0, laws: {} };
    this.updating = null;
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (saved.format === FORMAT) this.data = saved;
    } catch {
      // кэша ещё нет — начнём с пустого
    }
  }

  list() {
    return { checkedAt: this.data.checkedAt, laws: Object.values(this.data.laws) };
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
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
    const stale = threads.filter((t) => {
      const cached = this.data.laws[t.id];
      return !cached || !t.lastTime || cached.lastTime < t.lastTime;
    });
    let done = 0;
    onProgress({ done, total: stale.length });
    for (const t of stale) {
      onProgress({ done, total: stale.length, title: t.title });
      this.data.laws[t.id] = parseLaw(t, await fetchThread(t.url));
      done++;
    }
    const alive = new Set(threads.map((t) => t.id));
    for (const id of Object.keys(this.data.laws)) {
      if (!alive.has(id)) delete this.data.laws[id];
    }
    this.data.checkedAt = Date.now();
    this.save();
    onProgress({ done, total: stale.length });
    return { changed: stale.length, ...this.list() };
  }
}

module.exports = { LawStore };
