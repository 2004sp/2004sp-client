@echo off
setlocal

for %%I in ("%~dp0..") do set "ROOT=%%~fI"
cd /d "%ROOT%"

echo [JS] Building client.js from %ROOT%...
bun run build

if %ERRORLEVEL% neq 0 (
    echo [FAILED] bun build exited with code %ERRORLEVEL%
    pause
    exit /b 1
)

echo [OK] client.js built successfully
pause
