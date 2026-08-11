@echo off
REM ============================================================
REM  Ascent Academy - start the site
REM
REM  Runs the PRODUCTION build (fast: ready in well under a
REM  second, versus dev mode which recompiles each page the
REM  first time you open it).
REM
REM  Leave this window open while you use the site. Closing it
REM  stops the server. To have it start by itself when you log
REM  in, see docs/RUNNING.md.
REM ============================================================

cd /d "%~dp0.."

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
echo   Ascent Academy is starting...
echo   Open  http://localhost:3000  in your browser.
echo   Close this window to stop the site.
echo.

call npm run start
pause
