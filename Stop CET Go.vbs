' ============================================================
'  CET Go  -  stop the background local server (silent)
'  ASCII only: WSH reads .vbs as ANSI. Do not add CJK here.
'  Normally not needed: the server quits 150s after the window
'  is closed.
' ============================================================
Option Explicit

Dim http, url, fso, sh
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

url = "http://127.0.0.1:27656/api/quit"

On Error Resume Next
Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
If Err.Number <> 0 Then
  Err.Clear
  Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
End If
If Err.Number = 0 Then
  http.Open "GET", url, False
  http.Send
End If
Err.Clear
On Error GoTo 0
