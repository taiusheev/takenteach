@echo off
REM ============================================================
REM  TakenTeach - stop the site.
REM
REM  live.bat starts two processes and closing its window only
REM  stops the tunnel, leaving the app running invisibly. That is
REM  the state where "it is down" and "it is up" look identical
REM  from a browser on this machine, which is a confusing hour to
REM  spend. This stops both.
REM ============================================================

echo Stopping the tunnel...
taskkill /IM cloudflared.exe /F >nul 2>&1
if errorlevel 1 (echo   not running) else (echo   stopped)

echo Stopping the app...
REM Only the node process serving port 3000 - not every node on
REM the machine, which would take down an editor or a build too.
set "found="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"TCP.*:3000 .*LISTENING"') do (
  taskkill /PID %%p /F >nul 2>&1
  set "found=1"
)
if defined found (echo   stopped) else (echo   nothing listening on 3000)

echo.
echo Done. https://app.takenteach.com will now show Cloudflare's error page.
