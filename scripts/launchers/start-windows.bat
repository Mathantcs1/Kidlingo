@echo off
rem ClipForge launcher (Windows). Starts a tiny local web server for the app folder and opens it in your browser.
rem Set CLIPFORGE_NO_OPEN=1 to skip opening the browser; set CLIPFORGE_PORT to use another port (default 8123).
setlocal
cd /d "%~dp0"
set "PORT=%CLIPFORGE_PORT%"
if "%PORT%"=="" set "PORT=8123"
set "URL=http://localhost:%PORT%"

python3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)" >nul 2>nul
if not errorlevel 1 goto use_python3
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)" >nul 2>nul
if not errorlevel 1 goto use_python
where npx >nul 2>nul
if not errorlevel 1 goto use_npx

echo Install Python 3 (python.org) or Node.js (nodejs.org), then run this again
if not "%CLIPFORGE_NO_OPEN%"=="1" pause
exit /b 1

:use_python3
call :announce
python3 -m http.server %PORT% --directory app
goto :eof

:use_python
call :announce
python -m http.server %PORT% --directory app
goto :eof

:use_npx
call :announce
call npx --yes serve app -l %PORT%
goto :eof

:announce
echo ClipForge is running at %URL% (stop it by closing this window).
if "%CLIPFORGE_NO_OPEN%"=="1" goto :eof
start "" cmd /c "ping -n 3 127.0.0.1 >nul & start %URL%"
goto :eof
