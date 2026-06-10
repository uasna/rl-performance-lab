@echo off
cd /d "%~dp0.."
echo Limpiando instalacion local...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del package-lock.json
npm cache clean --force
npm install --no-audit --no-fund
pause
