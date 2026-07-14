import { useEffect, useState } from 'react';

/** The wall clock in unix seconds, re-rendering once per tick so countdowns run live. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * A duration in seconds as its two most significant units, a zero second unit dropped:
 * "3d 4h", "1d", "2h 5m", "30m", "32s".
 */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`;
  return `${rest}s`;
}

/**
 * A countdown as its two most significant units, each zero-padded to two digits: "00m 05s", "01h 23m",
 * "03d 04h". The width is fixed (seven characters), so a live timer rendered with tabular figures never
 * jitters as digits gain a place or the units roll over.
 */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  if (days > 0) return `${pad(days)}d ${pad(hours)}h`;
  if (hours > 0) return `${pad(hours)}h ${pad(minutes)}m`;
  return `${pad(minutes)}m ${pad(rest)}s`;
}

/** A unix timestamp as a local clock time, with the date once it is not today. */
export function formatClockTime(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}
