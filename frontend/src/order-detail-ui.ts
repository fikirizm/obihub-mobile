// Sipariş ayrıntısı premium turu (PM 13 Kas 2026, a–g). Saf modül: göreli import yok (dev/test-order-detail-ui.mjs).
// Alanlar: backend/models.py OrderBase (customer_email, customer_phone, shipping_address, total_amount, items[].vat_rate, image_url).

type AnyOrder = Record<string, any>;

// ---- a) Müşteri kartı ----
export type ContactView = {
  name: string;
  phone: { text: string; href: string } | null;
  email: { text: string; href: string } | null;
  address: { text: string; mapsUrl: string } | null;
  // Fatura adresi (sunucu yalnız WooCommerce'te verir); teslimat adresinden farklıysa gösterilir.
  billing: string | null;
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

const HOME_COUNTRY = ["tr", "tur", "türkiye", "turkiye", "turkey"];
const trLower = (v: unknown) => clean(v).toLocaleLowerCase("tr-TR");

// Teslimat adresi metni + sözleşmedeki parçalar (ilçe, il, eyalet, posta kodu, ülke); metinde zaten geçen parça eklenmez.
export function fullAddress(o: AnyOrder): string {
  let text = String(o?.shipping_address ?? "")
    .split(/\n+/)
    .map(clean)
    .filter(Boolean)
    .join(", ");
  const has = (part: string) => trLower(text).includes(trLower(part));
  // Yer adı metinde yalnız mahalle adı olarak geçiyorsa ("Çankaya Mah.") ilçe/il sayılmaz: ilçe yine eklenir.
  const hasPlace = (part: string) => {
    const t = trLower(text);
    const p = trLower(part);
    for (let i = t.indexOf(p); i >= 0; i = t.indexOf(p, i + 1)) {
      if (!/^\s*(mah\b|mah\.|mahalle)/.test(t.slice(i + p.length))) return true;
    }
    return false;
  };
  const place = [o?.shipping_district, o?.shipping_city, o?.shipping_state].map(clean).filter((p) => p && !hasPlace(p));
  const uniq = place.filter((p, i) => place.findIndex((x) => trLower(x) === trLower(p)) === i);
  if (uniq.length) text = [text, ...uniq].filter(Boolean).join(", ");
  const post = clean(o?.shipping_postcode);
  if (post && !has(post)) text = text ? `${text} ${post}` : post;
  const country = clean(o?.shipping_country);
  if (country && !HOME_COUNTRY.includes(trLower(country)) && !has(country)) text = text ? `${text}, ${country}` : country;
  return text;
}

export function customerContact(o: AnyOrder, platform: string = "ios"): ContactView {
  const addr = fullAddress(o);
  const phone = phoneOf(o?.customer_phone);
  const email = emailOf(o?.customer_email);
  const address = addr ? { text: addr, mapsUrl: mapsUrl(addr, platform) } : null;
  const norm = (v: string) => trLower(v).replace(/[^\p{L}\p{N}]+/gu, "");
  const billingRaw = clean(o?.billing_address);
  const billing = billingRaw && !norm(addr).startsWith(norm(billingRaw)) && norm(billingRaw) !== norm(addr) ? billingRaw : null;
  return { name: clean(o?.customer_name) || "Müşteri", phone, email, address, billing, hasAny: Boolean(phone || email || address) };
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
// PM 13 Kas 2026: kanaldan gelmeyen alan tahminle gösterilmez. KDV yalnız siparişte gerçek vergi alanı varsa;
// indirim / kargo alanı yoksa toplam − kalemler farkı tek satır "Fark (kargo/indirim)".
export type AmountRow = { key: "subtotal" | "discount" | "shipping" | "difference" | "tax"; label: string; amount: number };

const minor = (v: unknown) => Math.round(Number(v || 0) * 100);
const major = (k: number) => k / 100;
const firstNum = (o: AnyOrder, keys: string[]) => {
  for (const k of keys) {
    const n = Number(o?.[k]);
    if (o?.[k] != null && o?.[k] !== "" && Number.isFinite(n) && n !== 0) return Math.abs(n);
  }
  return null;
};

const decOrNull = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : minor(v));

export function amountBreakdown(o: AnyOrder): { rows: AmountRow[]; total: number } {
  // Sunucu dökümü (amount_breakdown): kalemleri (kargo / indirim / KDV) varsa yalnız onlar gösterilir; Fark satırı yazılmaz.
  const ab = o?.amount_breakdown && typeof o.amount_breakdown === "object" ? o.amount_breakdown : null;
  if (ab) {
    const sub = decOrNull(ab.subtotal);
    const ship = decOrNull(ab.shipping);
    const disc = decOrNull(ab.discount);
    const tax = decOrNull(ab.tax);
    const tot = decOrNull(ab.total);
    if (ship || disc || tax) {
      const rows: AmountRow[] = [];
      if (sub != null) rows.push({ key: "subtotal", label: "Ara toplam", amount: major(sub) });
      if (disc) rows.push({ key: "discount", label: "İndirim", amount: -major(Math.abs(disc)) });
      if (ship) rows.push({ key: "shipping", label: "Kargo", amount: major(ship) });
      if (tax) rows.push({ key: "tax", label: "KDV", amount: major(tax) });
      return { rows, total: major(tot ?? minor(o?.total_amount)) };
    }
    if (sub != null && tot != null) {
      return sub === tot
        ? { rows: [], total: major(tot) }
        : { rows: [{ key: "subtotal", label: "Ara toplam", amount: major(sub) }, { key: "difference", label: "Fark (kargo/indirim)", amount: major(tot - sub) }], total: major(tot) };
    }
  }
  const items: AnyOrder[] = Array.isArray(o?.items) ? o.items : [];
  const subK = items.reduce(
    (a, it) =>
      a + (it?.total_price != null && it?.total_price !== "" ? minor(it.total_price) : Math.round(minor(it?.unit_price ?? it?.price) * Number(it?.quantity || 0))),
    0
  );
  const totalK = minor(o?.total_amount) || subK;
  if (!items.length) return { rows: [], total: major(totalK) };

  const rows: AmountRow[] = [];
  const disc = firstNum(o, ["discount_amount", "total_discount", "discount"]);
  const ship = firstNum(o, ["shipping_cost", "shipping_amount", "cargo_fee", "shipping_total"]);
  if (disc != null || ship != null) {
    if (disc != null) rows.push({ key: "discount", label: "İndirim", amount: -disc });
    if (ship != null) rows.push({ key: "shipping", label: "Kargo", amount: ship });
  } else if (totalK !== subK) {
    rows.push({ key: "difference", label: "Fark (kargo/indirim)", amount: major(totalK - subK) });
  }
  const tax = firstNum(o, ["tax_amount", "vat_amount", "total_tax"]);
  if (tax != null) rows.push({ key: "tax", label: "KDV", amount: tax });

  if (!rows.length) return { rows: [], total: major(totalK) };
  return { rows: [{ key: "subtotal", label: "Ara toplam", amount: major(subK) }, ...rows], total: major(totalK) };
}
