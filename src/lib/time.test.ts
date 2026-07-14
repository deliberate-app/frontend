import { describe, expect, test } from 'bun:test';
import { formatCountdown, formatDuration } from './time';

describe('formatDuration', () => {
  test('renders the two most significant units', () => {
    expect(formatDuration(3 * 86_400 + 4 * 3_600 + 59 * 60)).toBe('3d 4h');
    expect(formatDuration(2 * 3_600 + 5 * 60 + 59)).toBe('2h 5m');
    expect(formatDuration(4 * 60 + 12)).toBe('4m 12s');
    expect(formatDuration(32)).toBe('32s');
  });

  test('drops a zero second unit', () => {
    expect(formatDuration(86_400)).toBe('1d');
    expect(formatDuration(12 * 3_600)).toBe('12h');
    expect(formatDuration(30 * 60)).toBe('30m');
    expect(formatDuration(0)).toBe('0s');
  });

  test('clamps negative and fractional inputs', () => {
    expect(formatDuration(-5)).toBe('0s');
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(61.9)).toBe('1m 1s');
  });
});

describe('formatCountdown', () => {
  test('zero-pads two units to a fixed seven-character width', () => {
    expect(formatCountdown(3 * 86_400 + 4 * 3_600)).toBe('03d 04h');
    expect(formatCountdown(2 * 3_600 + 5 * 60)).toBe('02h 05m');
    expect(formatCountdown(4 * 60 + 12)).toBe('04m 12s');
    expect(formatCountdown(5)).toBe('00m 05s');
    // Every rendering is the same length, so a live timer never changes width.
    const widths = new Set([0, 9, 59, 61, 3_599, 3_600].map((s) => formatCountdown(s).length));
    expect(widths).toEqual(new Set([7]));
  });

  test('clamps negative and fractional inputs', () => {
    expect(formatCountdown(-5)).toBe('00m 00s');
    expect(formatCountdown(61.9)).toBe('01m 01s');
  });
});
