@echo off
cd /d C:\Projects\GidroMeteo_New

:: Создание папки patches, если не существует
if not exist patches (
    mkdir patches
)

echo === Сравнение текущей версии decoder.ts с релизом v0.9...
git diff 17b8a9b HEAD -- src/decoder.ts > patches\decoder_patch_from_release_to_head.diff

echo === Сравнение текущей версии decoder.ts с initial commit...
git diff 759d906 HEAD -- src/decoder.ts > patches\decoder_patch_from_initial_to_head.diff

echo === Готово!
echo Diff-файлы сохранены в папке: patches
echo - decoder_patch_from_release_to_head.diff
echo - decoder_patch_from_initial_to_head.diff

pause
