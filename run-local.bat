@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-local.ps1"
set "run_exit=%ERRORLEVEL%"
if not "%run_exit%"=="0" (
    echo.
    echo PO Intelligence Hub stopped with an error. Review the message above.
    pause
)
exit /b %run_exit%
