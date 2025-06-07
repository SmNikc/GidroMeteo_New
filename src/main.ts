import * as fs from 'fs';
import * as path from 'path';
import { decodeMessage, formatMessage } from './decoder';
import { fetchCurrents } from './copernicus/copernicus';
import { downloadImages } from './imagery/imagery';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Укажите путь к файлу: node dist/main.js ../data/input.txt');
    process.exit(1);
  }

  try {
    const filePath = path.resolve(args[0]);
    const input = fs.readFileSync(filePath, 'utf8');

    const messages = decodeMessage(input);
    const weatherOutput = formatMessage(messages);

    fs.writeFileSync('output.txt', weatherOutput, 'utf8');
    console.log('output.txt создан.');

    const currents = await fetchCurrents({});
    fs.writeFileSync('currents.txt', JSON.stringify(currents, null, 2), 'utf8');
    console.log('currents.txt создан.');

    await downloadImages({});
    console.log('Загрузка изображений завершена.');
  } catch (err) {
    console.error(`Ошибка: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();