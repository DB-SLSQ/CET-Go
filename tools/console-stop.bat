@echo off
rem ================================================================
rem  CET Go  -  CONSOLE stop  (troubleshooting only)
rem  Normally use "Stop CET Go.vbs" in the app folder (silent).
rem  ASCII only: do not add CJK text to this file.
rem ================================================================
setlocal
set "PORT=27656"
set "FOUND="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /c:"127.0.0.1:%PORT%" ^| findstr /c:"LISTENING"') do (
  taskkill /f /pid %%p >nul 2>nul
  set "FOUND=1"
)
if defined FOUND (
  echo Server stopped.
) else (
  echo Server is not running.
)
ping -n 3 127.0.0.1 >nul
exit /b 0
