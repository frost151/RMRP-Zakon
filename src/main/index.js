'use strict';
// Главный процесс: окно-планшет поверх игры, мини-таймер, горячие клавиши, связь с кэшем законов.
const path = require('path');
const { app, BrowserWindow, globalShortcut, ipcMain, shell, clipboard, screen } = require('electron');
const { LawStore } = require('./law-store');
const { Settings } = require('./settings');
const { Detention } = require('./detention');
const { FACTIONS } = require('./laws-meta');
const { setupUpdater } = require('./updater');
const { setupPresence } = require('./presence');

let win = null;
let mini = null;
let store = null;
let settings = null;
let detention = null;
let presence = null;

// Папка данных не зависит от названия программы: кэш законов и настройки сохраняются между версиями
app.setPath('userData', path.join(app.getPath('appData'), 'rmrp-zakon'));

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => showWindow());

const RENDERER = path.join(__dirname, '..', 'renderer');
// значок окна на панели задач (без него в окне виден стандартный значок Electron)
const ICON = path.join(__dirname, '..', 'assets', 'icon.png');
// тот же идентификатор, что у ярлыка установщика (appId) — панель задач связывает окно со значком программы
app.setAppUserModelId('ru.rmrp.zakon');
const webPreferences = {
  preload: path.join(__dirname, '..', 'preload.js'),
  contextIsolation: true,
  sandbox: true,
  // таймер должен тикать и пищать, даже когда планшет скрыт
  backgroundThrottling: false,
  // звуки таймера по горячей клавише из игры, без клика по окну
  autoplayPolicy: 'no-user-gesture-required',
};

function createWindow() {
  const b = settings.get().bounds;
  win = new BrowserWindow({
    icon: ICON,
    width: b ? b.width : 1340,
    height: b ? b.height : 820,
    x: b ? b.x : undefined,
    y: b ? b.y : undefined,
    minWidth: 980,
    minHeight: 560,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    title: 'Протокол',
    webPreferences,
  });
  applyAlwaysOnTop();
  win.loadFile(path.join(RENDERER, 'index.html'));
  win.once('ready-to-show', () => win.show());

  const saveBounds = () => { if (!win.isMinimized()) settings.set({ bounds: win.getBounds() }); };
  win.on('moved', saveBounds);
  win.on('resized', saveBounds);
  for (const ev of ['show', 'hide', 'minimize', 'restore']) win.on(ev, updateMini);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Маленькое окно с таймером поверх игры, пока планшет скрыт
function createMini() {
  const area = screen.getPrimaryDisplay().workArea;
  const pos = settings.get().miniPos || { x: area.x + area.width - 300, y: area.y + 40 };
  mini = new BrowserWindow({
    icon: ICON,
    width: 280,
    height: 92,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    resizable: false,
    focusable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences,
  });
  mini.setAlwaysOnTop(true, 'screen-saver');
  mini.loadFile(path.join(RENDERER, 'mini.html'));
  mini.on('moved', () => {
    const [x, y] = mini.getPosition();
    settings.set({ miniPos: { x, y } });
  });
}

function updateMini() {
  if (!mini || mini.isDestroyed()) return;
  const tabletHidden = !win.isVisible() || win.isMinimized();
  const need = detention.s.running && tabletHidden;
  if (need && !mini.isVisible()) mini.showInactive();
  if (!need && mini.isVisible()) mini.hide();
}

function broadcast(channel, payload) {
  for (const w of [win, mini]) if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
}

function applyAlwaysOnTop() {
  // уровень screen-saver держит окно поверх игры в режиме «окно без рамки»
  win.setAlwaysOnTop(settings.get().alwaysOnTop, 'screen-saver');
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.webContents.send('focus-search');
}

function toggleWindow() {
  if (win.isVisible() && win.isFocused()) win.hide();
  else showWindow();
}

// Таймер задержания есть только у фракций с инструментом timers (у адвоката его нет)
function hasTimers() {
  const f = FACTIONS[settings.get().faction] || FACTIONS.uvd;
  return f.tools.includes('timers');
}

const HOTKEY_ACTIONS = {
  toggle: toggleWindow,
  timer: () => { if (hasTimers()) detention.togglePause(); },
  lawyer: () => { if (hasTimers()) detention.waitStep('lawyer'); },
};

// Регистрирует все клавиши; возвращает { имя: текст ошибки } для тех, что не удалось занять
function registerHotkeys(hotkeys) {
  globalShortcut.unregisterAll();
  const errors = {};
  const used = new Set();
  for (const [name, accel] of Object.entries(hotkeys)) {
    if (!accel) continue;
    if (used.has(accel)) { errors[name] = 'Это сочетание уже назначено на другое действие'; continue; }
    try {
      if (globalShortcut.register(accel, HOTKEY_ACTIONS[name])) used.add(accel);
      else errors[name] = 'Клавиша занята другой программой';
    } catch {
      errors[name] = 'Неверное сочетание клавиш';
    }
  }
  return errors;
}

ipcMain.handle('init', () => ({
  settings: settings.get(),
  factions: FACTIONS,
  detention: detention.state(),
  version: app.getVersion(),
  ...store.list(),
}));

ipcMain.handle('settings:set', (_, patch) => {
  const prev = settings.get();
  if (patch.hotkeys) {
    const next = { ...prev.hotkeys, ...patch.hotkeys };
    const errors = registerHotkeys(next);
    const failed = Object.keys(patch.hotkeys).find((k) => errors[k]);
    if (failed) {
      registerHotkeys(prev.hotkeys);
      return { error: errors[failed], settings: prev };
    }
    patch = { ...patch, hotkeys: next };
  }
  const saved = settings.set(patch);
  if ('alwaysOnTop' in patch) applyAlwaysOnTop();
  if ('faction' in patch) presence.ping();
  return { settings: saved };
});

ipcMain.handle('laws:update', async () => {
  try {
    return await store.update((p) => win && win.webContents.send('laws:progress', p));
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.on('det', (_, action, arg) => {
  const d = detention;
  ({
    start: () => d.start(),
    pause: () => d.togglePause(),
    stop: () => d.stop(),
    reset: () => d.reset(),
    wait: () => d.waitStep(arg),
    cancelWait: () => d.cancelWait(arg),
    short: () => d.startShort(arg),
    flags: () => d.setFlags(arg),
    log: () => { d.log(String(arg)); d.emit(); },
  }[action] || (() => {}))();
});

ipcMain.on('clipboard', (_, text) => clipboard.writeText(String(text)));

ipcMain.on('win', (_, action) => {
  if (action === 'minimize') win.minimize();
  if (action === 'hide') win.hide();
  if (action === 'show') showWindow();
  // перед выходом снимаем отметку онлайна (не дольше 1,5 с)
  if (action === 'close') { win.hide(); presence.bye().finally(() => app.quit()); }
});

app.whenReady().then(() => {
  const dir = app.getPath('userData');
  settings = new Settings(dir);
  store = new LawStore(dir);
  detention = new Detention(
    (state) => { broadcast('det:state', state); updateMini(); },
    (text, sound) => broadcast('det:alert', { text, sound }),
  );
  createWindow();
  createMini();
  presence = setupPresence(settings, app.getVersion());
  setupUpdater((channel, payload) => win && win.webContents.send(channel, payload));
  const errors = registerHotkeys(settings.get().hotkeys);
  for (const [name, err] of Object.entries(errors)) console.warn(`Горячая клавиша ${name}: ${err}`);
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
