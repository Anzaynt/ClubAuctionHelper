@echo off
cd /d "%~dp0"
echo.
echo BidLens is running at http://localhost:5173
echo Keep this window open while using the helper.
echo.
start "BidLens browser" /b cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:5173"
python -m http.server 5173
