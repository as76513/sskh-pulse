export const OFFICE_TZ = 'Asia/Kolkata';
export const DEFAULT_SHIFT_START = '10:00';
export const DEFAULT_SHIFT_END = '18:00';
export const DEFAULT_LATE_GRACE_MIN = 15;

// Calendar date in office TZ (YYYY-MM-DD). Do not use toISOString().slice(0, 10)
// for work_date — that is UTC and disagrees with IST after 11pm / before 5:30am.
export function officeDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: OFFICE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function secondsInTz(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const n = (type) => Number(parts.find((p) => p.type === type).value);
  return n('hour') * 3600 + n('minute') * 60 + n('second');
}

// Late after shift_start + grace (default 10:00 + 15 min → 10:15 IST).
export function isLateCheckIn(now, shiftStart, lateGraceMin) {
  const [sh, sm] = (shiftStart || DEFAULT_SHIFT_START).split(':').map(Number);
  const grace = lateGraceMin ?? DEFAULT_LATE_GRACE_MIN;
  const cutoffSec = (sh * 60 + sm + grace) * 60;
  return secondsInTz(now, OFFICE_TZ) > cutoffSec;
}
