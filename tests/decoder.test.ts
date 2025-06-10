import { decodeMessage } from '../src/decoder';
import { WeatherMessage, Forecast } from '../src/decoder';

describe('Decoder', () => {
  test('should decode wind with direction containing spaces and gusts', () => {
    const input = `ZCZC AE72
270828 UTC MAR 25
WINDS NW W 15 TO 18 MS GUSTS 15 TO 18 MS
NNNN`;
    const messages = decodeMessage(input);
    const forecast = messages[0]?.sections?.part1[0];
    expect(forecast?.wind).toEqual({
      direction: 'NW W',
      speed: '15 TO 18 MS',
      gusts: '15 TO 18 MS',
    });
  });

  test('should decode wind with speed and gusts', () => {
    const input = `ZCZC AE72
270828 UTC MAR 25
WINDS NW 15 TO 18 MS GUSTS 20 MS
NNNN`;
    const messages = decodeMessage(input);
    const forecast = messages[0]?.sections?.part1[0];
    expect(forecast?.wind).toEqual({
      direction: 'NW',
      speed: '15 TO 18 MS',
      gusts: '20 MS',
    });
  });

  test('should handle time range without gusts', () => {
    const input = `ZCZC AE72
270828 UTC MAR 25
SECOND HALF NIGHT
WINDS NW 15 TO 18 MS
NNNN`;
    const messages = decodeMessage(input);
    const forecast = messages[0]?.sections?.part1[0];
    expect(forecast?.timeRange.from).toBe('SECOND HALF NIGHT');
    expect(forecast?.wind).toEqual({
      direction: 'NW',
      speed: '15 TO 18 MS',
      gusts: undefined,
    });
  });

  test('should include HEIGHT OF WAVES in forecast for ZCZC AB00', () => {
    const input = `ZCZC AB00
270829 UTC MAR 25
PETER THE GREAT GULF
HEIGHT OF WAVES 1 TO 2 M
NNNN`;
    const messages = decodeMessage(input);
    const forecasts = messages[0]?.sections?.part1 || [];
    const gulfForecast = forecasts.find((f: Forecast) => f.region?.toUpperCase() === 'PETER THE GREAT GULF');
    expect(gulfForecast?.seas).toBe('1 TO 2 M');
  });
});