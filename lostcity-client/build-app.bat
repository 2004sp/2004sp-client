@echo off
setlocal

set "APP_DIR=%~dp0"
for %%I in ("%APP_DIR%..") do set "ROOT=%%~fI"

echo [1/4] Building client.js from %ROOT%...
cd /d "%ROOT%"
bun run build
if %ERRORLEVEL% neq 0 (
    echo [FAILED] bun build exited with code %ERRORLEVEL%
    pause
    exit /b 1
)

echo [2/4] Copying files to frontend...
copy /Y "out\client.js" "lostcity-client\frontend\public\client.js" >nul
copy /Y "out\tinymidipcm.wasm" "lostcity-client\frontend\public\tinymidipcm.wasm" >nul
copy /Y "out\client.js" "lostcity-client\frontend\dist\client.js" >nul
copy /Y "out\tinymidipcm.wasm" "lostcity-client\frontend\dist\tinymidipcm.wasm" >nul
if %ERRORLEVEL% neq 0 (
    echo [FAILED] copying frontend files
    pause
    exit /b 1
)
echo [OK] Files copied

cd /d "%APP_DIR%"

echo [3/4] Embedding Windows icon into resource.syso...
if exist resource.syso del resource.syso
where goversioninfo >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo     goversioninfo not found, installing...
    go install github.com/josephspurrier/goversioninfo/cmd/goversioninfo@latest
)
goversioninfo -64 -o resource.syso
if %ERRORLEVEL% neq 0 (
    echo [WARN] goversioninfo failed, exe will have no icon
)

echo [4/4] Building Wails app...
go build -o lostcity.exe
if %ERRORLEVEL% neq 0 (
    echo [FAILED] go build exited with code %ERRORLEVEL%
    pause
    exit /b 1
)

echo [OK] lostcity.exe built from the current checkout
echo.
echo Run: lostcity-client\lostcity.exe
pause
