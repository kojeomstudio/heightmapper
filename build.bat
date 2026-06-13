@echo off
echo ============================================
echo  Heightmapper - Build Distributable
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

echo Building distributable...
call npx electron-builder --win
if errorlevel 1 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo Build complete! Output in dist\
pause
