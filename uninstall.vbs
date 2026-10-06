' ============================================================
'  CET Go - uninstaller
'  ASCII ONLY: WSH reads .vbs as ANSI, UTF-8 bytes would break it.
'  This file lives in the installed folder (%LOCALAPPDATA%\CETGo).
' ============================================================
Option Explicit

Dim sh, fso, appDir, desktop, smDir, ans

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appDir = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\CETGo"
desktop = sh.SpecialFolders("Desktop")
smDir = sh.ExpandEnvironmentStrings("%APPDATA%") & "\Microsoft\Windows\Start Menu\Programs\CET Go"

ans = MsgBox("Uninstall CET Go?" & vbCrLf & vbCrLf & _
             "This removes:" & vbCrLf & appDir & vbCrLf & vbCrLf & _
             "Your score, best record and wrong-word book are stored in that folder" & vbCrLf & _
             "and will be deleted too.", vbYesNo + vbQuestion, "CET Go")
If ans <> vbYes Then WScript.Quit

On Error Resume Next

' 1. remove the "Apps & features" entry (best effort, HKCU only)
sh.RegDelete "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\CETGo\"

' 2. remove shortcuts
If fso.FileExists(desktop & "\CET Go.lnk") Then fso.DeleteFile desktop & "\CET Go.lnk", True
If fso.FolderExists(smDir) Then fso.DeleteFolder smDir, True

' 3. remove the program folder.
'    This script itself lives inside it, so it cannot delete itself while running -
'    hand the job to a detached cmd that waits a moment, then removes the folder.
sh.Run "cmd /c ping -n 3 127.0.0.1 >nul & rmdir /s /q """ & appDir & """", 0, False

WScript.Echo "CET Go has been uninstalled."
