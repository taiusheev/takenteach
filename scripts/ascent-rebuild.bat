@echo off
REM ============================================================
REM  Ascent Academy - rebuild, then start
REM
REM  Run this after the code changes. A production build has to
REM  be regenerated to pick up edits; the normal start script
REM  deliberately does NOT rebuild every time, because that
REM  would add a minute to every launch.
REM ============================================================

cd /d "%~dp0.."

echo Rebuilding Ascent...
call npm run build
if errorlevel 1 (
  echo.
  echo Build failed. Nothing was changed - the previous build is still in place.
  pause
  exit /b 1
)

echo.
echo Build complete. Starting...
echo Open  http://localhost:3000
echo.
call npm run start
pause
