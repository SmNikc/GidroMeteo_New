@echo off
cd /d C:\Projects\GidroMeteo_New

echo === Применение патча: decoder_patch_from_release_to_head.diff ===
git apply patches\decoder_patch_from_release_to_head.diff

if %errorlevel% equ 0 (
    echo ✅ Патч успешно применён к src/decoder.ts
) else (
    echo ❌ Ошибка при применении патча.
    echo Возможно, код уже изменён или не соответствует структуре diff-файла.
)

pause
