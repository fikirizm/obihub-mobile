// Toplu SMS birleşik alıcı listesi (saf modül; birim testi dev/test-sms-recipients.mjs). Web: components/sms/recipientsModel.js (24 Kas 2026).
// Sunucu: GET /netgsm/recipients (parametresiz) → { items: [{ phone, name, sources, customer_id, role, city, class_ids, channels, order_count,
// last_order_at }], without_phone, truncated, facets: { channels[{key,label,count}], cities[{name,count}], classes[{id,name,kind,count}] } }.
// Cari + tüm kanal sipariş müşterileri + web üyeleri tek listede; aynı numara bir kez.

export type RecipientRow = {
  phone: string;
  name?: string;
  sources?: string[];
  customer_id?: string | null;
  role?: string | null;
  city?: string | null;
  class_ids?: string[];
  channels?: string[];
  order_count?: number;
  last_order_at?: string | null;
};
export type Facets = { channels: { key: string; label: string; count?: number }[]; cities: { name: string; count?: number }[]; classes: { id: string; name: string; kind?: string; count?: number }[] };
export type Filters = { sources: string[]; channels: string[]; city: string; classId: string; role: string; minOrders: string; lastOrder: string };

export const SOURCE_LABEL: Record<string, string> = { customer: "Cari", order: "Sipariş müşterisi", website_member: "Web üyesi" };
export const SOURCE_ORDER = ["customer", "order", "website_member"];
export const ROLE_OPTIONS: [string, string][] = [
  ["", "Müşteriler ve ikisi (varsayılan)"],
  ["customer", "Yalnız müşteriler"],
  ["supplier", "Yalnız tedarikçiler"],
  ["both", "Hem müşteri hem tedarikçi"],
  ["all", "Tümü (tedarikçiler dahil)"],
];
export const MIN_ORDER_OPTIONS: [string, string][] = [["", "Fark etmez"], ["1", "En az 1"], ["2", "En az 2"], ["3", "En az 3"], ["5", "En az 5"], ["10", "En az 10"]];
export const LAST_ORDER_OPTIONS: [string, string][] = [["", "Fark etmez"], ["30", "Son 30 gün"], ["90", "Son 90 gün"], ["365", "Son 365 gün"], ["never", "Hiç sipariş vermemiş"]];
export const EMPTY_FILTERS: Filters = { sources: [], channels: [], city: "", classId: "", role: "", minOrders: "", lastOrder: "" };

const DAY = 86400000;

// Türkçe harfleri sadeleştirir: "Şükrü", "ŞÜKRÜ", "sukru" aynı anahtar; I/İ/ı hepsi "i". (Hermes'te yerel ayarlı küçültmeye güvenilmez.)
export function fold(value: unknown): string {
  return String(value ?? "")
    .replace(/I/g, "ı")
    .replace(/İ/g, "i")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// "+905551112233" → "5551112233" (0 / 90 / 0090 öneklerinden bağımsız arama).
export function nationalDigits(raw: unknown): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("90") && d.length > 2) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}

export type Entry = { row: RecipientRow; text: string; tel: string };
export function indexRows(items: RecipientRow[]): Entry[] {
  return items.map((row) => ({ row, text: fold(`${row.name || ""} ${row.city || ""}`), tel: nationalDigits(row.phone) }));
}

const PHONE_ONLY = /^[\d\s+()\-.]+$/;
const NATIONAL_PREFIX = /^(\+90|0090|90|0)(?=[2-58])/;
const COUNTRY_PREFIX_ONLY = /^(\+(9|90)?|0{1,2}(9|90)?|9|90)$/;

export function matchesQuery(entry: Entry, query: string): boolean {
  const q = String(query ?? "").trim();
  if (!q) return true;
  const textHit = (tok: string) => entry.text.includes(tok);
  if (PHONE_ONLY.test(q)) {
    const compact = q.replace(/[\s().-]/g, "");
    if (COUNTRY_PREFIX_ONLY.test(compact)) return true; // önek yazılıyor; henüz daraltma
    const d = nationalDigits(q);
    if (!d) return true;
    const phoneHit = NATIONAL_PREFIX.test(compact) ? entry.tel.startsWith(d) : entry.tel.includes(d);
    return phoneHit || fold(q).split(" ").every(textHit);
  }
  return fold(q)
    .split(" ")
    .every((tok) => textHit(tok) || (/^\d+$/.test(tok) && entry.tel.includes(tok)));
}

// Sipariş müşterisi ve web üyesinin rolü boştur (null); onlar da müşteridir.
export function roleOk(row: RecipientRow, role: string): boolean {
  const r = row.role || null;
  if (role === "all") return true;
  if (role === "") return r !== "supplier"; // varsayılan: tedarikçi-yalnız hariç
  if (role === "customer") return r === "customer" || r === null;
  return r === role;
}

