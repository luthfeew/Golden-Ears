@echo off
title Golden Ears Blind Test
echo ======================================================
echo           GOLDEN EARS BLIND TEST
echo ======================================================
echo Menjalankan local server di port 8080...
echo Membuka website di browser...
start http://localhost:8080/index.html
node server.js
if %errorlevel% neq 0 (
    python -m http.server 8080
)
pause
