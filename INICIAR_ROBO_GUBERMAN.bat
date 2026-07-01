@echo off
setlocal

set "WORKSPACE=C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27"
set "RUNNER=%WORKSPACE%\run_benel_robot_from_vscode.ps1"

if not exist "%RUNNER%" (
  echo Script nao encontrado:
  echo %RUNNER%
  pause
  exit /b 1
)

powershell -ExecutionPolicy Bypass -File "%RUNNER%"

if errorlevel 1 (
  echo.
  echo O robo terminou com erro.
  pause
  exit /b %errorlevel%
)

echo.
echo Robo finalizado com sucesso.
pause
