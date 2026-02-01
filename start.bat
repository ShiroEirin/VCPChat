@echo off
chcp 65001 >nul
echo Starting VCP Chat Desktop...

REM ========================================
REM 智能检测 Python 环境
REM 优先级: 全局 Python (有依赖) > Poetry 虚拟环境 > 提示错误
REM ========================================

REM Step 1: 检测全局 Python 是否已安装依赖
echo [ENV] Checking global Python dependencies...
python -c "import numpy" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [ENV] Global Python has dependencies installed, using global Python
    goto :start_app
)
echo [ENV] Global Python missing dependencies

REM Step 2: 检测 Poetry 虚拟环境
where poetry >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ENV] Poetry not found
    goto :show_error
)

echo [ENV] Checking Poetry virtual environment...
for /f "tokens=*" %%i in ('poetry env info --path 2^>nul') do set VENV_PATH=%%i

if not defined VENV_PATH (
    echo [ENV] No Poetry virtual environment found
    goto :show_error
)

if not exist "%VENV_PATH%\Scripts\python.exe" (
    echo [ENV] Poetry venv exists but Python not installed
    goto :show_error
)

REM 检测虚拟环境是否有依赖
"%VENV_PATH%\Scripts\python.exe" -c "import numpy" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ENV] Poetry venv missing dependencies
    goto :show_error
)

echo [ENV] Using Poetry virtual environment: %VENV_PATH%
set PATH=%VENV_PATH%\Scripts;%PATH%
goto :start_app

:show_error
echo.
echo [ERROR] ========================================
echo [ERROR] Python dependencies not found!
echo [ERROR] Please install dependencies using one of:
echo [ERROR]   1. pip install -r requirements.txt
echo [ERROR]   2. poetry install
echo [ERROR] ========================================
echo.
pause
exit /b 1

:start_app
START "" "NativeSplash.exe"
npm start
