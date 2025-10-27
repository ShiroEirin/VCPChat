@echo off
echo Python版本管理器
echo -----------------
echo 1. 使用Python 3.12
echo 2. 使用Python 3.13
echo 3. 查看当前版本
echo 4. 退出
echo.
set /p choice=请选择操作 (1-4):

if "%choice%"=="1" (
    echo 正在激活Python 3.12环境...
    call venv312\Scripts\activate.bat
    python --version
    echo Python 3.12环境已激活！
) else if "%choice%"=="2" (
    echo 正在激活Python 3.13环境...
    call venv313\Scripts\activate.bat
    python --version
    echo Python 3.13环境已激活！
) else if "%choice%"=="3" (
    echo 当前Python版本:
    python --version
    echo.
    echo 可用版本:
    py -3.12 --version
    py -3.13 --version
) else if "%choice%"=="4" (
    echo 退出...
    exit
) else (
    echo 无效选择！
)

pause