' ============================================================
'  CET Go  -  launcher   (NO console window at all)
'
'  IMPORTANT: WSH reads .vbs as ANSI, so this file must stay
'  7-bit ASCII. Do not put CJK text in here.
'
'  Double-click this file (or the desktop "CET Go" shortcut):
'    1. locate node.exe
'    2. if the port is idle, start server.js with a HIDDEN window
'    3. wait until /api/ping answers 200
'    4. open the Edge app window
'
'  Pass /lan to also serve the same Wi-Fi (the "CET Go phone" shortcut does this):
'  the title screen then grows a "phone" button with a QR code.
'
'  Debug:  wscript "CET Go.vbs" /log   -> writes launcher.log
' ============================================================
Option Explicit

Dim fso, sh
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

Dim appDir, port, base, node, edge
Dim pf, pf86, lad, up
Dim i, ready, cmd, arg
Dim gLog, gLogFile, gLan

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
port   = "27656"
base   = "http://127.0.0.1:" & port & "/"

pf   = sh.ExpandEnvironmentStrings("%ProgramFiles%")
pf86 = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%")
lad  = sh.ExpandEnvironmentStrings("%LocalAppData%")
up   = sh.ExpandEnvironmentStrings("%UserProfile%")

gLog = False
gLan = False
For Each arg In WScript.Arguments
  If LCase(CStr(arg)) = "/log" Then gLog = True
  If LCase(CStr(arg)) = "/lan" Then gLan = True
Next
gLogFile = fso.BuildPath(appDir, "launcher.log")

LogMsg "=== CET Go launcher  " & Now & " ==="
LogMsg "appDir = " & appDir

' ---------- locate node.exe ----------
' A node.exe sitting next to this script wins over anything installed.
' That is what the portable build ships, so the folder runs on a machine
' that has no Node.js at all.
node = ""
If fso.FileExists(fso.BuildPath(appDir, "node.exe")) Then node = fso.BuildPath(appDir, "node.exe")
If node = "" Then
  If fso.FileExists("D:\nodejs\node.exe") Then node = "D:\nodejs\node.exe"
End If
If node = "" Then
  If fso.FileExists(fso.BuildPath(lad, "Programs\nodejs\node.exe")) Then node = fso.BuildPath(lad, "Programs\nodejs\node.exe")
End If
If node = "" Then
  If fso.FileExists(fso.BuildPath(up, ".workbuddy\binaries\node\versions\22.22.2-6\node.exe")) Then node = fso.BuildPath(up, ".workbuddy\binaries\node\versions\22.22.2-6\node.exe")
End If
If node = "" Then
  If fso.FileExists(fso.BuildPath(pf, "nodejs\node.exe")) Then node = fso.BuildPath(pf, "nodejs\node.exe")
End If

If node = "" Then
  FailLog "node.exe not found"
  MsgBox "CET Go cannot start." & vbCrLf & vbCrLf & _
         "Node.js was not found." & vbCrLf & _
         "Install it from https://nodejs.org," & vbCrLf & _
         "or drop a copy of node.exe next to this script.", 16, "CET Go"
  WScript.Quit 1
End If
LogMsg "node = " & node

' ---------- locate Microsoft Edge ----------
edge = ""
If fso.FileExists(fso.BuildPath(pf86, "Microsoft\Edge\Application\msedge.exe")) Then edge = fso.BuildPath(pf86, "Microsoft\Edge\Application\msedge.exe")
If edge = "" Then
  If fso.FileExists(fso.BuildPath(pf, "Microsoft\Edge\Application\msedge.exe")) Then edge = fso.BuildPath(pf, "Microsoft\Edge\Application\msedge.exe")
End If
If edge = "" Then
  If fso.FileExists(fso.BuildPath(lad, "Microsoft\Edge\Application\msedge.exe")) Then edge = fso.BuildPath(lad, "Microsoft\Edge\Application\msedge.exe")
End If
LogMsg "edge = " & edge

' ---------- start the server if it is not up ----------
ready = Ping(base & "api/ping")
LogMsg "server already up = " & ready

If Not ready Then
  If Not fso.FileExists(fso.BuildPath(appDir, "server.js")) Then
    FailLog "server.js missing in " & appDir
    MsgBox "CET Go cannot start: server.js is missing." & vbCrLf & appDir, 16, "CET Go"
    WScript.Quit 1
  End If

  sh.CurrentDirectory = appDir
  cmd = """" & node & """ """ & fso.BuildPath(appDir, "server.js") & """ " & port
  ' /lan binds the server to 0.0.0.0 so phones on the same Wi-Fi can reach it.
  ' The title screen then grows a "phone" button holding the download QR code.
  If gLan Then cmd = cmd & " --lan"
  LogMsg "run hidden: " & cmd

  On Error Resume Next
  sh.Run cmd, 0, False          ' 0 = hidden window, False = do not wait
  If Err.Number <> 0 Then
    FailLog "Run failed: " & Err.Description
    MsgBox "CET Go cannot start the local server:" & vbCrLf & Err.Description, 16, "CET Go"
    WScript.Quit 1
  End If
  On Error GoTo 0

  For i = 1 To 80
    If Ping(base & "api/ping") Then
      ready = True
      Exit For
    End If
    WScript.Sleep 200
  Next
  LogMsg "server ready = " & ready

  If Not ready Then
    FailLog "server did not answer on port " & port
    MsgBox "CET Go: the local server did not come up on port " & port & "." & vbCrLf & vbCrLf & _
           "See the file next to this script:" & vbCrLf & _
           "launcher-error.log", 48, "CET Go"
    WScript.Quit 1
  End If
End If

' ---------- open the app window ----------
If edge <> "" Then
  cmd = """" & edge & """ --app=" & base & _
        " --window-size=1120,900 --no-first-run --no-default-browser-check" & _
        " --disable-features=msEdgeSplashScreen" & _
        " --user-data-dir=""" & fso.BuildPath(appDir, ".browser") & """"
Else
  cmd = base
End If
LogMsg "open window: " & cmd

On Error Resume Next
sh.Run cmd, 1, False
If Err.Number <> 0 Then
  FailLog "open window failed: " & Err.Description
  sh.Run base, 1, False
End If
On Error GoTo 0

LogMsg "done"
WScript.Quit 0


' ============================================================
'  readiness probe: HTTP GET, True when the server answers 200
' ============================================================
Function Ping(u)
  Dim http
  Ping = False
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  If Err.Number <> 0 Then
    Err.Clear
    Set http = CreateObject("MSXML2.ServerXMLHTTP.3.0")
  End If
  If Err.Number <> 0 Then
    Err.Clear
    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
  End If
  If Err.Number = 0 Then
    http.Open "GET", u, False
    http.Send
    If Err.Number = 0 Then
      If http.Status = 200 Then Ping = True
    End If
  End If
  Err.Clear
  On Error GoTo 0
End Function


' ============================================================
'  optional trace log (only with /log)
' ============================================================
Sub LogMsg(s)
  If Not gLog Then Exit Sub
  On Error Resume Next
  Dim f
  Set f = fso.OpenTextFile(gLogFile, 8, True)
  f.WriteLine s
  f.Close
  On Error GoTo 0
End Sub


' ============================================================
'  always record failures (no /log needed)
' ============================================================
Sub FailLog(s)
  LogMsg "FAIL: " & s
  On Error Resume Next
  Dim f
  Set f = fso.OpenTextFile(fso.BuildPath(appDir, "launcher-error.log"), 8, True)
  f.WriteLine Now & "   " & s
  f.Close
  On Error GoTo 0
End Sub
