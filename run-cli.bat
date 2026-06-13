@echo off
setlocal

echo ============================================
echo  Heightmapper - CLI / Headless Export
echo ============================================
echo.

if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install failed
        exit /b 1
    )
)

if "%~1"=="" (
    echo Usage: run-cli.bat [OPTIONS]
    echo.
    echo Options:
    echo   --export           Export heightmap PNG
    echo   --json             Output metadata as JSON (for AI agents)
    echo   --lat FLOAT        Latitude (default: current view)
    echo   --lng FLOAT        Longitude (default: current view)
    echo   --zoom FLOAT       Zoom level (default: 10)
    echo   --min FLOAT        Min elevation in meters (default: 0)
    echo   --max FLOAT        Max elevation in meters (default: 8848)
    echo   -o, --output FILE  Output filename (default: auto-generated)
    echo   --width INT        Window width in pixels (default: 1280)
    echo   --height INT       Window height in pixels (default: 720)
    echo   --timeout INT      Timeout in ms (default: 30000)
    echo.
    echo Examples:
    echo   run-cli.bat --export --lat 37.5665 --lng 126.978 --zoom 10 -o seoul.png
    echo   run-cli.bat --json --lat 37.5665 --lng 126.978 --zoom 10
    echo   run-cli.bat --export --json --lat 37.5665 --lng 126.978 --zoom 12 -o seoul_hd.png
    exit /b 0
)

call npx electron . %*
endlocal
