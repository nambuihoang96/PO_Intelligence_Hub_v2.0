@echo off
setlocal
cd /d "%~dp0"
echo Starting PO Intelligence Hub from this folder:
echo %~dp0
call "%~dp0run-local.bat"
exit /b %ERRORLEVEL%
