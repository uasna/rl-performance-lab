@echo off
cd /d "%~dp0.."
echo RL Performance Lab - build de Windows
echo.
npm run electron:build
pause
