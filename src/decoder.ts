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
i18n.setLocale('ru');

// Типы данных (модель)
export interface WeatherStation {
  code: string;
  name: string;
  coordinates: string;
}

export interface Forecast {
  stationCodes: string[];
  timeRange: { from: string; to: string };
  wind: { direction: string; speed: string; gusts?: string };
  temperature?: string;
  visibility?: string;
  seas?: string;
  iceAccretion?: string;
  region?: string;
  pressure?: string;
  precipitation?: string;
}

export interface IceReport {
  region: string;
  direction: string;
  coordinates: string[];
}

export interface Synopsis {
  time: string;
  pressures: Array<{ type: 'LOW' | 'HIGH' | 'INFO'; hpa: string; position: string; movement?: string }>;
}

export interface WeatherMessage {
  type: 'KN01' | 'SafetyNet' | 'NAVTEX';
  date: string;
  source: string;
  sections?: {
    header: string[];
    part1: Forecast[];
    part2?: { synopsis?: Synopsis; iceReports?: IceReport[] };
    part3: Forecast[];
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

// Вспомогательные функции для КН-01
function decodeWMOGroup(group: string): { direction: string; speed: string } {
  const dd = group.substring(1, 3);
  const ff = parseInt(group.substring(3));
  const directionDesc = {
    "00": "штиль",
    "01": "ССВ",
    "05": "ВСВ",
    "10": "В",
    "14": "ЮВ",
    "18": "Ю",
    "22": "ЮЗ",
    "26": "З",
    "29": "ЗСЗ",
    "32": "СЗ",
    "36": "С"
  }[dd] || dd;
  return { direction: directionDesc, speed: `${ff} м/с` };
}

function decodeTemperatureGroup(group: string): string {
  const sn = group[1] === "1" ? "минус" : "+";
  const temp = parseInt(group.substring(2)) / 10;
  return `${sn}${temp} градусов`;
}

function decodeDewPointGroup(group: string): string {
  const sn = group[1] === "1" ? "минус" : "+";
  const temp = parseInt(group.substring(2)) / 10;
  return `${sn}${temp} градусов`;
}

function decodeVisibilityGroup(group: string): string {
  const vv = group[4] + group[5];
  const visibilityDesc = {
    "00": "менее 0.1 км",
    "10": "1 км",
    "50": "50 км",
    "89": "70 км и более"
  }[vv] || `${parseInt(vv)} км`;
  return visibilityDesc;
}

function decodePressureGroup(group: string): string {
  const pressure = parseInt(group.substring(1)) / 10 + 1000;
  return `${pressure} гПа`;
}

function decodePrecipitationGroup(group: string): string {
  const rrr = parseInt(group.substring(1, 4));
  const amount = rrr >= 990 ? (rrr - 990) / 10 : rrr;
  return `${amount} мм`;
}

// Декодирование сообщения
export function decodeMessage(input: string): WeatherMessage[] {
  if (input === lastInput && cachedMessages) {
    return cachedMessages;
  }

  const messages: WeatherMessage[] = [];
  const lines = input.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  let context: FSMContext = {
    state: State.INITIAL,
    message: {
      type: 'SafetyNet',
      date: '',
      sections: { header: [], part1: [], part3: [] },
      source: '',
    },
  };

  for (const line of lines) {
    const upperLine = line.toUpperCase();
    if (upperLine.startsWith('ZCZC')) {
      if (context.message.sections?.header.length || context.message.sections?.part1.length || context.message.sections?.part3.length) {
        messages.push(context.message);
      }
      context = {
        state: State.HEADER,
        message: {
          type: upperLine.match(/ZCZC\s+[A-Z]{2}\d{2}/) ? 'NAVTEX' : 'SafetyNet',
          date: '',
          sections: { header: [line], part1: [], part3: [] },
          source: '',
        },
      };
      continue;
    } else if (/^\d{5}\s+\d{6}\s*/i.test(upperLine)) {
      if (context.message.sections?.header.length || context.message.sections?.part1.length || context.message.sections?.part3.length) {
        messages.push(context.message);
      }
      context = {
        state: State.HEADER,
        message: {
          type: 'KN01',
          date: '',
          sections: { header: [line], part1: [], part3: [] },
          source: '',
        },
      };
      continue;
    }
    processLine(line, context);
  }

  if (context.message.sections?.header.length || context.message.sections?.part1.length || context.message.sections?.part3.length) {
    messages.push(context.message);
  }

  lastInput = input;
  cachedMessages = [...messages];
  return messages;
}

// Обработка строки конечным автоматом
function processLine(line: string, context: FSMContext): void {
  const upperLine = line.toUpperCase();

  const appendLine = (text: string, indentLevel: number = 1) => {
    if (!context.message.sections) context.message.sections = { header: [], part1: [], part3: [] };
    context.message.sections.header.push(`${' '.repeat(indentLevel * 2)}${text}`);
  };

  switch (context.state) {
    case State.INITIAL:
      break;

    case State.HEADER:
      if (context.message.type === 'SafetyNet') {
        if (upperLine.includes('GALE WARNING') || upperLine.includes('STORM WARNING') || upperLine.includes('CYCLONE WARNING')) {
          context.state = State.PART_1;
          context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: i18n.__('gale_warning'), speed: '' } };
        } else if (upperLine.includes('SYNOPSIS') || upperLine.includes('WEATHER SUMMARY')) {
          context.state = State.SYNOPSIS;
          context.message.sections!.part2 = { synopsis: { time: line.replace(/^SYNOPSIS AT\s+/, ''), pressures: [] } };
        } else if (upperLine.includes('FORECAST') && context.message.sections!.part1.length === 0) {
          context.state = State.PART_3;
          context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
        } else if (upperLine.includes('WINDS') || upperLine.includes('SECOND HALF NIGHT')) {
          context.state = State.PART_1;
          context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          if (upperLine.includes('WINDS')) {
            const windMatch = line.match(/WINDS\s+((?:[A-Z]{1,2}\s+)*[A-Z]{1,2})(?=\s+(?:\d|GUSTS|$))(?:\s+(\d+\s*(?:TO\s*\d+)?\s*MS))?(?:\s+GUSTS\s*(\d+\s*(?:TO\s*\d+)?\s*MS))?/i);
            if (windMatch) {
              const speed = windMatch[2] || windMatch[3] || '';
              context.currentForecast.wind = {
                direction: windMatch[1].trim(),
                speed,
                gusts: windMatch[3] || undefined,
              };
              appendLine(i18n.__('wind') + `: ${windMatch[1]} ${speed}${windMatch[3] ? ` ${i18n.__('gusts')} ${windMatch[3]}` : ''} ${i18n.__('ms')}`);
            }
          } else {
            context.currentForecast.timeRange = { from: i18n.__(line.trim().toLowerCase()), to: '' };
            appendLine(i18n.__('time_range', { from: i18n.__(line.trim().toLowerCase()), to: '' }));
          }
        } else if (upperLine.includes('NAVAREA') || upperLine.includes('METAREA')) {
          context.message.sections!.header.push(line);
          appendLine(`${i18n.__('navarea')}: ${line}`);
        } else if (upperLine.includes('PIRACY WARNING') || upperLine.includes('SAR ALERT')) {
          context.state = State.PART_1;
          context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          appendLine(i18n.__('warning_type', { type: line }));
        } else if (upperLine === 'NNNN') {
          context.state = State.INITIAL;
        } else if (/^\d{6}\s+UTC\s+[A-Z]{3}\s+\d{2}$/.test(upperLine)) {
          context.message.date = line;
          context.message.sections!.header.push(line);
        } else {
          context.message.sections!.header.push(line);
          if (upperLine.includes('ISSUED BY')) {
            context.message.source = line.replace(/^ISSUED\s+BY\s*/i, '');
          }
        }
      } else if (context.message.type === 'KN01') {
        if (/^\d{5}\s+\d{6}\s*/i.test(upperLine)) {
          context.message.date = line;
          context.message.sections!.header.push(line);
          context.currentForecast = {
            stationCodes: [line.split(/\s+/)[0]],
            timeRange: { from: '', to: '' },
            wind: { direction: '', speed: '' },
          };
          context.state = State.PART_1;
          appendLine(`${i18n.__('station')}: ${stations[line.split(/\s+/)[0]] || i18n.__('unknown_station', { code: line.split(/\s+/)[0] })}`);
        } else {
          context.message.sections!.header.push(line);
        }
      } else if (context.message.type === 'NAVTEX') {
        if (upperLine.includes('GALE') || upperLine.includes('STORM') || upperLine.includes('CYCLONE')) {
          context.state = State.PART_1;
          context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          const windMatch = line.match(/(?:GALE|STORM|CYCLONE)\s+.*?WIND\s+([A-Z\s\/]+)\s+(\d+\s*(?:TO\s*\d+)?\s*KT)/i);
          if (windMatch) {
            context.currentForecast.wind = {
              direction: windMatch[1].trim(),
              speed: windMatch[2].trim(),
              gusts: undefined,
            };
            appendLine(i18n.__('wind') + `: ${windMatch[1]} ${windMatch[2]}`);
          }
          appendLine(i18n.__('warning_type', { type: line }));
        } else if (/^\d{6}\s+UTC/.test(upperLine)) {
          context.message.date = line;
          context.message.sections!.header.push(line);
        } else if (upperLine.includes('NAVAREA') || upperLine.includes('METAREA')) {
          context.message.sections!.header.push(line);
          appendLine(`${i18n.__('navarea')}: ${line}`);
        } else {
          context.message.sections!.header.push(line);
          if (upperLine.includes('ISSUED')) {
            context.message.source = line.replace(/^ISSUED\s+BY\s*/i, '');
          }
        }
      }
      break;

    case State.PART_1:
      if (context.message.type === 'SafetyNet') {
        if (upperLine.includes('SYNOPSIS') || upperLine.includes('PART 2')) {
          if (context.currentForecast && (context.currentForecast.wind.speed || context.currentForecast.wind.gusts || context.currentForecast.timeRange.from || context.currentForecast.seas)) {
            context.message.sections!.part1.push(context.currentForecast);
            context.currentForecast = undefined;
          }
          context.state = State.SYNOPSIS;
          context.message.sections!.part2 = { synopsis: { time: line.replace(/^SYNOPSIS AT\s+/, ''), pressures: [] } };
        } else if (upperLine.includes('GALE WARNING') || upperLine.includes('STORM WARNING') || upperLine.includes('CYCLONE WARNING')) {
          if (context.currentForecast && (context.currentForecast.wind.speed || context.currentForecast.wind.gusts || context.currentForecast.timeRange.from || context.currentForecast.seas)) {
            context.message.sections!.part1.push(context.currentForecast);
          }
          context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: i18n.__('gale_warning'), speed: '' } };
        } else if (/^\d{5}(,\s*\d{5})*/.test(line)) {
          context.currentStationCodes = line.split(',').map(code => code.trim());
          if (context.currentForecast) {
            context.currentForecast.stationCodes = context.currentStationCodes;
          } else {
            context.currentForecast = { stationCodes: context.currentStationCodes, timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
        } else if (upperLine.startsWith('FROM') || (upperLine.includes('SECOND HALF NIGHT') && !upperLine.includes('GUSTS'))) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          let from = line.trim();
          let to = '';
          if (upperLine.startsWith('FROM')) {
            const timeMatch = line.match(/^FROM\s+(.+?)\s+TO\s+(.+)/i);
            if (timeMatch) {
              from = timeMatch[1].trim();
              to = timeMatch[2].trim();
            }
          } else {
            from = line.trim();
          }
          context.currentForecast.timeRange = { from: i18n.__(from.toLowerCase()), to: to ? i18n.__(to.toLowerCase()) : '' };
          appendLine(i18n.__('time_range', { from: i18n.__(from.toLowerCase()), to: to ? i18n.__(to.toLowerCase()) : '' }));
        } else if (/SECOND HALF NIGHT|FIRST HALF DAY/i.test(upperLine)) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.timeRange = { from: i18n.__(line.trim().toLowerCase()), to: '' };
          appendLine(i18n.__('time_range', { from: i18n.__(line.trim().toLowerCase()), to: '' }));
        } else if (upperLine.includes('WINDS')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          const windMatch = line.match(/WINDS\s+((?:[A-Z]{1,2}\s+)*[A-Z]{1,2})(?=\s+(?:\d|GUSTS|$))(?:\s+(\d+\s*(?:TO\s*\d+)?\s*MS))?(?:\s+GUSTS\s*(\d+\s*(?:TO\s*\d+)?\s*MS))?/i);
          if (windMatch) {
            const speed = windMatch[2] || windMatch[3] || '';
            context.currentForecast.wind = {
              direction: windMatch[1].trim(),
              speed,
              gusts: windMatch[3] || undefined,
            };
            appendLine(i18n.__('wind') + `: ${windMatch[1]} ${speed}${windMatch[3] ? ` ${i18n.__('gusts')} ${windMatch[3]}` : ''} ${i18n.__('ms')}`);
          }
        } else if (upperLine.includes('HEIGHT OF WAVES')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.seas = line.replace(/^HEIGHT OF WAVES\s+/, '');
          appendLine(i18n.__('seas') + `: ${context.currentForecast.seas}`);
        } else if (upperLine.includes('TEMP')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.temperature = line.replace(/^TEMPERATURE OF\s+(?:AIR\s+)?/, '').replace(/MINUS/, i18n.__('minus')).replace(/DEGREES/, i18n.__('degrees'));
          appendLine(i18n.__('temperature') + `: ${context.currentForecast.temperature}`);
        } else if (upperLine.includes('VIS')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.visibility = line.replace(/^VIS\s+/, '').replace(/LOCALLY/, i18n.__('locally')).replace(/FOG/, i18n.__('fog'));
          appendLine(i18n.__('visibility') + `: ${context.currentForecast.visibility}`);
        } else if (upperLine.includes('ICE ACCRETION')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.iceAccretion = line.replace(/^ICE ACCRETION\s+/, '');
          appendLine(i18n.__('ice_accretion') + `: ${context.currentForecast.iceAccretion}`);
        } else if (upperLine === 'NNNN') {
          if (context.currentForecast && (context.currentForecast.wind.speed || context.currentForecast.wind.gusts || context.currentForecast.timeRange.from || context.currentForecast.seas)) {
            context.message.sections!.part1.push(context.currentForecast);
            context.currentForecast = undefined;
          }
          context.state = State.INITIAL;
        } else if (upperLine.includes('PETER THE GREAT GULF') || upperLine.includes('REGION')) {
          if (context.currentForecast) {
            const hasOtherData = context.currentForecast.wind.speed || context.currentForecast.wind.gusts || context.currentForecast.seas || context.currentForecast.temperature || context.currentForecast.visibility;
            if (!hasOtherData && context.currentForecast.timeRange.from && !context.currentForecast.region) {
              context.currentForecast.region = line;
            } else {
              if (context.currentForecast.wind.speed || context.currentForecast.wind.gusts || context.currentForecast.timeRange.from || context.currentForecast.seas || context.currentForecast.temperature || context.currentForecast.visibility) {
                context.message.sections!.part1.push(context.currentForecast);
              }
              context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' }, region: line };
            }
          } else {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' }, region: line };
          }
          appendLine(i18n.__('region') + `: ${i18n.__(line.toLowerCase())}`);
        } else if (upperLine.match(/\d{2,4}[NS]\s+\d{3,5}[EW]/i)) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.region = line;
          appendLine(i18n.__('coordinates') + `: ${line}`);
        }
      } else if (context.message.type === 'KN01') {
        if (upperLine.match(/^\d{5}$/)) {
          if (context.currentForecast && (context.currentForecast.wind.speed || context.currentForecast.seas || context.currentForecast.temperature || context.currentForecast.visibility || context.currentForecast.pressure || context.currentForecast.precipitation)) {
            context.message.sections!.part1.push(context.currentForecast);
            context.currentForecast = undefined;
          }
          context.currentForecast = { stationCodes: [line], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          appendLine(`${i18n.__('station')}: ${stations[line] || i18n.__('unknown_station', { code: line })}`);
        } else if (upperLine.includes('WIND')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          const windMatch = line.match(/WIND\s+([A-Z]{1,2})\s+(\d+\s*(?:TO\s*\d+)?\s*MS)/i);
          if (windMatch) {
            context.currentForecast.wind = {
              direction: windMatch[1].trim(),
              speed: windMatch[2].trim(),
              gusts: undefined,
            };
            appendLine(i18n.__('wind') + `: ${windMatch[1]} ${windMatch[2]} ${i18n.__('ms')}`);
          }
        } else if (upperLine.includes('WAVES')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          const wavesMatch = line.match(/WAVES\s+(\d+(?:,\d+)?)\s*TO\s*(\d+(?:,\d+)?)\s*M/i);
          if (wavesMatch) {
            context.currentForecast.seas = `${wavesMatch[1]} TO ${wavesMatch[2]} M`;
            appendLine(i18n.__('seas') + `: ${wavesMatch[1]} до ${wavesMatch[2]} м`);
          }
        } else if (upperLine.includes('TEMP')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.temperature = decodeTemperatureGroup(line.replace(/^TEMPERATURE\s+/, ''));
          appendLine(i18n.__('temperature') + `: ${context.currentForecast.temperature}`);
        } else if (upperLine.includes('VIS')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.visibility = decodeVisibilityGroup(line.replace(/^VIS\s+/, ''));
          appendLine(i18n.__('visibility') + `: ${context.currentForecast.visibility}`);
        } else if (upperLine.includes('333') || upperLine.includes('555')) {
          if (context.currentForecast && (context.currentForecast.wind.speed || context.currentForecast.seas || context.currentForecast.temperature || context.currentForecast.visibility || context.currentForecast.pressure || context.currentForecast.precipitation)) {
            context.message.sections!.part1.push(context.currentForecast);
            context.currentForecast = undefined;
          }
          context.state = upperLine.includes('333') ? State.PART_3 : State.PART_1;
          appendLine(`Секция: ${upperLine}`);
        } else if (upperLine === 'NNNN') {
          if (context.currentForecast && (context.currentForecast.wind.speed || context.currentForecast.seas || context.currentForecast.temperature || context.currentForecast.visibility || context.currentForecast.pressure || context.currentForecast.precipitation)) {
            context.message.sections!.part1.push(context.currentForecast);
            context.currentForecast = undefined;
          }
          context.state = State.INITIAL;
        } else if (upperLine.match(/^\d{5}$/)) {
          const group = line;
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          switch (group[0]) {
            case '1':
              if (group.startsWith('11')) {
                context.currentForecast.temperature = decodeTemperatureGroup(group);
                appendLine(i18n.__('temperature') + `: ${context.currentForecast.temperature}`);
              } else if (group.startsWith('12')) {
                appendLine(`Точка росы: ${decodeDewPointGroup(group)}`);
              } else {
                context.currentForecast.visibility = decodeVisibilityGroup(group);
                appendLine(i18n.__('visibility') + `: ${context.currentForecast.visibility}`);
              }
              break;
            case '2':
              const wind = decodeWMOGroup(group);
              context.currentForecast.wind = {
                direction: wind.direction,
                speed: wind.speed,
                gusts: undefined,
              };
              appendLine(i18n.__('wind') + `: ${wind.direction} ${wind.speed}`);
              break;
            case '3':
              context.currentForecast.pressure = decodePressureGroup(group);
              appendLine(i18n.__('pressure') + `: ${context.currentForecast.pressure}`);
              break;
            case '6':
              context.currentForecast.precipitation = decodePrecipitationGroup(group);
              appendLine(i18n.__('precipitation') + `: ${context.currentForecast.precipitation}`);
              break;
            default:
              appendLine(`Группа: ${group} (не обработана)`);
          }
        }
      } else if (context.message.type === 'NAVTEX') {
        if (upperLine.includes('WIND')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          const windMatch = line.match(/WIND\s+([A-Z\s\/]+)\s+(\d+\s*(?:TO\s*\d+)?\s*KT)/i);
          if (windMatch) {
            context.currentForecast.wind = {
              direction: windMatch[1].trim(),
              speed: windMatch[2].trim(),
              gusts: undefined,
            };
            appendLine(i18n.__('wind') + `: ${windMatch[1]} ${windMatch[2]}`);
          }
        } else if (upperLine.includes('HEIGHT OF WAVES')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.seas = line.replace(/^HEIGHT OF WAVES\s+/, '');
          appendLine(i18n.__('seas') + `: ${context.currentForecast.seas}`);
        } else if (upperLine.includes('COORDINATES') || upperLine.match(/\d{2,4}[NS]\s+\d{3,5}[EW]/i)) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.region = line;
          appendLine(i18n.__('coordinates') + `: ${line}`);
        } else if (upperLine === 'NNNN') {
          if (context.currentForecast && (context.currentForecast.wind.speed || context.currentForecast.seas || context.currentForecast.region)) {
            context.message.sections!.part1.push(context.currentForecast);
            context.currentForecast = undefined;
          }
          context.state = State.INITIAL;
        } else {
          appendLine(line);
        }
      }
      break;

    case State.PART_2:
      if (context.message.type === 'SafetyNet') {
        if (upperLine.includes('SYNOPSIS')) {
          context.state = State.SYNOPSIS;
          context.currentSynopsis = { time: line.replace(/^SYNOPSIS AT\s+/, ''), pressures: [] };
        } else if (upperLine.includes('ICE')) {
          context.state = State.ICE_REPORT;
          context.currentIceReport = { region: '', direction: '', coordinates: [] };
          const iceMatch = line.match(/ICE\s+([A-Z\/]+)\s+(.+)/i);
          if (iceMatch) {
            context.currentIceReport.direction = iceMatch[1];
            context.currentIceReport.coordinates.push(iceMatch[2]);
            appendLine(i18n.__('ice_direction', { direction: iceMatch[1] }) + `: ${iceMatch[2]}`);
          }
        } else if (upperLine.includes('FORECAST') || upperLine.includes('PART 3')) {
          context.state = State.PART_3;
          context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
        } else if (upperLine === 'NNNN') {
          context.state = State.INITIAL;
        } else {
          context.message.sections!.part2 = context.message.sections!.part2 || { synopsis: { time: '', pressures: [] } };
          context.message.sections!.part2.synopsis!.pressures.push({
            type: upperLine.includes('LOW') ? 'LOW' : upperLine.includes('HIGH') ? 'HIGH' : 'INFO',
            hpa: '',
            position: line,
            movement: upperLine.includes('MOVING') ? line.match(/MOVING\s+(.+)/i)?.[1] : undefined,
          });
          appendLine(line);
        }
      }
      break;

    case State.SYNOPSIS:
      if (context.message.type === 'SafetyNet') {
        if (upperLine.includes('FORECAST') || upperLine.includes('PART 3')) {
          context.state = State.PART_3;
          context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
        } else if (upperLine.includes('ICE')) {
          context.message.sections!.part2 = context.message.sections!.part2 || { synopsis: { time: '', pressures: [] } };
          context.message.sections!.part2.synopsis = context.currentSynopsis;
          context.currentSynopsis = undefined;
          context.state = State.ICE_REPORT;
          context.currentIceReport = { region: '', direction: '', coordinates: [] };
          const iceMatch = line.match(/ICE\s+([A-Z\/]+)\s+(.+)/i);
          if (iceMatch) {
            context.currentIceReport.direction = iceMatch[1];
            context.currentIceReport.coordinates.push(iceMatch[2]);
            appendLine(i18n.__('ice_direction', { direction: iceMatch[1] }) + `: ${iceMatch[2]}`);
          }
        } else if (upperLine === 'NNNN') {
          context.state = State.INITIAL;
        } else {
          context.message.sections!.part2 = context.message.sections!.part2 || { synopsis: { time: '', pressures: [] } };
          context.message.sections!.part2.synopsis!.pressures.push({
            type: upperLine.includes('LOW') ? 'LOW' : upperLine.includes('HIGH') ? 'HIGH' : 'INFO',
            hpa: '',
            position: line,
            movement: upperLine.includes('MOVING') ? line.match(/MOVING\s+(.+)/i)?.[1] : undefined,
          });
          appendLine(line);
        }
      }
      break;

    case State.ICE_REPORT:
      if (context.message.type === 'SafetyNet') {
        if (upperLine.includes('PART 3') || upperLine.includes('FORECAST')) {
          context.message.sections!.part2 = context.message.sections!.part2 || { synopsis: { time: '', pressures: [] }, iceReports: [] };
          context.message.sections!.part2.iceReports!.push(context.currentIceReport!);
          context.currentIceReport = undefined;
          context.state = State.PART_3;
          context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
        } else if (upperLine.match(/^[A-Z0-9-]+$/)) {
          context.currentIceReport!.region = line;
          appendLine(i18n.__('ice') + ` ${line}`);
        } else if (upperLine.includes('ICE N') || upperLine.includes('ICE S') || upperLine.includes('ICE E') || upperLine.includes('ICE SW')) {
          const iceMatch = line.match(/ICE\s+([A-Z\/]+)\s+(.+)/i);
          if (iceMatch) {
            context.currentIceReport!.direction = iceMatch[1];
            context.currentIceReport!.coordinates.push(iceMatch[2]);
            appendLine(i18n.__('ice_direction', { direction: iceMatch[1] }) + `: ${iceMatch[2]}`);
          }
        } else if (upperLine.includes('WINDS')) {
          context.message.sections!.part2 = context.message.sections!.part2 || { synopsis: { time: '', pressures: [] }, iceReports: [] };
          context.message.sections!.part2.iceReports!.push(context.currentIceReport!);
          context.currentIceReport = undefined;
          context.state = State.FORECAST;
          context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          const windMatch = line.match(/WINDS\s+((?:[A-Z]{1,2}\s+)*[A-Z]{1,2})(?=\s+(?:\d|GUSTS|$))(?:\s+(\d+\s*(?:TO\s*\d+)?\s*MS))?(?:\s+GUSTS\s*(\d+\s*(?:TO\s*\d+)?\s*MS))?/i);
          if (windMatch) {
            const speed = windMatch[2] || windMatch[3] || '';
            context.currentForecast.wind = {
              direction: windMatch[1].trim(),
              speed,
              gusts: windMatch[3] || undefined,
            };
            appendLine(i18n.__('wind') + `: ${windMatch[1]} ${speed}${windMatch[3] ? ` ${i18n.__('gusts')} ${windMatch[3]}` : ''} ${i18n.__('ms')}`);
          }
        } else if (upperLine === 'NNNN') {
          context.message.sections!.part2 = context.message.sections!.part2 || { synopsis: { time: '', pressures: [] }, iceReports: [] };
          context.message.sections!.part2.iceReports!.push(context.currentIceReport!);
          context.currentIceReport = undefined;
          context.state = State.INITIAL;
        }
      }
      break;

    case State.PART_3:
      if (context.message.type === 'SafetyNet') {
        if (/^\d{5}(,\s*\d{5})*/.test(line)) {
          context.currentStationCodes = line.split(',').map(code => code.trim());
          if (context.currentForecast) {
            context.currentForecast.stationCodes = context.currentStationCodes;
          } else {
            context.currentForecast = { stationCodes: context.currentStationCodes, timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
        } else if (upperLine.includes('WINDS')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          const windMatch = line.match(/WINDS\s+((?:[A-Z]{1,2}\s+)*[A-Z]{1,2})(?=\s+(?:\d|GUSTS|$))(?:\s+(\d+\s*(?:TO\s*\d+)?\s*MS))?(?:\s+GUSTS\s*(\d+\s*(?:TO\s*\d+)?\s*MS))?/i);
          if (windMatch) {
            const speed = windMatch[2] || windMatch[3] || '';
            context.currentForecast.wind = {
              direction: windMatch[1].trim(),
              speed,
              gusts: windMatch[3] || undefined,
            };
            appendLine(i18n.__('wind') + `: ${windMatch[1]} ${speed}${windMatch[3] ? ` ${i18n.__('gusts')} ${windMatch[3]}` : ''} ${i18n.__('ms')}`);
          }
        } else if (upperLine.includes('HEIGHT OF WAVES')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.seas = line.replace(/^HEIGHT OF WAVES\s+/, '');
          appendLine(i18n.__('seas') + `: ${context.currentForecast.seas}`);
        } else if (upperLine.includes('TEMP')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.temperature = line.replace(/^TEMPERATURE OF\s+(?:AIR\s+)?/, '').replace(/MINUS/, i18n.__('minus')).replace(/DEGREES/, i18n.__('degrees'));
          appendLine(i18n.__('temperature') + `: ${context.currentForecast.temperature}`);
        } else if (upperLine.includes('VIS')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.visibility = line.replace(/^VIS\s+/, '').replace(/LOCALLY/, i18n.__('locally')).replace(/FOG/, i18n.__('fog'));
          appendLine(i18n.__('visibility') + `: ${context.currentForecast.visibility}`);
        } else if (upperLine.includes('ICE ACCRETION')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.iceAccretion = line.replace(/^ICE ACCRETION\s+/, '');
          appendLine(i18n.__('ice_accretion') + `: ${context.currentForecast.iceAccretion}`);
        } else if (upperLine === 'NNNN') {
          if (context.currentForecast && (context.currentForecast.wind.speed || context.currentForecast.wind.gusts || context.currentForecast.seas || context.currentForecast.temperature || context.currentForecast.visibility || context.currentForecast.timeRange.from)) {
            if (context.message.sections!.part3) {
              context.message.sections!.part3.push(context.currentForecast);
            } else {
              context.message.sections!.part1.push(context.currentForecast);
            }
            context.currentForecast = undefined;
            context.currentStationCodes = undefined;
          }
          context.state = State.INITIAL;
        } else if (upperLine.startsWith('FROM') || (upperLine.includes('SECOND HALF NIGHT') && !upperLine.includes('GUSTS'))) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          let from = line.trim();
          let to = '';
          if (upperLine.startsWith('FROM')) {
            const timeMatch = line.match(/^FROM\s+(.+?)\s+TO\s+(.+)/i);
            if (timeMatch) {
              from = timeMatch[1].trim();
              to = timeMatch[2].trim();
            }
          } else {
            from = line.trim();
          }
          context.currentForecast.timeRange = { from: i18n.__(from.toLowerCase()), to: to ? i18n.__(to.toLowerCase()) : '' };
          appendLine(i18n.__('time_range', { from: i18n.__(from.toLowerCase()), to: to ? i18n.__(to.toLowerCase()) : '' }));
        } else if (/SECOND HALF NIGHT|FIRST HALF DAY/i.test(upperLine)) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.timeRange = { from: i18n.__(line.trim().toLowerCase()), to: '' };
          appendLine(i18n.__('time_range', { from: i18n.__(line.trim().toLowerCase()), to: '' }));
        } else if (upperLine.includes('PETER THE GREAT GULF') || upperLine.includes('REGION')) {
          if (context.currentForecast) {
            const hasOtherData = context.currentForecast.wind.speed || context.currentForecast.wind.gusts || context.currentForecast.seas || context.currentForecast.temperature || context.currentForecast.visibility;
            if (!hasOtherData && context.currentForecast.timeRange.from && !context.currentForecast.region) {
              context.currentForecast.region = line;
            } else {
              if (context.currentForecast.wind.speed || context.currentForecast.wind.gusts || context.currentForecast.timeRange.from || context.currentForecast.seas || context.currentForecast.temperature || context.currentForecast.visibility) {
                if (context.message.sections!.part3) {
                  context.message.sections!.part3.push(context.currentForecast);
                } else {
                  context.message.sections!.part1.push(context.currentForecast);
                }
              }
              context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' }, region: line };
            }
            appendLine(i18n.__('region') + `: ${i18n.__(line.toLowerCase())}`);
          } else {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' }, region: line };
            appendLine(i18n.__('region') + `: ${i18n.__(line.toLowerCase())}`);
          }
        }
      } else if (context.message.type === 'KN01') {
        if (upperLine.match(/^\d{5}$/)) {
          if (context.currentForecast && (context.currentForecast.wind.speed || context.currentForecast.seas || context.currentForecast.temperature || context.currentForecast.visibility || context.currentForecast.pressure || context.currentForecast.precipitation)) {
            context.message.sections!.part1.push(context.currentForecast);
            context.currentForecast = undefined;
          }
          context.currentForecast = { stationCodes: [line], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          appendLine(`${i18n.__('station')}: ${stations[line] || i18n.__('unknown_station', { code: line })}`);
        } else if (upperLine.includes('WIND')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          const windMatch = line.match(/WIND\s+([A-Z]{1,2})\s+(\d+\s*(?:TO\s*\d+)?\s*MS)/i);
          if (windMatch) {
            context.currentForecast.wind = {
              direction: windMatch[1].trim(),
              speed: windMatch[2].trim(),
              gusts: undefined,
            };
            appendLine(i18n.__('wind') + `: ${windMatch[1]} ${windMatch[2]} ${i18n.__('ms')}`);
          }
        } else if (upperLine.includes('WAVES')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          const wavesMatch = line.match(/WAVES\s+(\d+(?:,\d+)?)\s*TO\s*(\d+(?:,\d+)?)\s*M/i);
          if (wavesMatch) {
            context.currentForecast.seas = `${wavesMatch[1]} TO ${wavesMatch[2]} M`;
            appendLine(i18n.__('seas') + `: ${wavesMatch[1]} до ${wavesMatch[2]} м`);
          }
        } else if (upperLine.includes('TEMP')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.temperature = decodeTemperatureGroup(line.replace(/^TEMPERATURE\s+/, ''));
          appendLine(i18n.__('temperature') + `: ${context.currentForecast.temperature}`);
        } else if (upperLine.includes('VIS')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.visibility = decodeVisibilityGroup(line.replace(/^VIS\s+/, ''));
          appendLine(i18n.__('visibility') + `: ${context.currentForecast.visibility}`);
        } else if (upperLine.includes('333') || upperLine.includes('555')) {
          if (context.currentForecast && (context.currentForecast.wind.speed || context.currentForecast.seas || context.currentForecast.temperature || context.currentForecast.visibility || context.currentForecast.pressure || context.currentForecast.precipitation)) {
            context.message.sections!.part1.push(context.currentForecast);
            context.currentForecast = undefined;
          }
          context.state = upperLine.includes('333') ? State.PART_3 : State.PART_1;
          appendLine(`Секция: ${upperLine}`);
        } else if (upperLine.match(/^\d{5}$/) && context.state !== State.HEADER) {
          const group = line;
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          switch (group[0]) {
            case '1':
              if (group.startsWith('11')) {
                context.currentForecast.temperature = decodeTemperatureGroup(group);
                appendLine(i18n.__('temperature') + `: ${context.currentForecast.temperature}`);
              } else if (group.startsWith('12')) {
                appendLine(`Точка росы: ${decodeDewPointGroup(group)}`);
              } else {
                context.currentForecast.visibility = decodeVisibilityGroup(group);
                appendLine(i18n.__('visibility') + `: ${context.currentForecast.visibility}`);
              }
              break;
            case '2':
              const wind = decodeWMOGroup(group);
              context.currentForecast.wind = {
                direction: wind.direction,
                speed: wind.speed,
                gusts: undefined,
              };
              appendLine(i18n.__('wind') + `: ${wind.direction} ${wind.speed}`);
              break;
            case '3':
              context.currentForecast.pressure = decodePressureGroup(group);
              appendLine(i18n.__('pressure') + `: ${context.currentForecast.pressure}`);
              break;
            case '6':
              context.currentForecast.precipitation = decodePrecipitationGroup(group);
              appendLine(i18n.__('precipitation') + `: ${context.currentForecast.precipitation}`);
              break;
            default:
              appendLine(`Группа: ${group} (не обработана)`);
          }
        } else if (upperLine === 'NNNN') {
          if (context.currentForecast && (context.currentForecast.wind.speed || context.currentForecast.seas || context.currentForecast.temperature || context.currentForecast.visibility || context.currentForecast.pressure || context.currentForecast.precipitation)) {
            context.message.sections!.part1.push(context.currentForecast);
            context.currentForecast = undefined;
          }
          context.state = State.INITIAL;
        }
      } else if (context.message.type === 'NAVTEX') {
        if (upperLine.includes('WIND')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          const windMatch = line.match(/WIND\s+([A-Z\s\/]+)\s+(\d+\s*(?:TO\s*\d+)?\s*KT)/i);
          if (windMatch) {
            context.currentForecast.wind = {
              direction: windMatch[1].trim(),
              speed: windMatch[2].trim(),
              gusts: undefined,
            };
            appendLine(i18n.__('wind') + `: ${windMatch[1]} ${windMatch[2]}`);
          }
        } else if (upperLine.includes('HEIGHT OF WAVES')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.seas = line.replace(/^HEIGHT OF WAVES\s+/, '');
          appendLine(i18n.__('seas') + `: ${context.currentForecast.seas}`);
        } else if (upperLine.includes('COORDINATES') || upperLine.match(/\d{2,4}[NS]\s+\d{3,5}[EW]/i)) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.region = line;
          appendLine(i18n.__('coordinates') + `: ${line}`);
        } else if (upperLine === 'NNNN') {
          if (context.currentForecast && (context.currentForecast.wind.speed || context.currentForecast.seas || context.currentForecast.region)) {
            context.message.sections!.part1.push(context.currentForecast);
            context.currentForecast = undefined;
          }
          context.state = State.INITIAL;
        } else {
          appendLine(line);
        }
      }
      break;

    case State.FORECAST:
      if (context.message.type === 'SafetyNet') {
        if (upperLine.includes('WINDS')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          const windMatch = line.match(/WINDS\s+((?:[A-Z]{1,2}\s+)*[A-Z]{1,2})(?=\s+(?:\d|GUSTS|$))(?:\s+(\d+\s*(?:TO\s*\d+)?\s*MS))?(?:\s+GUSTS\s*(\d+\s*(?:TO\s*\d+)?\s*MS))?/i);
          if (windMatch) {
            const speed = windMatch[2] || windMatch[3] || '';
            context.currentForecast.wind = {
              direction: windMatch[1].trim(),
              speed,
              gusts: windMatch[3] || undefined,
            };
            appendLine(i18n.__('wind') + `: ${windMatch[1]} ${speed}${windMatch[3] ? ` ${i18n.__('gusts')} ${windMatch[3]}` : ''} ${i18n.__('ms')}`);
          }
        } else if (upperLine.includes('TEMP')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.temperature = line.replace(/^TEMPERATURE OF\s+(?:AIR\s+)?/, '').replace(/MINUS/, i18n.__('minus')).replace(/DEGREES/, i18n.__('degrees'));
          appendLine(i18n.__('temperature') + `: ${context.currentForecast.temperature}`);
        } else if (upperLine.includes('VIS')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.visibility = line.replace(/^VIS\s+/, '').replace(/LOCALLY/, i18n.__('locally')).replace(/FOG/, i18n.__('fog'));
          appendLine(i18n.__('visibility') + `: ${context.currentForecast.visibility}`);
        } else if (upperLine.includes('HEIGHT OF WAVES')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.seas = line.replace(/^HEIGHT OF WAVES\s+/, '');
          appendLine(i18n.__('seas') + `: ${context.currentForecast.seas}`);
        } else if (upperLine.includes('ICE ACCRETION')) {
          if (!context.currentForecast) {
            context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
          context.currentForecast.iceAccretion = line.replace(/^ICE ACCRETION\s+/, '');
          appendLine(i18n.__('ice_accretion') + `: ${context.currentForecast.iceAccretion}`);
        } else if (/^\d{5}(,\s*\d{5})*/.test(line) || upperLine === 'NNNN') {
          if (context.currentForecast && (context.currentForecast.wind.speed || context.currentForecast.wind.gusts || context.currentForecast.seas || context.currentForecast.temperature || context.currentForecast.visibility || context.currentForecast.timeRange.from)) {
            if (context.message.sections!.part3) {
              context.message.sections!.part3.push(context.currentForecast);
            } else {
              context.message.sections!.part1.push(context.currentForecast);
            }
            context.currentForecast = undefined;
            context.currentStationCodes = undefined;
          }
          if (upperLine === 'NNNN') {
            context.state = State.INITIAL;
          } else {
            context.currentStationCodes = line.split(',').map(code => code.trim());
            context.currentForecast = { stationCodes: context.currentStationCodes, timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
          }
        } else if (upperLine.includes('PETER THE GREAT GULF') || upperLine.includes('REGION')) {
          if (context.currentForecast && (context.currentForecast.wind.speed || context.currentForecast.wind.gusts || context.currentForecast.seas || context.currentForecast.temperature || context.currentForecast.visibility || context.currentForecast.timeRange.from)) {
            if (context.message.sections!.part3) {
              context.message.sections!.part3.push(context.currentForecast);
            } else {
              context.message.sections!.part1.push(context.currentForecast);
            }
          }
          context.currentForecast = { stationCodes: [], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' }, region: line };
          appendLine(i18n.__('region') + `: ${i18n.__(line.toLowerCase())}`);
        }
      }
      break;

    case State.END:
      if (upperLine.startsWith('ZCZC')) {
        context.state = State.HEADER;
        context.message.sections!.header = [line];
      }
      break;
  }
}

// Декодирование КН-01
function decodeKN01(lines: string[], context: FSMContext): WeatherMessage {
  context.message.type = 'KN01';
  let currentForecast: Forecast | undefined = undefined;
  for (const line of lines) {
    const upperLine = line.toUpperCase();
    if (/^\d{5}\s+\d{6}\s*/i.test(upperLine)) {
      context.message.date = line;
      context.message.sections!.header.push(line);
      currentForecast = {
        stationCodes: [line.split(/\s+/)[0]],
        timeRange: { from: '', to: '' },
        wind: { direction: '', speed: '' },
      };
    } else if (upperLine.match(/^\d{5}$/)) {
      if (currentForecast && (currentForecast.wind.speed || currentForecast.seas || currentForecast.temperature || currentForecast.visibility || currentForecast.pressure || currentForecast.precipitation)) {
        context.message.sections!.part1.push(currentForecast);
      }
      currentForecast = { stationCodes: [line], timeRange: { from: '', to: '' }, wind: { direction: '', speed: '' } };
      context.message.sections!.header.push(`${i18n.__('station')}: ${stations[line] || i18n.__('unknown_station', { code: line })}`);
    } else if (upperLine.includes('333') || upperLine.includes('555')) {
      if (currentForecast && (currentForecast.wind.speed || currentForecast.seas || currentForecast.temperature || currentForecast.visibility || currentForecast.pressure || currentForecast.precipitation)) {
        context.message.sections!.part1.push(currentForecast);
        currentForecast = undefined;
      }
    }
  }
  if (currentForecast && (currentForecast.wind.speed || currentForecast.seas || currentForecast.temperature || currentForecast.visibility || currentForecast.pressure || currentForecast.precipitation)) {
    context.message.sections!.part1.push(currentForecast);
  }
  return context.message;
}

// Форматирование модели в текст
function formatMessage(messages: WeatherMessage[]): string {
  let output = '';

  const appendLine = (text: string, indentLevel: number = 0) => {
    output += `${' '.repeat(indentLevel * 2)}${text}\n`;
  };

  messages.forEach((message, index) => {
    appendLine(`=== ${i18n.__('data_type', { type: message.type })} ${index + 1} ===`);

    // Заголовок
    if (message.sections?.header) {
      appendLine(`=== ${i18n.__('header')} ===`);
      message.sections.header.forEach(line => {
        const translatedLine = line.toUpperCase().includes('ISSUED BY')
          ? `${i18n.__('issued_by')} ${line.replace(/^ISSUED\s+BY\s*/i, '')}`
          : line;
        appendLine(translatedLine, 1);
      });
    }

// Часть 1
      if (message.sections?.part1) {
        appendLine(`=== ${i18n.__('part_1')} ===`);
        message.sections.part1.forEach(forecast => {
          if (forecast.region) appendLine(i18n.__(forecast.region.toLowerCase()), 1);
          if (forecast.stationCodes.length) appendLine(`${forecast.stationCodes.join(', ')}`, 1);
          if (forecast.timeRange.from) {
            const to = forecast.timeRange.to ? ` по ${forecast.timeRange.to}` : '';
            appendLine(`${i18n.__('time_range', { from: forecast.timeRange.from, to })}`, 1);
          }
          if (forecast.wind.direction || forecast.wind.speed || forecast.wind.gusts) {
            appendLine(`${i18n.__('wind')}: ${forecast.wind.direction} ${forecast.wind.speed}${forecast.wind.gusts ? ` ${i18n.__('gusts')} ${forecast.wind.gusts}` : ''} ${i18n.__('ms')}`, 1);
          }
          if (forecast.temperature) appendLine(`${i18n.__('temperature')}: ${forecast.temperature}`, 1);
          if (forecast.visibility) appendLine(`${i18n.__('visibility')}: ${forecast.visibility}`, 1);
          if (forecast.seas) appendLine(`${i18n.__('seas')}: ${forecast.seas}`, 1);
          if (forecast.iceAccretion) appendLine(`${i18n.__('ice_accretion')}: ${forecast.iceAccretion}`, 1);
          if (forecast.pressure) appendLine(`${i18n.__('pressure')}: ${forecast.pressure}`, 1);
          if (forecast.precipitation) appendLine(`${i18n.__('precipitation')}: ${forecast.precipitation}`, 1);
        });
      }

      // Часть 2
      if (message.sections?.part2) {
        appendLine(`=== ${i18n.__('part_2')} ===`);
        if (message.sections.part2.synopsis) {
          appendLine(`${i18n.__('synopsis')} ${message.sections.part2.synopsis.time}`, 1);
          message.sections.part2.synopsis.pressures.forEach(pressure => {
            appendLine(`${i18n.__(pressure.type.toLowerCase())}: ${pressure.position}${pressure.movement ? `, ${i18n.__('movement')}: ${pressure.movement}` : ''}`, 2);
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
      if (message.sections?.part3.length > 0) {
        appendLine(`=== ${i18n.__('part_3')} ===`);
        message.sections.part3.forEach(forecast => {
          if (forecast.region) appendLine(i18n.__(forecast.region.toLowerCase()), 1);
          if (forecast.stationCodes.length) appendLine(`${forecast.stationCodes.join(', ')}`, 1);
          if (forecast.timeRange.from) {
            const to = forecast.timeRange.to ? ` по ${forecast.timeRange.to}` : '';
            appendLine(`${i18n.__('time_range', { from: forecast.timeRange.from, to })}`, 1);
          }
          if (forecast.wind.direction || forecast.wind.speed || forecast.wind.gusts) {
            appendLine(`${i18n.__('wind')}: ${forecast.wind.direction} ${forecast.wind.speed}${forecast.wind.gusts ? ` ${i18n.__('gusts')} ${forecast.wind.gusts}` : ''} ${i18n.__('ms')}`, 1);
          }
          if (forecast.temperature) appendLine(`${i18n.__('temperature')}: ${forecast.temperature}`, 1);
          if (forecast.visibility) appendLine(`${i18n.__('visibility')}: ${forecast.visibility}`, 1);
          if (forecast.seas) appendLine(`${i18n.__('seas')}: ${forecast.seas}`, 1);
          if (forecast.iceAccretion) appendLine(`${i18n.__('ice_accretion')}: ${forecast.iceAccretion}`, 1);
          if (forecast.pressure) appendLine(`${i18n.__('pressure')}: ${forecast.pressure}`, 1);
          if (forecast.precipitation) appendLine(`${i18n.__('precipitation')}: ${forecast.precipitation}`, 1);
        });
      }
    });
  });

  return output;
}

export { decodeMessage, decodeKN01, formatMessage };