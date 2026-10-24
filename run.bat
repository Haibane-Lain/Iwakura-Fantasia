@echo off
setlocal
cd /d "%~dp0"

if /i "%~1"=="--dev" goto dev
if /i "%~1"=="dev" goto dev

set "PACKAGED=apps\desktop\release\win-unpacked\Iwakura Fantasia.exe"
if exist "%PACKAGED%" (
  start "" "%PACKAGED%"
  exit /b 0
)

if not exist "node_modules" (
  echo Dependencies are not installed.
  echo Run: pnpm install
  pause
  exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
  echo pnpm was not found on PATH.
  echo Install Node 24+ and pnpm, then run: pnpm install
  pause
  exit /b 1
)

echo Packaged build not found. Building from source...
call pnpm --filter @iwakura/desktop build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

if not exist "apps\desktop\out\main\index.js" (
  echo Build output is missing.
  pause
  exit /b 1
)

pushd "apps\desktop"
start "" "node_modules\electron\dist\electron.exe" "."
popd
exit /b 0

:dev
if not exist "node_modules" (
  echo Dependencies are not installed.
  echo Run: pnpm install
  pause
  exit /b 1
)
where pnpm >nul 2>&1
if errorlevel 1 (
  echo pnpm was not found on PATH.
  pause
  exit /b 1
)
call pnpm dev
exit /b %errorlevel%
