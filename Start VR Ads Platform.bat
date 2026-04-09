@echo off
title VR Ads Platform
echo Starting VR Ads Platform...
echo.
set PORT=3002
cd /d "%~dp0"
start "" http://localhost:3002
bun run dev
