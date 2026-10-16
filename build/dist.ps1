# Сборка установщика: powershell -ExecutionPolicy Bypass -File build\dist.ps1
# GitHub с этой машины рвёт соединение, поэтому Electron и инструменты сборки качаются с зеркала npmmirror.
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

# winCodeSign содержит символические ссылки для macOS, которые Windows без прав администратора не создаёт.
# Распаковываем сами, пропуская их — для сборки под Windows они не нужны.
$cache = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
if (-not (Test-Path "$cache\winCodeSign-2.6.0\rcedit-x64.exe")) {
  $arc = "$env:TEMP\winCodeSign-2.6.0.7z"
  Invoke-WebRequest "$env:ELECTRON_BUILDER_BINARIES_MIRROR/winCodeSign-2.6.0/winCodeSign-2.6.0.7z" -OutFile $arc -UseBasicParsing
  & "$PSScriptRoot\..\node_modules\7zip-bin\win\x64\7za.exe" x -bd -y $arc "-o$cache\winCodeSign-2.6.0" | Out-Null
}

Set-Location "$PSScriptRoot\.."
# --publish never: выпуск на GitHub создаётся вручную (gh release create … установщик + dist/latest.yml для автообновления)
npx electron-builder --win nsis --publish never
# готовый установщик кладём в корень проекта, чтобы он лежал на виду
if ($?) { Move-Item -Force dist\*-Setup-*.exe . }
