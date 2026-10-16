# РМРП Закон

Перед работой прочитай память проекта в папке `memory/`: начни с `memory/MEMORY.md`, затем все файлы, на которые он ссылается. Там цель проекта, принятые решения, стиль работы с пользователем и особенности сборки.

- Пути вида `C:\Users\SommuS\...` и особенности окружения в `memory/electron-env-quirks.md` относятся к первому компьютеру. На другой машине сверь их с фактическим окружением.
- Когда сохраняешь в свою память новые решения, обновляй и копию в `memory/` (это общая память для всех компьютеров) и заливай изменения на GitHub.

## Как запустить на новом компьютере

1. Установить Node.js, Git и GitHub CLI: `winget install OpenJS.NodeJS.LTS Git.Git GitHub.cli`
2. Войти в GitHub: `gh auth login`, затем `gh repo clone frost151/RMRP-Zakon`
3. В папке проекта: `npm install`. Если Electron не скачивается, см. `memory/electron-env-quirks.md` (зеркало npmmirror).
4. Запуск: `npm start`. Установщик собирается через `powershell -ExecutionPolicy Bypass -File build\dist.ps1`.
