'use strict';
// Настройки пользователя в settings.json рядом с кэшем.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  faction: 'all',
  // toggle — показать/скрыть планшет, timer — старт/пауза задержания, lawyer — шаг ожидания адвоката
  hotkeys: { toggle: 'F9', timer: 'F10', lawyer: 'F11' },
  alwaysOnTop: true,
  splash: true, // заставка при запуске
  uiSound: true, // мелодия включения и звук смены фракции (звуки таймера не выключаются)
  bounds: null,
  miniPos: null,
};

class Settings {
  constructor(dir) {
    this.file = path.join(dir, 'settings.json');
    this.values = { ...DEFAULTS };
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      // первая версия хранила одну клавишу в hotkey
      if (saved.hotkey) {
        saved.hotkeys = { ...DEFAULTS.hotkeys, ...saved.hotkeys, toggle: saved.hotkey };
        delete saved.hotkey;
      }
      Object.assign(this.values, saved);
      this.values.hotkeys = { ...DEFAULTS.hotkeys, ...this.values.hotkeys };
    } catch {
      // первый запуск
    }
  }

  get() {
    return { ...this.values };
  }

  set(patch) {
    Object.assign(this.values, patch);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.values, null, 2));
    return this.get();
  }
}

module.exports = { Settings };
