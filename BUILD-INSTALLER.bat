@echo off
setlocal
cd /d "%~dp0"
title RL Performance Lab - Build Installer

echo.
echo ======================================================
echo  RL Performance Lab - Build Windows Installer
 echo ======================================================
echo.

if not exist node_modules (
  echo node_modules no existe. Instalando dependencias...
  call npm install
  if errorlevel 1 goto :error
)

echo Generando instalador .exe en la carpeta release...
call npm run electron:build
if errorlevel 1 goto :error

echo.
echo Listo. Revisa la carpeta release\
start "" "%~dp0release"
pause
exit /b 0

:error
echo.
echo Fallo la compilacion del instalador. Manda captura de esta ventana.
pause
exit /b 1
