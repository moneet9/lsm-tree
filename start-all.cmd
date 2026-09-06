@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
set "ENGINE=%ROOT%lsm engine"
set "FRONTEND=%ROOT%frontend"
set "URL=http://127.0.0.1:5173/"

echo Starting LSM Tree Lab...
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install Node.js 18+ and run this script again.
  pause
  exit /b 1
)

if not exist "%ENGINE%\run-backend.cmd" (
  echo [ERROR] Backend launcher was not found: "%ENGINE%\run-backend.cmd"
  pause
  exit /b 1
)

if not exist "%FRONTEND%\package.json" (
  echo [ERROR] Frontend package was not found: "%FRONTEND%\package.json"
  pause
  exit /b 1
)

echo [1/2] Starting local-file C++20 LSM backend...
start "LSM Backend" /D "%ENGINE%" cmd /k "call run-backend.cmd"

echo [2/2] Starting the React frontend...
start "LSM Frontend" /D "%FRONTEND%" cmd /k "npm run dev -- --host 127.0.0.1"

echo.
echo Waiting for Vite, then opening %URL%
timeout /t 5 /nobreak >nul
start "" "%URL%"
echo.
echo LSM Tree Lab is starting in separate windows.
echo Close those windows to stop the backend and frontend.
endlocal
