@echo off
REM ============================================================
REM  TakenTeach - serve the site on the real domain.
REM
REM  Two processes: the app on localhost:3000, and a Cloudflare
REM  Tunnel that publishes it at app.takenteach.com. The tunnel
REM  makes an OUTBOUND connection to Cloudflare, so nothing is
REM  opened on your router and your home IP is never exposed.
REM
REM  Leave this window open. Closing it takes the site down.
REM  To have it start by itself when you log in, see
REM  docs/RUNNING.md - the same Startup-folder trick as
REM  ascent-hidden.vbs, pointed at this file.
REM
REM  BEFORE THE FIRST RUN, once:
REM    cloudflared tunnel login
REM    cloudflared tunnel create takenteach
REM    cloudflared tunnel route dns takenteach app.takenteach.com
REM ============================================================

cd /d "%~dp0.."

REM Prefer the copy in .tools (what the deploy downloaded) and fall back to a
REM system-wide install, so this works either way without touching PATH.
set "CFD=%~dp0..\.tools\cloudflared.exe"
if not exist "%CFD%" set "CFD=cloudflared"

where "%CFD%" >nul 2>&1
if errorlevel 1 if not exist "%CFD%" (
  echo.
  echo   cloudflared not found.
  echo   See docs/DEPLOYMENT.md section 10 for the one-time setup.
  echo.
  pause
  exit /b 1
)

if not exist ".next\BUILD_ID" (
  echo No production build found. Building first - this takes a minute...
  call npm run build
  if errorlevel 1 (
    echo.
    echo Build failed. Fix the error above, then run this again.
    pause
    exit /b 1
  )
)

echo.
echo   Starting the site...
echo   Local     http://localhost:3000
echo   Public    https://app.takenteach.com
echo.
echo   Close this window to take it down.
echo.

REM The app first, in its own window, so the tunnel's log is the
REM one in front of you - it is the half that tells you whether
REM the public address is actually working.
start "TakenTeach app" /min cmd /c "npm run start"

REM Give Next a moment to bind the port, so the tunnel's first
REM health check does not report a connection refused that has
REM already fixed itself.
timeout /t 5 /nobreak >nul

"%CFD%" tunnel run --url http://localhost:3000 takenteach

echo.
echo   The tunnel stopped. The app may still be running in its own
echo   window - close that too, or run scripts\stop.bat.
pause
