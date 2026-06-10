@echo off
setlocal
cd /d "%~dp0"
title RL Performance Lab DEV

echo.
echo ======================================================
echo  RL Performance Lab - DEV launcher
echo ======================================================
echo.

if not exist node_modules (
  echo node_modules no existe. Instalando dependencias una sola vez...
  call npm install
  if errorlevel 1 goto :error
)

echo Abriendo RL Performance Lab en modo desarrollo...
echo Cuando edites archivos en VS Code, Vite recargara la UI automaticamente.
echo.
call npm run electron:dev
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo Hubo un error. Deja esta ventana abierta y manda captura.
pause
exit /b 1
