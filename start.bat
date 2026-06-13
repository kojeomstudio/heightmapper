@echo off
echo ============================================
echo  Heightmapper - Start (GUI Mode)
echo ============================================
echo.

if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install failed
        pause
        exit /b 1
    )
)

echo Starting Heightmapper...
call npx electron .
pause
