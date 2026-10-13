// utils/date.js — date helpers (no external deps)

const USER_TZ = "Asia/Jakarta";

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO() {
  return new Date().toISOString();
}

// Format an ISO date string (YYYY-MM-DD or full ISO) as a localised date.
// Returns "" for null/empty input — never returns "Invalid Date".
export function formatDate(iso, opts = {}) {
  if (!iso) return "";
  const d = (iso instanceof Date) ? iso : new Date(iso);
  if (isNaN(d.getTime())) return "";
  const fmt = new Intl.DateTimeFormat("en-GB", {
    year: "numeric", month: "short", day: "2-digit", timeZone: USER_TZ, ...opts,
  });
  return fmt.format(d);
}

export function formatDateTime(iso) {
  if (!iso) return "";
  const d = (iso instanceof Date) ? iso : new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    timeZone: USER_TZ, hour12: false,
  }).format(d);
}

export function formatTime(iso) {
  if (!iso) return "";
  const d = (iso instanceof Date) ? iso : new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit",
    timeZone: USER_TZ, hour12: false,
  }).format(d);
}

// Days from today (negative = past, 0 = today)
export function daysFromToday(iso) {
  if (!iso) return null;
  const target = new Date(iso + "T00:00:00");
  if (isNaN(target.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

export function relativeDate(iso) {
  const d = daysFromToday(iso);
  if (d === null) return "";
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  if (d > 1 && d <= 7) return `In ${d} days`;
  if (d < -1 && d >= -7) return `${Math.abs(d)} days ago`;
  return formatDate(iso);
}
