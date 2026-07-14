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
    expect(scheduleError({ lockingDuration: 0, editingDuration: 600, ratingDuration: 600 })).toContain('Locking');
    // The editing bound is strict: equal to the locking duration is already too short.
    expect(scheduleError({ lockingDuration: 600, editingDuration: 600, ratingDuration: 600 })).toContain('editing');
    expect(scheduleError({ lockingDuration: 60, editingDuration: 600, ratingDuration: 59 })).toContain('rating');
    expect(scheduleError({ lockingDuration: 60.5, editingDuration: 600, ratingDuration: 600 })).toContain('whole');
  });
});

describe('scheduleWarning', () => {
  test('accepts the default without warnings', () => {
    expect(scheduleWarning(DEFAULT_SCHEDULE)).toBeNull();
  });

  test('flags editing phases too short for nesting and moving', () => {
    expect(scheduleWarning({ lockingDuration: 600, editingDuration: 2_400, ratingDuration: 1_200 })).toContain(
      'nest',
    );
  });

  test('flags rating phases far shorter than editing', () => {
    expect(
      scheduleWarning({ lockingDuration: 60, editingDuration: 86_400, ratingDuration: 3_600 }),
    ).toContain('read');
  });
});

test('classicSchedule derives the 7/3 split from one knob', () => {
  expect(classicSchedule(60)).toEqual({ lockingDuration: 60, editingDuration: 420, ratingDuration: 180 });
});

test('sameSchedule spots the matching preset', () => {
  expect(sameSchedule(DEFAULT_SCHEDULE, { ...DEFAULT_SCHEDULE })).toBe(true);
  expect(sameSchedule(DEFAULT_SCHEDULE, { ...DEFAULT_SCHEDULE, lockingDuration: 60 })).toBe(false);
});
