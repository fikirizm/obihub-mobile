// Sipariş ayrıntısı premium turu (PM 13 Kas 2026, a–g). Saf modül: göreli import yok (dev/test-order-detail-ui.mjs).
// Alanlar: backend/models.py OrderBase (customer_email, customer_phone, shipping_address, total_amount, items[].vat_rate, image_url).

type AnyOrder = Record<string, any>;

// ---- a) Müşteri kartı ----
export type ContactView = {
  name: string;
  phone: { text: string; href: string } | null;
  email: { text: string; href: string } | null;
  address: { text: string; mapsUrl: string } | null;
  hasAny: boolean;
};

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

function phoneOf(raw: unknown) {
  const text = clean(raw);
  if (!text || /[*x×]/i.test(text)) return null; // pazaryeri maskeli numaraları aranamaz
  const plus = text.startsWith("+");
  const digits = text.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return { text, href: `tel:${plus ? "+" : ""}${digits}` };
}

function emailOf(raw: unknown) {
  const text = clean(raw);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return null;
  return { text, href: `mailto:${text}` };
}

export function mapsUrl(address: string, platform: string = "ios"): string {
  const q = encodeURIComponent(address);
  return platform === "ios" ? `https://maps.apple.com/?q=${q}` : `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function customerContact(o: AnyOrder, platform: string = "ios"): ContactView {
  const addr = String(o?.shipping_address ?? "")
    .split(/\n+/)
    .map(clean)
    .filter(Boolean)
    .join(", ");
  const phone = phoneOf(o?.customer_phone);
  const email = emailOf(o?.customer_email);
  const address = addr ? { text: addr, mapsUrl: mapsUrl(addr, platform) } : null;
  return { name: clean(o?.customer_name) || "Müşteri", phone, email, address, hasAny: Boolean(phone || email || address) };
}

// Cari eşleşmesi: siparişte cari kimliği yok. Önce e-posta / telefon, sonra tek bir tam ad eşleşmesi; belirsizse yok.
const lowerTr = (s: unknown) => clean(s).toLocaleLowerCase("tr-TR");
const digitsTail = (s: unknown) => String(s ?? "").replace(/\D/g, "").slice(-10);

export function matchParty<T extends { id: string; name?: string; email?: string; phone?: string }>(o: AnyOrder, rows: T[]): T | null {
  // E-posta tr-TR'ye göre küçültülmez (I → ı olur).
  const email = clean(o?.customer_email).toLowerCase();
  if (email.includes("@")) {
    const hit = rows.find((r) => clean(r.email).toLowerCase() === email);
    if (hit) return hit;
  }
  const phone = digitsTail(o?.customer_phone);
  if (phone.length === 10) {
    const hit = rows.find((r) => digitsTail(r.phone) === phone);
    if (hit) return hit;
  }
  const name = lowerTr(o?.customer_name);
  if (!name) return null;
  const same = rows.filter((r) => lowerTr(r.name) === name);
  return same.length === 1 ? same[0] : null;
}

// ---- c) Durum çipleri: sunucunun iç durumları (order_status.py) görünen seçeneğe eşlenir ----
const STATUS_ALIAS: Record<string, string> = {
  new: "pending",
  ready_to_ship: "processing",
  completed: "delivered",
  returned: "cancelled",
  refunded: "cancelled",
};

export function currentStatusOption(status: unknown, options: { value: string }[]): string | null {
  const s = String(status ?? "").toLowerCase();
  const v = STATUS_ALIAS[s] || s;
  return options.some((o) => o.value === v) ? v : null;
}

// ---- d) Ekranda tek birincil eylem ----
export type PrimaryAction = "take" | "invoice" | "ship" | "print" | null;

export function primaryAction(s: { takeNeeded: boolean; canInvoice: boolean; canShip: boolean; canPrint: boolean; closed: boolean }): PrimaryAction {
  if (s.takeNeeded) return "take";
  if (s.canInvoice) return "invoice";
  if (s.closed) return null;
  if (s.canShip) return "ship";
  if (s.canPrint) return "print";
  return null;
}

// ---- e) Takip numarası ve barkodlar tek listede, tekrarsız ----
export type TrackingRow = { code: string; kind: "tracking" | "hepsijet" | "hepsijet-tracking"; title: string; copy: true; cancellable: boolean };

export function trackingRows(trackingNo: string, hjBarcodes: string[], canCancel: boolean): TrackingRow[] {
  const tn = clean(trackingNo);
  const codes = Array.from(new Set(hjBarcodes.map(clean).filter(Boolean)));
  const rows: TrackingRow[] = [];
  if (tn) {
    rows.push(
      codes.includes(tn)
        ? { code: tn, kind: "hepsijet-tracking", title: "HepsiJet takip no", copy: true, cancellable: canCancel }
        : { code: tn, kind: "tracking", title: "Kargo takip numarası", copy: true, cancellable: false }
    );
  }
  for (const c of codes) {
    if (c === tn) continue;
    rows.push({ code: c, kind: "hepsijet", title: "HepsiJet barkodu", copy: true, cancellable: canCancel });
  }
  return rows;
}

// ---- f) Ürün görseli ----
export function itemImage(it: AnyOrder, fallback?: string | null): string | null {
  const img0 = it?.images?.[0];
  const img0Url = typeof img0 === "object" && img0 ? img0.url ?? img0.src ?? "" : img0 ?? "";
  const raw = String(
    it?.image_url || it?.imageUrl || it?.pictureUrl || it?.picture_url || it?.image || it?.picture || it?.img || it?.thumbnail || img0Url || ""
  ).trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const fb = String(fallback || "").trim();
  return /^https?:\/\//i.test(fb) ? fb : null;
}

// ---- g) Tutar dökümü (kuruş hesabıyla) ----
export type AmountRow = { key: "subtotal" | "discount" | "shipping" | "tax"; label: string; amount: number };

const minor = (v: unknown) => Math.round(Number(v || 0) * 100);
const major = (k: number) => k / 100;
const firstNum = (o: AnyOrder, keys: string[]) => {
  for (const k of keys) {
    const n = Number(o?.[k]);
    if (o?.[k] != null && o?.[k] !== "" && Number.isFinite(n) && n !== 0) return Math.abs(n);
  }
  return null;
};

export function amountBreakdown(o: AnyOrder): { rows: AmountRow[]; total: number } {
  const items: AnyOrder[] = Array.isArray(o?.items) ? o.items : [];
  const lineK = items.map((it) =>
    it?.total_price != null && it?.total_price !== "" ? minor(it.total_price) : Math.round(minor(it?.unit_price ?? it?.price) * Number(it?.quantity || 0))
  );
  const subK = lineK.reduce((a, b) => a + b, 0);
  const totalK = minor(o?.total_amount) || subK;
  if (!items.length) return { rows: [], total: major(totalK) };

  const rows: AmountRow[] = [];
  const disc = firstNum(o, ["discount_amount", "total_discount", "discount"]);
  const ship = firstNum(o, ["shipping_cost", "shipping_amount", "cargo_fee", "shipping_total"]);
  if (disc != null || ship != null) {
    if (disc != null) rows.push({ key: "discount", label: "İndirim", amount: -disc });
    if (ship != null) rows.push({ key: "shipping", label: "Kargo", amount: ship });
  } else {
    const diff = totalK - subK;
    if (diff < 0) rows.push({ key: "discount", label: "İndirim", amount: major(diff) });
    else if (diff > 0) rows.push({ key: "shipping", label: "Kargo ve diğer", amount: major(diff) });
  }

  const taxField = firstNum(o, ["tax_amount", "vat_amount", "total_tax"]);
  let taxK: number | null = taxField != null ? minor(taxField) : null;
  if (taxK == null && items.some((it) => Number(it?.vat_rate) > 0)) {
    // Kanal fiyatları KDV dahil gelir; içindeki KDV indirimli satır tutarı üzerinden değil, satır tutarından hesaplanır.
    const share = subK > 0 ? totalK / subK : 1;
    taxK = Math.round(
      items.reduce((a, it, i) => {
        const r = Number(it?.vat_rate) || 0;
        return a + (r > 0 ? ((lineK[i] * share) * r) / (100 + r) : 0);
      }, 0)
    );
  }
  if (taxK) rows.push({ key: "tax", label: "KDV (dahil)", amount: major(taxK) });

  if (!rows.length) return { rows: [], total: major(totalK) };
  return { rows: [{ key: "subtotal", label: "Ara toplam", amount: major(subK) }, ...rows], total: major(totalK) };
}
