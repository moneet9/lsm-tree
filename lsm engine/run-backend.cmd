@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-and-run-cpp20.ps1"
if errorlevel 1 pause
endlocal
