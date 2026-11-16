@echo off
rem reset-audit-db.cmd — restore the isolated audit database (solis_audit)
rem from a fresh dump of the live database, so every module audit starts
rem from the same known state.
rem
rem Usage:  reset-audit-db.cmd  [path-to-repo]
setlocal
set REPO=%~1
if "%REPO%"=="" set REPO=%~dp0..\..\..
set MYSQL=%SOLIS_XAMPP%\mysql\bin\mysql.exe
if "%SOLIS_XAMPP%"=="" set MYSQL=m:\dev\xampp\mysql\bin\mysql.exe
set MYSQLDUMP=%SOLIS_XAMPP%\mysql\bin\mysqldump.exe
if "%SOLIS_XAMPP%"=="" set MYSQLDUMP=m:\dev\xampp\mysql\bin\mysqldump.exe
set DUMP=%TEMP%\solis_audit_dump.sql

"%MYSQL%" -uroot -e "DROP DATABASE IF EXISTS solis_audit; CREATE DATABASE solis_audit CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if errorlevel 1 exit /b 1
"%MYSQLDUMP%" -uroot --result-file=%DUMP% solis
if errorlevel 1 exit /b 1
"%MYSQL%" -uroot --binary-mode solis_audit < "%DUMP%"
if errorlevel 1 exit /b 1
"%MYSQL%" -uroot solis_audit -e "SELECT COUNT(*) AS users FROM users; SELECT COUNT(*) AS cells FROM cells;"
echo audit db reset ok