export function countFacets(items: RecipientRow[], role: string) {
  const sources: Record<string, number> = {};
  const channels: Record<string, number> = {};
  const cities: Record<string, number> = {};
  const classes: Record<string, number> = {};
  items
    .filter((r) => roleOk(r, role))
    .forEach((r) => {
      (r.sources || []).forEach((s) => (sources[s] = (sources[s] || 0) + 1));
      (r.channels || []).forEach((c) => (channels[c] = (channels[c] || 0) + 1));
      if (r.city) cities[r.city] = (cities[r.city] || 0) + 1;
      (r.class_ids || []).forEach((c) => (classes[c] = (classes[c] || 0) + 1));
    });
  return { sources, channels, cities, classes };
}

export function matchesFilters(row: RecipientRow, f: Filters, now = Date.now()): boolean {
  if (!roleOk(row, f.role)) return false;
  if (f.sources.length && !f.sources.some((s) => (row.sources || []).includes(s))) return false;
  if (f.channels.length && !f.channels.some((c) => (row.channels || []).includes(c))) return false;
  if (f.city && row.city !== f.city) return false;
  if (f.classId && !(row.class_ids || []).includes(f.classId)) return false;
  const count = Number(row.order_count) || 0;
  if (f.minOrders && count < Number(f.minOrders)) return false;
  if (f.lastOrder === "never") return count === 0 && !row.last_order_at;
  if (f.lastOrder) {
    const t = row.last_order_at ? new Date(row.last_order_at).getTime() : NaN;
    if (Number.isNaN(t) || t < now - Number(f.lastOrder) * DAY) return false;
  }
  return true;
}

export function applyAll(entries: Entry[], query: string, filters: Filters, now = Date.now()): RecipientRow[] {
  return entries.filter((e) => matchesFilters(e.row, filters, now) && matchesQuery(e, query)).map((e) => e.row);
}

// Etkin filtre çipleri (varsayılan "tedarikçi-yalnız hariç" sayılmaz). patch: çip kaldırılınca uygulanacak değişiklik.
export function filterChips(f: Filters, facets: Partial<Facets>): { key: string; label: string; patch: Partial<Filters> }[] {
  const chips: { key: string; label: string; patch: Partial<Filters> }[] = [];
  f.sources.forEach((s) => chips.push({ key: `src-${s}`, label: SOURCE_LABEL[s] || s, patch: { sources: f.sources.filter((x) => x !== s) } }));
  f.channels.forEach((c) =>
    chips.push({ key: `ch-${c}`, label: `Kanal: ${(facets.channels || []).find((x) => x.key === c)?.label || c}`, patch: { channels: f.channels.filter((x) => x !== c) } }),
  );
  if (f.city) chips.push({ key: "city", label: `Şehir: ${f.city}`, patch: { city: "" } });
  if (f.classId) chips.push({ key: "class", label: `Sınıf: ${(facets.classes || []).find((x) => x.id === f.classId)?.name || "Seçili"}`, patch: { classId: "" } });
  if (f.role) chips.push({ key: "role", label: `Tür: ${(ROLE_OPTIONS.find(([v]) => v === f.role) || [])[1] || f.role}`, patch: { role: "" } });
  if (f.minOrders) chips.push({ key: "min", label: `En az ${f.minOrders} sipariş`, patch: { minOrders: "" } });
  if (f.lastOrder) chips.push({ key: "last", label: f.lastOrder === "never" ? "Hiç sipariş vermemiş" : `Son ${f.lastOrder} günde sipariş`, patch: { lastOrder: "" } });
  return chips;
}

export const activeFilterCount = (f: Filters) =>
  f.sources.length + f.channels.length + (f.city ? 1 : 0) + (f.classId ? 1 : 0) + (f.role ? 1 : 0) + (f.minOrders ? 1 : 0) + (f.lastOrder ? 1 : 0);

export function normalizeResponse(data: any): { items: RecipientRow[]; without_phone: number; truncated: boolean; facets: Facets } {
  const facets = data?.facets || {};
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    without_phone: Number(data?.without_phone) || 0,
    truncated: Boolean(data?.truncated),
    facets: { channels: facets.channels || [], cities: facets.cities || [], classes: facets.classes || [] },
  };
}

// Liste satırının alt bilgisi: numara · şehir · sipariş sayısı (web 375 px düzeni).
export function rowSub(r: RecipientRow): string {
  const n = Number(r.order_count) || 0;
  return [r.phone, r.city || "", n > 0 ? `${n} sipariş` : ""].filter(Boolean).join(" · ");
}
