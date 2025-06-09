import { decodeMessage } from '../src/decoder';

describe('Decoder', () => {
  it('should decode wind with direction containing spaces and gusts', () => {
    const input = [
      'ZCZC TEST',
      '270829 UTC MAR 25',
      'GALE WARNING',
      'WINDS NW W GUSTS 15 TO 18 MS',
      'NNNN',
    ].join('\n');

    const messages = decodeMessage(input);
    const forecast = messages[0].sections.part1[0];
    expect(forecast.wind).toEqual({
      direction: 'NW W',
      speed: '15 TO 18 MS',
      gusts: '15 TO 18 MS',
    });
    expect(forecast.timeRange.to).toBe('');
  });

  it('should decode wind with speed and gusts', () => {
    const input = [
      'ZCZC TEST',
      '270829 UTC MAR 25',
      'WINDS N 10 TO 12 MS GUSTS 15 MS',
      'NNNN',
    ].join('\n');

    const messages = decodeMessage(input);
    const forecast = messages[0].sections.part1[0];
    expect(forecast.wind).toEqual({
      direction: 'N',
      speed: '10 TO 12 MS',
      gusts: '15 MS',
    });
  });

  it('should handle time range without gusts', () => {
    const input = [
      'ZCZC TEST',
      '270829 UTC MAR 25',
      'SECOND HALF NIGHT AND FIRST HALF DAY 28/03',
      'NNNN',
    ].join('\n');

    const messages = decodeMessage(input);
    const forecast = messages[0].sections.part1[0];
    expect(forecast.timeRange).toEqual({
      from: 'SECOND HALF NIGHT AND FIRST HALF DAY 28/03',
      to: '',
    });
  });

  it('should include HEIGHT OF WAVES in forecast for ZCZC AB00', () => {
    const input = [
      'ZCZC AB00',
      '270829 UTC MAR 25',
      'VLADIVOSTOK RADIO WEATHER',
      'GALE WARNING 53',
      'SECOND HALF NIGHT AND FIRST HALF DAY 28/03',
      'PETER THE GREAT GULF',
      'WINDS NW W GUSTS 15 TO 18 MS',
      'HEIGHT OF WAVES 1 TO 2 M',
      'GALE WARNING 54',
      'SECOND HALF NIGHT AND FIRST HALF DAY 28/03',
      'REGION 11440 NORTH OF 42,0 N WEST OF 135,0 E',
      'WINDS NW W GUSTS 15 TO 18 MS',
      'HEIGHT OF WAVES 1,5 TO 2,5 M',
      'NNNN',
    ].join('\n');

    const messages = decodeMessage(input);
    const forecasts = messages[0].sections.part1;
    const gulfForecast = forecasts.find(f => f.region === 'PETER THE GREAT GULF');
    expect(gulfForecast).toBeDefined();
    expect(gulfForecast!.seas).toBe('1 TO 2 M');
    expect(gulfForecast!.wind).toEqual({
      direction: 'NW W',
      speed: '15 TO 18 MS',
      gusts: '15 TO 18 MS',
    });
    expect(gulfForecast!.timeRange.from).toBe('SECOND HALF NIGHT AND FIRST HALF DAY 28/03');
    const regionForecast = forecasts.find(f => f.region === 'REGION 11440 NORTH OF 42,0 N WEST OF 135,0 E');
    expect(regionForecast).toBeDefined();
    expect(regionForecast!.seas).toBe('1,5 TO 2,5 M');
  });
});