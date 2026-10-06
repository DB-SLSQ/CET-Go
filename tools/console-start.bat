@echo off
rem ================================================================
rem  CET Go  -  CONSOLE start  (troubleshooting only)
rem  Normally use "CET Go.vbs" in the app folder instead - the .vbs
rem  opens no console window at all. This .bat keeps the console on
rem  screen so you can read the errors.
rem  ASCII only: do not add CJK text to this file.
rem ================================================================
setlocal
title CET Go (console debug)

set "APPDIR=%~dp0.."
for %%I in ("%APPDIR%") do set "APPDIR=%%~fI"
set "PORT=27656"
set "URL=http://127.0.0.1:%PORT%/"

set "PF=%ProgramFiles%"
set "PF86=%ProgramFiles(x86)%"
set "LAD=%LocalAppData%"

echo.
echo   CET Go  -  console debug start
echo   appdir = %APPDIR%
echo.

rem ---------- locate node.exe ----------
set "NODE="
for %%P in (node.exe) do if not defined NODE if exist "%%~$PATH:P" set "NODE=%%~$PATH:P"
if not defined NODE if exist "D:\nodejs\node.exe" set "NODE=D:\nodejs\node.exe"
if not defined NODE if exist "%LAD%\Programs\nodejs\node.exe" set "NODE=%LAD%\Programs\nodejs\node.exe"
if not defined NODE if exist "%UserProfile%\.workbuddy\binaries\node\versions\22.22.2-6\node.exe" set "NODE=%UserProfile%\.workbuddy\binaries\node\versions\22.22.2-6\node.exe"
if not defined NODE if exist "%PF%\nodejs\node.exe" set "NODE=%PF%\nodejs\node.exe"

if not defined NODE (
  echo   [X] Node.js not found.  Install it or copy node.exe to D:\nodejs\
  echo.
  pause
  exit /b 1
)
echo   node    = %NODE%

rem ---------- locate Microsoft Edge ----------
set "EDGE="
if exist "%PF86%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%PF86%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "%PF%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%PF%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "%LAD%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%LAD%\Microsoft\Edge\Application\msedge.exe"
echo   edge    = %EDGE%

rem ---------- already running? ----------
set "RUNNING="
set "READY="
netstat -ano | findstr /c:"127.0.0.1:%PORT%" | findstr /c:"LISTENING" >nul 2>nul
if not errorlevel 1 (
  set "RUNNING=1"
  set "READY=1"
  echo   server  = already running on %PORT%
)

rem ---------- start the server (minimized) ----------
if not defined RUNNING (
  echo   server  = starting on %PORT% ...
  start "CETGo-server" /min "%NODE%" "%APPDIR%\server.js" %PORT%
  for /l %%i in (1,1,30) do (
    if not defined READY (
      netstat -ano | findstr /c:"127.0.0.1:%PORT%" | findstr /c:"LISTENING" >nul 2>nul
      if not errorlevel 1 set "READY=1"
      if not defined READY ping -n 2 127.0.0.1 >nul
    )
  )
  if defined READY (echo   server  = ready) else (echo   server  = NOT ready - check the minimized window)
)

rem ---------- open the app window ----------
if defined EDGE (
  start "" "%EDGE%" --app=%URL% --window-size=1120,900 --no-first-run --no-default-browser-check --disable-features=msEdgeSplashScreen --user-data-dir="%APPDIR%\.browser"
) else (
  start "" "%URL%"
)

echo.
echo   window opened.  this console can be closed now.
timeout /t 5 >nul
exit /b 0
