export const OFFICE_TZ = 'Asia/Kolkata';
export const DEFAULT_SHIFT_START = '10:00';
export const DEFAULT_SHIFT_END = '18:00';
export const DEFAULT_LATE_GRACE_MIN = 15;

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
