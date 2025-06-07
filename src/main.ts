import * as fs from 'fs';
import * as path from 'path';
import { decodeMessage, formatMessage } from './decoder';
import { fetchCurrents } from './copernicus/copernicus';
import { downloadImages } from './imagery/imagery';

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Укажите путь к файлу: node main.js ../data/input.txt');
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  const input = fs.readFileSync(filePath, 'utf8');
  const messages = decodeMessage(input);
  const weatherOutput = formatMessage(messages);
  fs.writeFileSync('output.txt', weatherOutput);
  console.log(weatherOutput);

  const currents = fetchCurrents({});
  fs.writeFileSync('currents.txt', JSON.stringify(currents));

  downloadImages({});
}

main();