import { describe, expect, test } from 'bun:test';
import { formatDuration } from './time';

describe('formatDuration', () => {
  test('renders the two most significant units', () => {
    expect(formatDuration(3 * 86_400 + 4 * 3_600 + 59 * 60)).toBe('3d 4h');
    expect(formatDuration(2 * 3_600 + 5 * 60 + 59)).toBe('2h 5m');
    expect(formatDuration(4 * 60 + 12)).toBe('4m 12s');
    expect(formatDuration(32)).toBe('32s');
  });

  test('clamps negative and fractional inputs', () => {
    expect(formatDuration(-5)).toBe('0s');
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(61.9)).toBe('1m 1s');
  });
});
