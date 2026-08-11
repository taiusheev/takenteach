' ============================================================
'  Ascent Academy - start silently in the background.
'
'  Put a shortcut to THIS file in your Startup folder and the
'  site is simply always there at http://localhost:3000 after
'  you log in, with no console window in the way.
'
'  To open the Startup folder: press Win+R, type  shell:startup
'
'  To stop it: Task Manager > Details > end the "node.exe"
'  process (or just reboot).
' ============================================================

Dim shell, here
Set shell = CreateObject("WScript.Shell")
here = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))

' 0 = hidden window, False = don't wait for it to finish
shell.Run "cmd /c """ & here & "ascent.bat""", 0, False
