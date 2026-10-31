const OFFICE_TZ = 'Asia/Kolkata';

export function officeDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: OFFICE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
