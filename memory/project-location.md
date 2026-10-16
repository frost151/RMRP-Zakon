---
name: project-location
description: Проект RMRP-Zakon сейчас живёт в C:\Users\SommuS\Desktop\RMRP-Zakon-main (с 16.10.2026); раньше был Desktop\RMRP-Zakon
metadata:
  type: project
---

Рабочая папка проекта: `C:\Users\SommuS\Desktop\RMRP-Zakon-main`. Сначала проект был в `C:\Users\SommuS\RMRP-Zakon`, потом в `Desktop\RMRP-Zakon`; на текущей машине этих папок нет. Здесь 16.10.2026 заново поставлены Node.js 24 LTS (winget) и `npm install` с зеркалом npmmirror — запуск работает.

**Why:** пользователь продолжает работу из свежей копии репозитория.
**How to apply:** правки, сборки (build\dist.ps1) и запуск — из этой папки; если папки нет, проверить фактическое расположение. См. [[project-goal]], [[electron-env-quirks]].
