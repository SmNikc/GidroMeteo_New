@echo off
echo === Перемещение тега v0.9 на текущий коммит ===
git tag -d v0.9
git tag v0.9
git push --force origin v0.9
echo === Готово: тег v0.9 обновлён на GitHub ===
pause