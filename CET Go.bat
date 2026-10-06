@echo off
rem ================================================================
rem  CET Go - portable launcher (fallback for when .vbs is blocked)
rem
rem  ASCII only: cmd.exe reads .bat as ANSI, CJK text here would garble.
rem
rem  Usage:  "CET Go.bat"             -> port 27656, opens the game window
rem          "CET Go.bat" 27700       -> use another port
rem          set CETGO_NOBROWSER=1    -> start the server only, do not
rem                                      open the Edge window
rem ================================================================
setlocal
title CET Go

set "APPDIR=%~dp0"
for %%I in ("%APPDIR%.") do set "APPDIR=%%~fI"
set "PORT=%~1"
if "%PORT%"=="" set "PORT=27656"
set "BASE=http://127.0.0.1:%PORT%/"
set "NODE="

rem ---------- locate node.exe: bundled copy wins ----------
if exist "%APPDIR%\node.exe" set "NODE=%APPDIR%\node.exe"
if not defined NODE if exist "D:\nodejs\node.exe" set "NODE=D:\nodejs\node.exe"
if not defined NODE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE=%LocalAppData%\Programs\nodejs\node.exe"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
for %%P in (node.exe) do if not defined NODE if exist "%%~$PATH:P" set "NODE=%%~$PATH:P"

if not defined NODE (
  echo.
  echo   CET Go cannot start: node.exe was not found.
  echo.
  echo   Put a copy of node.exe next to this file, or install Node.js
  echo   from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)

rem ---------- already running? ----------
call :probe
if "%READY%"=="200" goto openwindow

rem ---------- start the server in its own minimized window ----------
echo.
echo   CET Go  -  starting on port %PORT% ...
start "CETGo-server" /min "%NODE%" "%APPDIR%\server.js" %PORT%

set "TRIES=0"
:waitloop
rem ping is used as a 1-second sleep: "timeout" aborts when stdin is
rem redirected (e.g. launched by another program), ping never does.
ping -n 2 127.0.0.1 >nul
call :probe
if "%READY%"=="200" goto openwindow
set /a TRIES+=1
if %TRIES% GEQ 45 goto failed
goto waitloop

:failed
echo.
echo   The local server did not answer on port %PORT%.
echo   Try tools\console-start.bat to see the error, or check that
echo   nothing else is using that port.
echo.
pause
exit /b 1

:openwindow
echo   ready  -  %BASE%

if "%CETGO_NOBROWSER%"=="1" (
  echo   CETGO_NOBROWSER=1 : the window was not opened.
  exit /b 0
)

set "EDGE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"

if defined EDGE (
  start "" "%EDGE%" --app=%BASE% --window-size=1120,900 --no-first-run --no-default-browser-check --disable-features=msEdgeSplashScreen --user-data-dir="%APPDIR%\.browser"
) else (
  start "" "%BASE%"
)
exit /b 0


rem ================================================================
rem  probe: READY=200 when the server answers
rem ================================================================
:probe
set "READY="
for /f %%S in ('curl -s -o nul -w "%%{http_code}" "%BASE%api/ping" 2^>nul') do set "READY=%%S"
goto :eof
