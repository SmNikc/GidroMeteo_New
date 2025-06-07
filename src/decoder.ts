import * as fs from 'fs';
import * as i18n from 'i18n';
import * as path from 'path';

// Настройка i18n
i18n.configure({
  locales: ['ru'],
  directory: path.join(__dirname, 'i18n'),
  defaultLocale: 'ru',
  objectNotation: true,
});

// Типы данных (модель)
interface WeatherStation {
  code: string;
  name: string;
  coordinates: string;
}

interface Forecast {
  stationCodes: string[];
  timeRange: { from: string; to: string };
  wind: { direction: string; speed: string; gusts?: string };
  temperature?: string;
  visibility?: string;
  seas?: string;
  iceAccretion?: string;
  region?: string;
}

interface IceReport {
  region: string;
  direction: string;
  coordinates: string[];
}

interface Synopsis {
  time: string;
  pressures: Array<{ type: 'LOW' | 'HIGH' | 'INFO'; hpa: string; position: string; movement?: string }>;
}

interface WeatherMessage {
  type: 'KN01' | 'SafetyNet';
  date: string;
  source: string;
  sections: {
    header?: string[];
    part1?: Forecast[];
    part2?: { synopsis?: Synopsis; iceReports?: IceReport[] };
    part3?: Forecast[];
  };
}

// Кэш для результатов декодирования
let lastInput: string | null = null;
let cachedMessages: WeatherMessage[] | null = null;

// Загрузка станций
const stations: { [key: string]: string } = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/stations.json'), 'utf8'));

// Конечный автомат
enum State {
  INITIAL,
  HEADER,
  PART_1,
  PART_2,
  PART_3,
  SYNOPSIS,
  ICE_REPORT,
  FORECAST,
  END,
}

interface FSMContext {
  state: State;
  message: WeatherMessage;
  currentForecast?: Forecast;
  currentIceReport?: IceReport;
  currentSynopsis?: Synopsis;
  currentStationCodes?: string[];
}

// Декодирование сообщения
function decodeMessage(input: string): WeatherMessage[] {
  // Проверка кэша
  if (input === lastInput && cachedMessages) {
    console.log('Using cached messages'); // Отладка
    return cachedMessages;
  }

  const messages: WeatherMessage[] = []; // Локальная переменная
  const lines = input.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  let context: FSMContext = {
    state: State.INITIAL,
    message: {
      type: 'SafetyNet',
      date: '',
      source: '',
      sections: {},
    },
  };
  console.log('Processing input lines:', lines); // Отладка

  for (const line of lines) {
    const upperLine = line.toUpperCase();
    if (upperLine.startsWith('ZCZC') && messages.length > 0) {
      messages.push(context.message);
      context = {
        state: State.HEADER,
        message: {
          type: 'SafetyNet',
          date: '',
          source: '',
          sections: {},
        },
      };
      context.message.sections.header = [line];
      continue;
    }
    processLine(line, context);
  }

  if (context.message.sections.header?.length || context.message.sections.part1?.length || context.message.sections.part2 || context.message.sections.part3?.length) {
    messages.push(context.message);
  }

  // Сохраняем в кэш
  lastInput = input;
  cachedMessages = [...messages];

  return messages;
}

