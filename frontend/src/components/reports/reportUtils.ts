export type RangeT = { start: Date; end: Date; key: string; label: string };

export function localDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseAnyDate(raw: unknown): Date | null {
  if (!raw) return null;
  const d = new Date(String(raw));
  if (!Number.isNaN(d.getTime())) return d;
  const s = String(raw).slice(0, 10);
  const p = new Date(s);
  return Number.isNaN(p.getTime()) ? null : p;
}

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function daysAgo(n: number) {
  const x = new Date();
  x.setDate(x.getDate() - n);
  return startOfDay(x);
}

export function presetRanges(): RangeT[] {
  const today = startOfDay(new Date());
  const end = endOfDay(new Date());
  const yest = startOfDay(new Date(Date.now() - 86400000));
  const thisMonthStart = startOfDay(new Date(today.getFullYear(), today.getMonth(), 1));
  const lastMonthEnd = endOfDay(new Date(today.getFullYear(), today.getMonth(), 0));
  const lastMonthStart = startOfDay(new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1));
  const yearStart = startOfDay(new Date(today.getFullYear(), 0, 1));
  return [
    { key: "today", label: "Bugün", start: today, end },
    { key: "yesterday", label: "Dün", start: yest, end: endOfDay(yest) },
    { key: "7d", label: "Son 7 gün", start: daysAgo(6), end },
    { key: "14d", label: "Son 14 gün", start: daysAgo(13), end },
    { key: "30d", label: "Son 30 gün", start: daysAgo(29), end },
    { key: "90d", label: "Son 90 gün", start: daysAgo(89), end },
    { key: "thisMonth", label: "Bu ay", start: thisMonthStart, end },
    { key: "lastMonth", label: "Geçen ay", start: lastMonthStart, end: lastMonthEnd },
    { key: "ytd", label: "Yıl başından", start: yearStart, end },
  ];
}

export function formatDateTr(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export function rangeDays(r: RangeT) {
  return Math.max(1, Math.round((r.end.getTime() - r.start.getTime()) / 86400000) + 1);
}

export function normalizeReportPeriod(days: number) {
  if (days <= 1) return 7;
  if (days <= 7) return 7;
  if (days <= 30) return 30;
  if (days <= 90) return 90;
  return 365;
}

export function periodDaysFromRangeKey(key: string, fallbackDays: number): number {
  if (key === "7d") return 7;
  if (key === "30d") return 30;
  if (key === "90d") return 90;
  return normalizeReportPeriod(fallbackDays);
}

export function rangeLabel(r: RangeT) {
  if (r.key !== "custom") return r.label;
  return `${formatDateTr(r.start)} – ${formatDateTr(r.end)}`;
}

export function formatDateInput(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export function formatDayLabelFull(dateStr?: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  const months = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
