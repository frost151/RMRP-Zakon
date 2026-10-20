'use strict';
// Мост между окнами и главным процессом.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  init: () => ipcRenderer.invoke('init'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  updateLaws: () => ipcRenderer.invoke('laws:update'),
  online: () => ipcRenderer.invoke('online'),
  onProgress: (fn) => ipcRenderer.on('laws:progress', (_, p) => fn(p)),
  onFocusSearch: (fn) => ipcRenderer.on('focus-search', () => fn()),
  det: (action, arg) => ipcRenderer.send('det', action, arg),
  onDetState: (fn) => ipcRenderer.on('det:state', (_, s) => fn(s)),
  onDetAlert: (fn) => ipcRenderer.on('det:alert', (_, a) => fn(a)),
  copy: (text) => ipcRenderer.send('clipboard', text),
  win: (action) => ipcRenderer.send('win', action),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.send('update:install'),
  onUpdate: (fn) => {
    ipcRenderer.on('update:progress', (_, p) => fn('progress', p));
    ipcRenderer.on('update:ready', () => fn('ready'));
    ipcRenderer.on('update:error', (_, e) => fn('error', e));
  },
});
