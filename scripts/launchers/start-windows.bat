@echo off
rem ClipForge launcher (Windows). Starts a tiny local web server (serve.py or serve.mjs) and opens it in your browser.
rem Set CLIPFORGE_NO_OPEN=1 to skip opening the browser; set CLIPFORGE_PORT to use another port (default 8123).
setlocal
cd /d "%~dp0"
set "PORT=%CLIPFORGE_PORT%"
if "%PORT%"=="" set "PORT=8123"
set "URL=http://localhost:%PORT%"
set "CLIPFORGE_PORT=%PORT%"
if "%~1"=="--open-when-up" goto open_when_up

python3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)" >nul 2>nul
if not errorlevel 1 goto use_python3
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)" >nul 2>nul
if not errorlevel 1 goto use_python
py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)" >nul 2>nul
if not errorlevel 1 goto use_py
where node >nul 2>nul
if not errorlevel 1 goto use_node

echo Install Python 3 (python.org) or Node.js (nodejs.org), then run this again
if not "%CLIPFORGE_NO_OPEN%"=="1" pause
exit /b 1

:use_python3
set "RUNNER=python3 serve.py"
goto run_server

:use_python
set "RUNNER=python serve.py"
goto run_server

:use_py
set "RUNNER=py -3 serve.py"
goto run_server

:use_node
set "RUNNER=node serve.mjs"
goto run_server

:run_server
rem The browser is opened by a helper only once the server answers (never if the server fails to start).
if not "%CLIPFORGE_NO_OPEN%"=="1" start "" /b cmd /c call "%~f0" --open-when-up
%RUNNER%
if errorlevel 1 (
  echo ClipForge could not start. Is another program using port %PORT%? Close it, or set CLIPFORGE_PORT to another number and run again.
  if not "%CLIPFORGE_NO_OPEN%"=="1" pause
  exit /b 1
)
goto :eof

:open_when_up
set "CHECK=%RUNNER% --check"
for /l %%i in (1,1,25) do (
  %CHECK% >nul 2>nul && (start "" "%URL%" & exit /b 0)
  ping -n 2 127.0.0.1 >nul
)
exit /b 1
