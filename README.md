# Декодер GMDSS

Программа для декодирования метеорологических данных GMDSS (сообщений NAVTEX) с поддержкой локализации на русском языке.

## Структура проекта

- `src/`: Исходные файлы на TypeScript
- `src/i18n/`: Файлы локализации (например, `ru.json`)
- `data/`: Входные данные (например, `input.txt`, `stations.json`)
- `dist/`: Скомпилированные файлы JavaScript
- `tests/`: Тесты (например, `decoder.test.ts`)
- `node_modules/`: Зависимости проекта

## Установка

1. Клонируйте репозиторий:
   ```bash
   git clone https://github.com/SmNikc/GidroMeteo_New.git
   cd GidroMeteo_New


Установите зависимости:npm install



Сборка
Скомпилируйте TypeScript-код и скопируйте файлы локализации:
npm run build

Запуск
Запустите декодер, указав путь к входному файлу:
cd dist
node main.js ../data/input.txt

Результаты:

output.txt: Декодированные метеоданные
currents.txt: Заглушка данных о течениях
Загруженные изображения (заглушка)

Тестирование
Запустите юнит-тесты:
npm test

Зависимости

i18n: Локализация
typescript: Компилятор TypeScript
@types/node, @types/i18n: Типы для Node.js и i18n
jest, @types/jest, ts-jest: Тестирование

Лицензия
См. файл LICENSE для подробностей.```



## Структура проекта

GidroMeteo_New/
├── data/
│   ├── input.txt
│   └── stations.json
├── dist/               # генерируется автоматически после компиляции (tsc)
│   ├── currents.txt
│   ├── decoder.js
│   ├── main.js
│   ├── output.txt
│   ├── copernicus/
│   │   └── copernicus.js
│   ├── i18n/
│   │   └── ru.json
│   └── imagery/
│       └── imagery.js
├── node_modules/       # генерируется автоматически после npm install
├── src/
│   ├── decoder.ts
│   ├── main.ts
│   ├── copernicus/
│   │   └── copernicus.ts
│   ├── imagery/
│   │   └── imagery.ts
│   └── i18n/
│       └── ru.json
├── package.json
├── package-lock.json
├── tsconfig.json
└── .gitignore          # Создать вручную (выше указано содержимое)
===============
GidroMeteo_New
 Проект для декодирования метеорологических сообщений форматов КН-01, NAVTEX и SafetyNet.

 ## Структура проекта
 - `src/decoder.ts`: Основная логика декодирования.
 - `tests/decoder.test.ts`: Тесты для проверки функциональности.
 - `src/i18n/ru.json`: Локализация на русском языке.
 - `data/input_kn01.txt`, `data/input_navtex.txt`: Входные файлы для тестирования.
 - `data/output.txt`: Результаты обработки.
 - `data/stations.json`: Справочник метеостанций.

 ## Установка
 ```bash
 npm install
 ```

 ## Сборка
 ```bash
 npm run build
 ```

 ## Тесты
 ```bash
 npm test
 ```

 ## Запуск
 ```bash
 cd dist
 node main.js ../data/input_kn01.txt
 node main.js ../data/input_navtex.txt
 ```

