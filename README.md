Декодер GMDSS (GidroMeteo_New)
Версия 1.0.0
Стабильный релиз для декодирования метеорологических сообщений форматов КН-01, NAVTEX и SafetyNet. Поддерживает локализацию на русском языке. Все тесты пройдены, программа готова к использованию.
Описание
Программа декодирует метеорологические сообщения GMDSS (Global Maritime Distress and Safety System), включая форматы КН-01 и NAVTEX. Выходные данные сохраняются в output.txt, а также предоставляется заглушка для данных о течениях (currents.txt).
Структура проекта

src/: Исходный код на TypeScript
decoder.ts: Основная логика декодирования
main.ts: Точка входа программы
i18n/ru.json: Локализация на русском языке
copernicus/copernicus.ts: Модуль для работы с данными Copernicus (заглушка)
imagery/imagery.ts: Модуль для обработки изображений (заглушка)


data/: Входные и справочные данные
input_kn01.txt: Тестовый файл формата КН-01
input_navtex.txt: Тестовый файл формата NAVTEX
output.txt: Результаты декодирования
stations.json: Справочник метеостанций


tests/: Юнит-тесты
decoder.test.ts: Тесты для проверки декодирования


dist/: Скомпилированные файлы (генерируются при сборке)
decoder.js, main.js: Скомпилированный код
i18n/ru.json: Скопированная локализация
output.txt: Выходные данные
currents.txt: Заглушка данных о течениях


package.json: Зависимости и скрипты
tsconfig.json: Конфигурация TypeScript
.gitignore: Исключения для Git

Установка

Клонируйте репозиторий:git clone https://github.com/SmNikc/GidroMeteo_New.git
cd GidroMeteo_New


Установите зависимости:npm install



Сборка
Скомпилируйте проект и скопируйте файлы локализации:
npm run build

Тестирование
Запустите юнит-тесты для проверки декодирования:
npm test

Запуск
Запустите программу для обработки входных файлов:
cd dist
node main.js ../data/input_kn01.txt
node main.js ../data/input_navtex.txt

Результаты

data/output.txt: Декодированные метеоданные
dist/currents.txt: Заглушка данных о течениях

Зависимости

i18n: Локализация
typescript: Компилятор TypeScript
@types/node, @types/i18n: Типы для Node.js и i18n
jest, @types/jest, ts-jest: Тестирование

Лицензия
См. файл LICENSE для подробностей.
Для программистов

Для добавления новых форматов сообщений модифицируйте src/decoder.ts и обновите тесты в tests/decoder.test.ts.
Локализация настраивается в src/i18n/ru.json.
Входные файлы размещайте в data/ с именами, соответствующими формату (например, input_*.txt).
Для отладки добавляйте console.log в decoder.ts и используйте:npm test > debug_test.log



