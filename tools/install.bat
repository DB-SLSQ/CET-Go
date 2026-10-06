@echo off
rem ============================================================
rem  CET Go setup - runs inside CETGo-Setup.exe (IExpress).
rem  ASCII ONLY: cmd reads .bat as ANSI, UTF-8 bytes would garble.
rem  %~dp0 = the temp folder IExpress extracted the package into.
rem ============================================================
setlocal
title CET Go Setup

set "SRC=%~dp0"
set "DST=%LOCALAPPDATA%\CETGo"
set "WS=%WINDIR%\System32\wscript.exe"
set "CS=%WINDIR%\System32\cscript.exe"
set "SM=%APPDATA%\Microsoft\Windows\Start Menu\Programs\CET Go"

echo.
echo   CET Go  --^>  %DST%
echo.

rem ---------- 1. unpack ----------
rem Test by "is the file there", not by errorlevel: the tar first on PATH may be
rem the GNU tar from Git Bash, which cannot read zip at all. Then fall back to PS.
if not exist "%DST%" mkdir "%DST%"
tar -xf "%SRC%payload.zip" -C "%LOCALAPPDATA%" >nul 2>&1
if not exist "%DST%\CET Go.vbs" (
  powershell -NoProfile -Command "Expand-Archive -LiteralPath '%SRC%payload.zip' -DestinationPath '%LOCALAPPDATA%' -Force" >nul 2>&1
)

if not exist "%DST%\CET Go.vbs" goto :FAIL

rem ---------- 2. shortcuts (start menu always, desktop only if free) ----------
if not exist "%SM%" mkdir "%SM%"
"%CS%" //nologo "%SRC%mklnk.vbs" "%SM%\CET Go.lnk" "%WS%" "%DST%\CET Go.vbs" "%DST%" "%DST%\app.ico" "CET Go"
"%CS%" //nologo "%SRC%mklnk.vbs" "%SM%\Uninstall.lnk" "%WS%" "%DST%\uninstall.vbs" "%DST%" "%DST%\app.ico" "Uninstall CET Go"
if not exist "%USERPROFILE%\Desktop\CET Go.lnk" (
  "%CS%" //nologo "%SRC%mklnk.vbs" "%USERPROFILE%\Desktop\CET Go.lnk" "%WS%" "%DST%\CET Go.vbs" "%DST%" "%DST%\app.ico" "CET Go"
)

rem ---------- 3. "Apps and features" entry (HKCU, no admin, best effort) ----------
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\CETGo" /v DisplayName /t REG_SZ /d "CET Go" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\CETGo" /v DisplayVersion /t REG_SZ /d "1.1" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\CETGo" /v InstallLocation /t REG_SZ /d "%DST%" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\CETGo" /v DisplayIcon /t REG_SZ /d "%DST%\app.ico,0" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\CETGo" /v UninstallString /t REG_SZ /d "%WS% \"%DST%\uninstall.vbs\"" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\CETGo" /v URLInfoAbout /t REG_SZ /d "https://space.bilibili.com/484110391" /f >nul 2>&1

rem ---------- 4. launch ----------
echo   Starting CET Go ...
start "" "%WS%" "%DST%\CET Go.vbs"
endlocal
exit /b 0

:FAIL
echo.
echo   Setup failed: could not unpack the payload.
echo   Try again, or just unzip CETGo-PC.zip and run "CET Go.vbs" instead.
echo.
pause
endlocal
exit /b 1