// Обработка строки конечным автоматом
function processLine(line: string, context: FSMContext): void {
  console.log(`State: ${State[context.state]}, Line: ${line}`); // Отладка
  const upperLine = line.toUpperCase();

  switch (context.state) {
    case State.INITIAL:
      if (upperLine.startsWith('ZCZC')) {
        context.state = State.HEADER;
        context.message.sections.header = [line];
      }
      break;

    case State.HEADER:
      if (upperLine.includes('GALE WARNING')) {
        context.state = State.PART_1;
        context.message.sections.part1 = context.message.sections.part1 || []; // Инициализация part1
        context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: i18n.__('gale_warning'), speed: '' } };
        context.message.sections.part1.push(context.currentForecast!);
      } else if (upperLine.includes('SYNOPSIS')) {
        context.state = State.SYNOPSIS;
        context.message.sections.part2 = { synopsis: { time: line.replace(/^SYNOPSIS AT\s+/, ''), pressures: [] } };
      } else if (upperLine.includes('FORECAST')) {
        context.state = State.PART_3;
        context.message.sections.part3 = context.message.sections.part3 || [];
        context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
      } else if (upperLine === 'NNNN') {
        context.state = State.INITIAL;
      } else if (/^\d{6}\s+UTC\s+[A-Z]{3}\s+\d{2}$/.test(upperLine)) {
        context.message.date = line;
        context.message.sections.header = context.message.sections.header || [];
        context.message.sections.header.push(line);
      } else {
        context.message.sections.header = context.message.sections.header || [];
        context.message.sections.header.push(line);
        if (upperLine.includes('ISSUED BY')) {
          context.message.source = line.replace(/^ISSUED\s+BY\s*/i, '');
        }
      }
      break;

    case State.PART_1:
      if (upperLine.includes('SYNOPSIS') || upperLine.includes('PART 2')) {
        if (context.currentForecast) {
          context.message.sections.part1 = context.message.sections.part1 || [];
          context.message.sections.part1.push(context.currentForecast);
          context.currentForecast = undefined;
        }
        context.state = State.SYNOPSIS;
        context.message.sections.part2 = { synopsis: { time: line.replace(/^SYNOPSIS AT\s+/, ''), pressures: [] } };
      } else if (upperLine.includes('GALE WARNING')) {
        if (context.currentForecast) {
          context.message.sections.part1 = context.message.sections.part1 || [];
          context.message.sections.part1.push(context.currentForecast);
        }
        context.state = State.FORECAST;
        context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: i18n.__('gale_warning'), speed: '' } };
        context.message.sections.part1 = context.message.sections.part1 || [];
        context.message.sections.part1.push(context.currentForecast!);
      } else if (/^\d{5}(,\s*\d{5})*/.test(line)) {
        context.currentStationCodes = line.split(',').map(code => code.trim());
        if (context.currentForecast) {
          context.currentForecast.stationCodes = context.currentStationCodes;
        }
      } else if (upperLine.startsWith('FROM')) {
        const [from, to] = line.replace(/^FROM\s+/, '').split(/\s+TO\s+/);
        if (context.currentForecast) {
          context.currentForecast.timeRange = { from, to };
        }
      } else if (upperLine.includes('WINDS')) {
        const windMatch = line.match(/WINDS\s+([A-Z\/]+)\s*(GUSTS)?\s*(\d+\s*(?:TO\s*\d+)?\s*MS)/i);
        if (windMatch && context.currentForecast) {
          context.currentForecast.wind = {
            direction: windMatch[1],
            speed: windMatch[3],
            gusts: windMatch[2] ? windMatch[3] : undefined,
          };
          context.message.sections.part1 = context.message.sections.part1 || [];
          context.message.sections.part1.push(context.currentForecast);
          context.currentForecast = undefined;
          context.currentStationCodes = undefined;
        }
      } else if (upperLine.includes('HEIGHT OF WAVES')) {
        if (context.currentForecast) {
          context.currentForecast.seas = line.replace(/^HEIGHT OF WAVES\s+/, '');
        }
      } else if (upperLine === 'NNNN') {
        if (context.currentForecast) {
          context.message.sections.part1 = context.message.sections.part1 || [];
          context.message.sections.part1.push(context.currentForecast);
          context.currentForecast = undefined;
        }
        context.state = State.INITIAL;
      } else if (upperLine.includes('PETER THE GREAT GULF') || upperLine.includes('REGION')) {
        if (context.currentForecast) {
          context.message.sections.part1 = context.message.sections.part1 || [];
          context.message.sections.part1.push(context.currentForecast);
        }
        context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' }, region: line };
        context.message.sections.part1 = context.message.sections.part1 || [];
        context.message.sections.part1.push(context.currentForecast!);
      } else if (context.currentForecast) {
        context.currentForecast.timeRange.to += ` ${line}`; // Временной диапазон
      }
      break;

    case State.PART_2:
      if (upperLine.includes('SYNOPSIS')) {
        context.state = State.SYNOPSIS;
        context.currentSynopsis = { time: line.replace(/^SYNOPSIS AT\s+/, ''), pressures: [] };
      } else if (upperLine.includes('ICE')) {
        context.state = State.ICE_REPORT;
        context.currentIceReport = { region: '', direction: '', coordinates: [] };
      } else if (upperLine.includes('FORECAST') || upperLine.includes('PART 3')) {
        context.state = State.PART_3;
        context.message.sections.part3 = context.message.sections.part3 || [];
        context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
      } else if (upperLine === 'NNNN') {
        context.state = State.INITIAL;
      } else {
        context.message.sections.part2 = context.message.sections.part2 || { synopsis: { time: '', pressures: [] } };
        context.message.sections.part2.synopsis!.pressures.push({
          type: 'INFO',
          hpa: '',
          position: line,
          movement: '',
        });
      }
      break;

    case State.SYNOPSIS:
      if (upperLine.includes('FORECAST') || upperLine.includes('PART 3')) {
        context.state = State.PART_3;
        context.message.sections.part3 = context.message.sections.part3 || [];
        context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
      } else if (upperLine.includes('ICE')) {
        context.message.sections.part2 = context.message.sections.part2 || { synopsis: { time: '', pressures: [] } };
        context.message.sections.part2.synopsis = context.currentSynopsis;
        context.currentSynopsis = undefined;
        context.state = State.ICE_REPORT;
        context.currentIceReport = { region: '', direction: '', coordinates: [] };
      } else if (upperLine === 'NNNN') {
        context.state = State.INITIAL;
      } else {
        context.message.sections.part2 = context.message.sections.part2 || { synopsis: { time: '', pressures: [] } };
        context.message.sections.part2.synopsis!.pressures.push({
          type: 'INFO',
          hpa: '',
          position: line,
          movement: '',
        });
      }
      break;

    case State.ICE_REPORT:
      if (upperLine.includes('PART 3') || upperLine.includes('FORECAST')) {
        context.message.sections.part2 = context.message.sections.part2 || { synopsis: { time: '', pressures: [] }, iceReports: [] };
        context.message.sections.part2.iceReports!.push(context.currentIceReport!);
        context.currentIceReport = undefined;
        context.state = State.PART_3;
        context.message.sections.part3 = context.message.sections.part3 || [];
        context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
      } else if (upperLine.match(/^[A-Z4-5-]+$/)) {
        context.currentIceReport!.region = line;
      } else if (upperLine.includes('ICE N') || upperLine.includes('ICE S') || upperLine.includes('ICE E') || upperLine.includes('ICE SW')) {
        context.currentIceReport!.direction = line.match(/ICE\s+([A-Z\/]+)/i)![1];
        context.currentIceReport!.coordinates.push(line.replace(/ICE\s+[A-Z\/]+\s+TO\s+/, ''));
      } else if (upperLine.includes('WINDS')) {
        context.message.sections.part2 = context.message.sections.part2 || { synopsis: { time: '', pressures: [] }, iceReports: [] };
        context.message.sections.part2.iceReports!.push(context.currentIceReport!);
        context.currentIceReport = undefined;
        context.state = State.FORECAST;
        context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
      } else if (upperLine === 'NNNN') {
        context.state = State.INITIAL;
      }
      break;

    case State.PART_3:
      if (/^\d{5}(,\s*\d{5})*/.test(line)) {
        context.currentStationCodes = line.split(',').map(code => code.trim());
        if (context.currentForecast) {
          context.currentForecast.stationCodes = context.currentStationCodes;
        } else {
          context.currentForecast = { stationCodes: context.currentStationCodes, timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
        }
      } else if (upperLine.includes('WINDS')) {
        const windMatch = line.match(/WINDS\s+([A-Z\/]+)\s*(GUSTS)?\s*(\d+\s*(?:TO\s*\d+)?\s*MS)/i);
        if (windMatch) {
          context.currentForecast!.wind = {
            direction: windMatch[1],
            speed: windMatch[3],
            gusts: windMatch[2] ? windMatch[3] : undefined,
          };
        }
      } else if (upperLine.includes('TEMP')) {
        context.currentForecast!.temperature = line.replace(/^TEMPERATURE OF\s+/, '');
      } else if (upperLine.includes('VIS')) {
        context.currentForecast!.visibility = line.replace(/^VIS\s+/, '');
      } else if (upperLine.includes('HEIGHT OF WAVES')) {
        context.currentForecast!.seas = line.replace(/^HEIGHT OF WAVES\s+/, '');
      } else if (upperLine.includes('ICE ACCRETION')) {
        context.currentForecast!.iceAccretion = line.replace(/^ICE ACCRETION\s+/, '');
      } else if (upperLine === 'NNNN') {
        if (context.currentForecast) {
          context.message.sections.part3 = context.message.sections.part3 || [];
          context.message.sections.part3.push(context.currentForecast);
          context.currentForecast = undefined;
          context.currentStationCodes = undefined;
        }
        context.state = State.INITIAL;
      } else if (upperLine.startsWith('FROM')) {
        const [from, to] = line.replace(/^FROM\s+/, '').split(/\s+TO\s+/);
        context.currentForecast!.timeRange = { from, to };
      } else if (upperLine.includes('PETER THE GREAT GULF') || upperLine.includes('REGION')) {
        if (context.currentForecast) {
          context.message.sections.part3 = context.message.sections.part3 || [];
          context.message.sections.part3.push(context.currentForecast);
        }
        context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' }, region: line };
        context.message.sections.part3 = context.message.sections.part3 || [];
        context.message.sections.part3.push(context.currentForecast!);
      } else if (context.currentForecast) {
        context.currentForecast.timeRange.to += ` ${line}`; // Временной диапазон
      }
      break;

    case State.FORECAST:
      if (upperLine.includes('WINDS')) {
        const windMatch = line.match(/WINDS\s+([A-Z\/]+)\s*(GUSTS)?\s*(\d+\s*(?:TO\s*\d+)?\s*MS)/i);
        if (windMatch) {
          context.currentForecast!.wind = {
            direction: windMatch[1],
            speed: windMatch[3],
            gusts: windMatch[2] ? windMatch[3] : undefined,
          };
        }
      } else if (upperLine.includes('TEMP')) {
        context.currentForecast!.temperature = line.replace(/^TEMPERATURE OF\s+/, '');
      } else if (upperLine.includes('VIS')) {
        context.currentForecast!.visibility = line.replace(/^VIS\s+/, '');
      } else if (upperLine.includes('HEIGHT OF WAVES')) {
        context.currentForecast!.seas = line.replace(/^HEIGHT OF WAVES\s+/, '');
      } else if (upperLine.includes('ICE ACCRETION')) {
        context.currentForecast!.iceAccretion = line.replace(/^ICE ACCRETION\s+/, '');
      } else if (/^\d{5}(,\s*\d{5})*/.test(line) || upperLine === 'NNNN') {
        if (context.message.sections.part3) {
          context.message.sections.part3.push(context.currentForecast!);
        } else if (context.message.sections.part1) {
          context.message.sections.part1 = context.message.sections.part1 || [];
          context.message.sections.part1.push(context.currentForecast!);
        }
        context.currentForecast = undefined;
        context.currentStationCodes = undefined;
        if (upperLine === 'NNNN') {
          context.state = State.INITIAL;
        } else {
          context.currentStationCodes = line.split(',').map(code => code.trim());
          context.currentForecast = { stationCodes: context.currentStationCodes, timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
        }
      } else if (upperLine.includes('PETER THE GREAT GULF') || upperLine.includes('REGION')) {
        if (context.currentForecast) {
          context.currentForecast.region = line;
        }
      } else if (context.currentForecast) {
        context.currentForecast.timeRange.to += ` ${line}`; // Временной диапазон
      }
      break;

    case State.END:
      if (upperLine.startsWith('ZCZC')) {
        context.state = State.HEADER;
        context.message.sections.header = [line];
      }
      break;
  }
}

