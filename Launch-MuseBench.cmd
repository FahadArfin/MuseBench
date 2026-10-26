@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if exist "release\win-unpacked\MuseBench.exe" (
  start "" "release\win-unpacked\MuseBench.exe"
  exit /b
)
if not exist "node_modules\electron" (
  echo Run npm install and npm run build in this folder first.
  pause
  exit /b 1
)
call npm.cmd start
