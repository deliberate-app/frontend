import { describe, expect, test } from 'bun:test';
import {
  classicSchedule,
  DEFAULT_SCHEDULE,
  SCHEDULE_PRESETS,
  sameSchedule,
  scheduleError,
  scheduleWarning,
} from './debateTiming';

describe('scheduleError', () => {
  test('accepts the default and every preset', () => {
    expect(scheduleError(DEFAULT_SCHEDULE)).toBeNull();
    for (const { schedule } of SCHEDULE_PRESETS) {
      expect(scheduleError(schedule)).toBeNull();
    }
  });

  test('mirrors the contract checks', () => {
    expect(scheduleError({ timeUnit: 0, editingDuration: 600, ratingDuration: 600 })).toContain('lock in');
    expect(scheduleError({ timeUnit: 60, editingDuration: 59, ratingDuration: 600 })).toContain('editing');
    expect(scheduleError({ timeUnit: 60, editingDuration: 600, ratingDuration: 59 })).toContain('rating');
    expect(scheduleError({ timeUnit: 60.5, editingDuration: 600, ratingDuration: 600 })).toContain('whole');
  });
});

describe('scheduleWarning', () => {
  test('flags draft windows beyond the 30-minute guidance', () => {
    expect(
      scheduleWarning({ timeUnit: 31 * 60, editingDuration: 86_400, ratingDuration: 86_400 }),
    ).toContain('30 minutes');
    expect(scheduleWarning(DEFAULT_SCHEDULE)).toBeNull();
  });

  test('flags editing phases too short for nested arguments', () => {
    expect(scheduleWarning({ timeUnit: 600, editingDuration: 1_200, ratingDuration: 1_200 })).toContain(
      'nested',
    );
  });
});

test('classicSchedule derives the 7/3 split from one knob', () => {
  expect(classicSchedule(60)).toEqual({ timeUnit: 60, editingDuration: 420, ratingDuration: 180 });
});

test('sameSchedule spots the matching preset', () => {
  expect(sameSchedule(DEFAULT_SCHEDULE, { ...DEFAULT_SCHEDULE })).toBe(true);
  expect(sameSchedule(DEFAULT_SCHEDULE, { ...DEFAULT_SCHEDULE, timeUnit: 60 })).toBe(false);
});
