'use strict';
// Настройки пользователя в settings.json рядом с кэшем.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  faction: 'all',
  // toggle — показать/скрыть планшет, timer — старт/пауза задержания, lawyer — шаг ожидания адвоката
  hotkeys: { toggle: 'F9', timer: 'F10', lawyer: 'F11' },
  alwaysOnTop: true,
  // звуки: мелодия заставки, звуки интерфейса (смена фракции), сигналы таймера задержания
  sounds: { startup: true, ui: true, timer: true },
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
      // раньше был один выключатель uiSound — для мелодии и смены фракции
      if ('uiSound' in saved) {
        saved.sounds = { ...DEFAULTS.sounds, startup: saved.uiSound, ui: saved.uiSound, ...saved.sounds };
        delete saved.uiSound;
      }
      delete saved.splash; // заставка теперь всегда: на ней грузятся законы
      Object.assign(this.values, saved);
      this.values.hotkeys = { ...DEFAULTS.hotkeys, ...this.values.hotkeys };
      this.values.sounds = { ...DEFAULTS.sounds, ...this.values.sounds };
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
