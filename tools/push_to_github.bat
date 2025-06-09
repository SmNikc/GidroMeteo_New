@echo off
setlocal EnableDelayedExpansion

set "COMMIT_MESSAGE=%~1"
if "%COMMIT_MESSAGE%"=="" (
    echo Ошибка: Сообщение коммита не указано.
    exit /b 1
)

echo === Обновление GitHub-репозитория (ветка main) ===
git commit -m "%COMMIT_MESSAGE%"
if errorlevel 1 (
    echo Ошибка при создании коммита.
    exit /b 1
)

git push origin main
if errorlevel 1 (
    echo Ошибка при отправке изменений.
    exit /b 1
)

echo === Изменения отправлены и записаны в git_push_log.log ===
echo %date% %time%: %COMMIT_MESSAGE% >> git_push_log.log

pause