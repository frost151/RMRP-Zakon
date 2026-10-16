'use strict';
// Обновление программы из Releases на GitHub (frost151/RMRP-Zakon): проверка при запуске,
// скачивание и установка — только по кнопке «Обновить».
const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

// Текст описания выпуска приходит HTML-ом — показываем его как обычный текст
function notesText(notes) {
  const raw = Array.isArray(notes) ? notes.map((n) => n.note).join('\n') : notes || '';
  return raw
    .replace(/<\/(p|li|h\d)>|<br\s*\/?>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function setupUpdater(send) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  // в разработке проверка идёт по dev-app-update.yml, если он есть
  if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true;

  autoUpdater.on('download-progress', (p) => send('update:progress', Math.round(p.percent)));
  autoUpdater.on('update-downloaded', () => send('update:ready'));
  autoUpdater.on('error', (e) => send('update:error', e.message));

  ipcMain.handle('update:check', async () => {
    try {
      const res = await autoUpdater.checkForUpdates();
      if (!res || !res.isUpdateAvailable) return null;
      return { version: res.updateInfo.version, notes: notesText(res.updateInfo.releaseNotes) };
    } catch (e) {
      // нет сети или выпусков — тихо пропускаем, это не мешает работе
      console.warn('Проверка обновлений:', e.message);
      return null;
    }
  });
  ipcMain.handle('update:download', () => autoUpdater.downloadUpdate().then(() => true, (e) => ({ error: e.message })));
  // тихая установка и запуск новой версии
  ipcMain.on('update:install', () => autoUpdater.quitAndInstall(true, true));
}

module.exports = { setupUpdater };
