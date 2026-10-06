@echo off
rem ================================================================
rem  CET Go  -  LAN start  (open the game on your phone)
rem
rem  Starts the local server bound to 0.0.0.0 so any device on the
rem  same Wi-Fi can open it. It also stops a server that is already
rem  running on 127.0.0.1 only, because 0.0.0.0 cannot share the port.
rem
rem  ASCII only: do not add CJK text to this file.
rem ================================================================
setlocal enabledelayedexpansion
title CET Go - LAN (phone access)

set "APPDIR=%~dp0.."
for %%I in ("%APPDIR%") do set "APPDIR=%%~fI"
set "PORT=27656"

set "PF=%ProgramFiles%"
set "PF86=%ProgramFiles(x86)%"
set "LAD=%LocalAppData%"

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

rem ---------- stop a local-only server first ----------
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /c:"LISTENING" ^| findstr /c:":%PORT%"') do (
  taskkill /f /pid %%p >nul 2>nul
)
ping -n 2 127.0.0.1 >nul

rem ---------- show the LAN addresses ----------
echo.
echo   CET Go  -  open it on your phone
echo   ------------------------------------------------------------
echo   Make sure the phone is on the SAME Wi-Fi as this PC,
echo   then type one of these addresses into the phone browser:
echo.
for /f "tokens=1,2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set "IP=%%b"
  set "IP=!IP: =!"
  if not "!IP!"=="127.0.0.1" echo       http://!IP!:%PORT%/
)
echo.
echo   On the phone you can also tap "Add to Home Screen" to get
echo   an icon that opens full screen, just like an app.
echo   ------------------------------------------------------------
echo   The console window that just opened is the server.
echo   Close it (or run tools\console-stop.bat) when you are done.
echo.

start "CETGo-LAN-server" "%NODE%" "%APPDIR%\server.js" %PORT% --lan

echo   server is starting...
timeout /t 6 >nul
exit /b 0
