' ============================================================
'  mklnk.vbs - create one .lnk shortcut (used by the installer only)
'  ASCII ONLY: WSH reads .vbs as ANSI, UTF-8 bytes would break it.
'
'  usage:
'    wscript mklnk.vbs <lnkPath> <targetExe> <argFile> <workDir> <iconFile> <desc>
' ============================================================
Option Explicit

Dim sh, lnk
Set sh = CreateObject("WScript.Shell")

If WScript.Arguments.Count < 6 Then
  WScript.Echo "usage: mklnk.vbs <lnkPath> <targetExe> <argFile> <workDir> <iconFile> <desc>"
  WScript.Quit 1
End If

Set lnk = sh.CreateShortcut(WScript.Arguments(0))
lnk.TargetPath = WScript.Arguments(1)
lnk.Arguments = """" & WScript.Arguments(2) & """"
lnk.WorkingDirectory = WScript.Arguments(3)
lnk.IconLocation = WScript.Arguments(4) & ",0"
lnk.Description = WScript.Arguments(5)
lnk.WindowStyle = 1
lnk.Save

WScript.Quit 0
