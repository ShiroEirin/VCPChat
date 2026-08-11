@echo off
chcp 65001
echo Starting VCP Chat Desktop...
START "" "NativeSplash.exe"
npm start
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================
    echo  VCPChat 启动失败！错误代码: %ERRORLEVEL%
    echo  请截图此窗口内容并反馈给开发者
    echo ========================================
)
pause