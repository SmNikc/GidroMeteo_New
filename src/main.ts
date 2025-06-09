import * as fs from 'fs';
import * as path from 'path';
import { decodeMessage, formatMessage } from './decoder';
import * as i18n from 'i18n';

i18n.configure({
  locales: ['ru'],
  directory: path.join(__dirname, 'i18n'),
  defaultLocale: 'ru',
  objectNotation: true,
});
i18n.setLocale('ru');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error(i18n.__('error_no_input'));
  process.exit(1);
}

try {
  const input = fs.readFileSync(path.resolve(inputPath), 'utf8');
  const messages = decodeMessage(input);
  const output = formatMessage(messages);
  fs.writeFileSync('output.txt', output);
  fs.writeFileSync('currents.txt', '');
  console.log(i18n.__('success_output_written'));
} catch (err: any) {
  console.error(i18n.__('error_read_file', { message: err.message }));
  process.exit(1);
}