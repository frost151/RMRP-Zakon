---
name: github-repo
description: Проект залит в приватный GitHub-репозиторий frost151/RMRP-Zakon; установщик — в Releases
metadata:
  node_type: memory
  type: reference
  originSessionId: 998c3aa5-da20-45d6-a479-f3a556e21d14
  modified: 2026-10-16T13:27:41.081Z
---

- Репозиторий: https://github.com/frost151/RMRP-Zakon (PRIVATE), ветка main. Аккаунт GitHub пользователя — frost151.
- Git и GitHub CLI поставлены через winget 16.10.2026; gh залогинен. В новой оболочке PATH может не обновиться: `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`.
- .gitignore исключает node_modules, dist, *.exe — установщик НЕ коммитить, а выкладывать в Releases: `gh release create vX.Y.Z RMRP-Zakon-Setup-X.Y.Z.exe` (v0.1.0 уже выложен).
- В репозитории папка `memory/` — копия этой памяти, а CLAUDE.md велит её читать: пользователь продолжает работу с других компьютеров. При изменении памяти копировать файлы в `memory/` проекта и пушить.
- Локальный git user.name frost151, email a.somok15@gmail.com.

См. [[project-decisions]], [[electron-env-quirks]].
