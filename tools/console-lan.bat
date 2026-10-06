@echo off
rem ================================================================
rem  CET Go  -  LAN start  (let other PCs download the green package)
rem
rem  Starts the local server bound to 0.0.0.0 so any device on the
rem  same Wi-Fi can reach it (game page + /pc package download).
rem  It also stops a server that is already running on 127.0.0.1
rem  only, because 0.0.0.0 cannot share the port.
rem
rem  ASCII only: do not add CJK text to this file.
rem ================================================================
setlocal enabledelayedexpansion
title CET Go - LAN server

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
echo   CET Go  -  LAN server
echo   ------------------------------------------------------------
echo   Devices on the SAME Wi-Fi can open the game at:
echo.
for /f "tokens=1,2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set "IP=%%b"
  set "IP=!IP: =!"
  if not "!IP!"=="127.0.0.1" echo       http://!IP!:%PORT%/
)
echo.
echo   Other PCs can also download the green package at:
echo       http://!IP!:%PORT%/pc
echo   ------------------------------------------------------------
echo   The console window that just opened is the server.
echo   Close it (or run tools\console-stop.bat) when you are done.
echo.

start "CETGo-LAN-server" "%NODE%" "%APPDIR%\server.js" %PORT% --lan

echo   server is starting...
timeout /t 6 >nul
exit /b 0
