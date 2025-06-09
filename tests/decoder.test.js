"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const decoder_1 = require("../src/decoder");
describe('Decoder', () => {
    it('should decode wind with direction containing spaces and gusts', () => {
        const input = [
            'ZCZC TEST',
            '270829 UTC MAR 25',
            'GALE WARNING',
            'WINDS NW W GUSTS 15 TO 18 MS',
            'NNNN',
        ].join('\n');
        const messages = (0, decoder_1.decodeMessage)(input);
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
        const messages = (0, decoder_1.decodeMessage)(input);
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
        const messages = (0, decoder_1.decodeMessage)(input);
        const forecast = messages[0].sections.part1[0];
        expect(forecast.timeRange).toEqual({
            from: 'SECOND HALF NIGHT AND FIRST HALF DAY 28/03',
            to: '',
        });
    });
});
