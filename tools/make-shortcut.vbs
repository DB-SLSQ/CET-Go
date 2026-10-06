' ============================================================
'  Create / refresh the desktop shortcut for CET Go.
'  Target = wscript.exe "CET Go.vbs"  -> no console window.
'  Can be run by hand:  wscript tools\make-shortcut.vbs
' ============================================================
Option Explicit

Dim fso, ws, lnk, appDir, desk, name, lnkPath, launcher
Set fso = CreateObject("Scripting.FileSystemObject")
Set ws = CreateObject("WScript.Shell")

name = "CET Go"

appDir  = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
launcher = fso.BuildPath(appDir, "CET Go.vbs")

If Not fso.FileExists(launcher) Then
  WScript.Echo "FAILED launcher missing: " & launcher
  WScript.Quit 1
End If

desk = ws.SpecialFolders("Desktop")
lnkPath = fso.BuildPath(desk, name & ".lnk")

On Error Resume Next
Set lnk = ws.CreateShortcut(lnkPath)
lnk.TargetPath = ws.ExpandEnvironmentStrings("%WinDir%") & "\System32\wscript.exe"
lnk.Arguments = """" & launcher & """"
lnk.WorkingDirectory = appDir
lnk.IconLocation = fso.BuildPath(appDir, "app.ico") & ",0"
lnk.Description = name
lnk.WindowStyle = 1
lnk.Save
If Err.Number <> 0 Then
  WScript.Echo "FAILED " & Err.Description
  WScript.Quit 1
End If
On Error Goto 0

If fso.FileExists(lnkPath) Then
  ' only drop the marker when the .lnk really exists
  On Error Resume Next
  Dim mf
  Set mf = fso.CreateTextFile(fso.BuildPath(appDir, ".shortcut-made"), True)
  mf.Write "ok"
  mf.Close
  On Error Goto 0
  WScript.Echo "OK " & lnkPath
Else
  WScript.Echo "FAILED (file not created)"
  WScript.Quit 1
End If