// Декодирование КН-01
function decodeKN01(lines: string[], context: FSMContext): WeatherMessage {
  const groups = lines[0].split(/\s+/);
  context.message.sections.header = [
    `${i18n.__('station')}: ${stations[groups[0]] || i18n.__('unknown_station', { code: groups[0] })}`,
  ];
  return context.message;
}

// Форматирование модели в текст
function formatMessage(messages: WeatherMessage[]): string {
  let output = '';

  const appendLine = (text: string, indentLevel: number = 0) => {
    output += `${'  '.repeat(indentLevel)}${text}\n`;
  };

  messages.forEach((message, index) => {
    appendLine(`=== ${i18n.__('data_type', { type: message.type })} ${index + 1} ===`);

    // Заголовок
    if (message.sections.header) {
      appendLine(`=== ${i18n.__('header')} ===`);
      message.sections.header.forEach(line => appendLine(line, 1));
    }

    // Часть 1
    if (message.sections.part1) {
      appendLine(`=== ${i18n.__('part_1')} ===`);
      message.sections.part1.forEach(forecast => {
        if (forecast.region) appendLine(`${forecast.region}`, 1);
        if (forecast.stationCodes.length) appendLine(`${forecast.stationCodes.join(', ')}`, 1);
        if (forecast.timeRange.from || forecast.timeRange.to) {
          appendLine(`${i18n.__('time_range', { from: forecast.timeRange.from, to: forecast.timeRange.to })}`, 1);
        }
        if (forecast.wind.direction || forecast.wind.speed) {
          appendLine(`${i18n.__('wind')}: ${forecast.wind.direction} ${forecast.wind.speed}${forecast.wind.gusts ? ` ${i18n.__('gusts')} ${forecast.wind.gusts}` : ''}`, 1);
        }
        if (forecast.temperature) appendLine(`${i18n.__('temperature')}: ${forecast.temperature}`, 1);
        if (forecast.visibility) appendLine(`${i18n.__('visibility')}: ${forecast.visibility}`, 1);
        if (forecast.seas) appendLine(`${i18n.__('seas')}: ${forecast.seas}`, 1);
        if (forecast.iceAccretion) appendLine(`${i18n.__('ice_accretion')}: ${forecast.iceAccretion}`, 1);
      });
    }

    // Часть 2
    if (message.sections.part2) {
      appendLine(`=== ${i18n.__('part_2')} ===`);
      if (message.sections.part2.synopsis) {
        appendLine(`${i18n.__('synopsis')} ${message.sections.part2.synopsis.time}`, 1);
        message.sections.part2.synopsis.pressures.forEach(pressure => {
          appendLine(`${pressure.position}`, 2);
        });
      }
      if (message.sections.part2.iceReports) {
        message.sections.part2.iceReports.forEach(report => {
          appendLine(`${i18n.__('ice')} ${report.region}`, 1);
          appendLine(`${i18n.__('ice_direction', { direction: report.direction })}: ${report.coordinates.join(', ')}`, 2);
        });
      }
    }

    // Часть 3
    if (message.sections.part3) {
      appendLine(`=== ${i18n.__('part_3')} ===`);
      message.sections.part3.forEach(forecast => {
        if (forecast.region) appendLine(`${forecast.region}`, 1);
        if (forecast.stationCodes.length) appendLine(`${forecast.stationCodes.join(', ')}`, 1);
        if (forecast.timeRange.from || forecast.timeRange.to) {
          appendLine(`${i18n.__('time_range', { from: forecast.timeRange.from, to: forecast.timeRange.to })}`, 1);
        }
        if (forecast.wind.direction || forecast.wind.speed) {
          appendLine(`${i18n.__('wind')}: ${forecast.wind.direction} ${forecast.wind.speed}${forecast.wind.gusts ? ` ${i18n.__('gusts')} ${forecast.wind.gusts}` : ''}`, 1);
        }
        if (forecast.temperature) appendLine(`${i18n.__('temperature')}: ${forecast.temperature}`, 1);
        if (forecast.visibility) appendLine(`${i18n.__('visibility')}: ${forecast.visibility}`, 1);
        if (forecast.seas) appendLine(`${i18n.__('seas')}: ${forecast.seas}`, 1);
        if (forecast.iceAccretion) appendLine(`${i18n.__('ice_accretion')}: ${forecast.iceAccretion}`, 1);
      });
    }
  });

  return output;
}

// Главная функция
function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error(i18n.__('error_no_input'));
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error(i18n.__('error_read_file', { message: err.message }));
      process.exit(1);
    }

    const messages = decodeMessage(data);
    const output = formatMessage(messages);
    console.log(output);

    fs.writeFile('output.txt', output, 'utf8', (writeErr) => {
      if (writeErr) console.error(i18n.__('error_write_file', { message: writeErr.message }));
      else console.log(i18n.__('success_output_written'));
    });
  });
}

main();

export { decodeMessage, formatMessage };