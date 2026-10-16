---
name: electron-env-quirks
description: "Как ставить, запускать и собирать Electron на машине пользователя — зеркало npmmirror, ELECTRON_RUN_AS_NODE, winCodeSign"
metadata:
  node_type: memory
  type: reference
  originSessionId: 6b7cba12-085d-4353-a32a-f5382d05e8a9
  modified: 2026-10-16T12:23:47.182Z
---

- Скачивание бинарника Electron с GitHub рвётся (ECONNRESET). Ставить так: `$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'`, затем `npm install-scripts approve electron` и `npm rebuild electron` (npm 11 блокирует install-скрипты).
- Процессы из VS Code наследуют `ELECTRON_RUN_AS_NODE=1` → `require('electron').app` undefined. Перед запуском: `Remove-Item Env:ELECTRON_RUN_AS_NODE`.
- Установщик собирается скриптом `build\dist.ps1` (electron-builder + NSIS, зеркало ELECTRON_BUILDER_BINARIES_MIRROR). winCodeSign падает на symlink'ах macOS — скрипт распаковывает его вручную в Cache\winCodeSign\winCodeSign-2.6.0.
- Для проверки окна без нажатий клавиш: запуск с `--remote-debugging-port=9223` и CDP-скрипт (Runtime.evaluate, Page.captureScreenshot).
- userData закреплён на %APPDATA%\rmrp-zakon (app.setPath), чтобы смена productName не теряла кэш.

См. [[project-decisions]].
