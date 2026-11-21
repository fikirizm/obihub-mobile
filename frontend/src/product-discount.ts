// Ürün indirimi (saf modül; birim testi dev/test-product-discount.mjs). Faz A M4. Web: components/catalog/productDiscount.js (birebir).
// Sözleşme: price = satış (indirimli) fiyatı, regular_price = normal fiyat; regular_price > price ise mağaza üstü çizili gösterir.
// Kuruş (tam sayı) ve baz puan; yüzde indirim yarım yukarı kuruşa yuvarlanır. Kaydetme PATCH /products/{id} {price, regular_price}.
// /price/adjust yalnız price'ı yazar (kanallara gönderir), regular_price'a dokunmaz; bu yüzden ana fiyat planı gerekirse regular_price'ı da yazar.

export type Discount = { mode: "percent" | "sale"; percent: string; sale: string };

const B0 = BigInt(0);
const B2 = BigInt(2);
const B100 = BigInt(100);
const B5000 = BigInt(5000);
const B10000 = BigInt(10000);

function scaled(value: unknown): bigint | null {
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(String(value ?? "").trim());
  if (!m) return null;
  return BigInt(m[1]) * B100 + BigInt((m[2] || "").padEnd(2, "0"));
}
const text = (n: bigint) => `${n / B100}.${String(n % B100).padStart(2, "0")}`;

export const blankDiscount = (): Discount => ({ mode: "percent", percent: "", sale: "" });

export function discountFromPercent(base: string, percent: string): Discount {
  const b = scaled(base);
  const p = percent === "" ? B0 : scaled(percent);
  if (p === null || p < B0 || p >= B10000) throw Error("İndirim oranı 0 ile 100 arasında olmalı.");
  if (p === B0) return { mode: "percent", percent, sale: "" };
  if (b === null || b <= B0) throw Error("Önce geçerli normal satış fiyatını girin.");
  const s = (b * (B10000 - p) + B5000) / B10000;
  if (s <= B0 || s >= b) throw Error("İndirimli fiyat sıfırdan büyük ve normal fiyattan düşük olmalı.");
  return { mode: "percent", percent, sale: text(s) };
}

export function discountFromPrice(base: string, sale: string): Discount {
  if (sale === "") return { mode: "sale", percent: "", sale: "" };
  const b = scaled(base);
  const s = scaled(sale);
  if (b === null || b <= B0) throw Error("Önce geçerli normal satış fiyatını girin.");
  if (s === null || s <= B0 || s >= b) throw Error("İndirimli fiyat sıfırdan büyük ve normal fiyattan düşük olmalı.");
  const percent = Number(((b - s) * B10000 + b / B2) / b) / 100;
  return { mode: "sale", percent: String(percent), sale };
}

export function resolveDiscount(base: string, value: Discount) {
  const b = scaled(base);
  if (b === null) throw Error("Geçerli normal satış fiyatını girin.");
  const d = value.mode === "sale" ? discountFromPrice(base, value.sale) : discountFromPercent(base, value.percent);
  return { price: Number(d.sale ? d.sale.replace(",", ".") : text(b)), regular_price: Number(text(b)), discount: d };
}

export function discountForProduct(p: { price?: unknown; regular_price?: unknown }): Discount {
  const base = Number(p?.regular_price);
  const sale = Number(p?.price);
  return base > sale && sale > 0 ? discountFromPrice(base.toFixed(2), sale.toFixed(2)) : blankDiscount();
}

export function discountView(p: { price?: unknown; regular_price?: unknown }) {
  const sale = Number(p?.price) || 0;
  const reg = Number(p?.regular_price) || 0;
  if (reg > sale && sale > 0) {
    const d = discountForProduct(p);
    return { discounted: true, regular: reg, sale, percent: `%${d.percent.replace(".", ",")}` };
  }
  return { discounted: false, regular: sale, sale, percent: "" };
}

const tl = (n: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// Ana fiyat düzenleme planı. target: "single" (indirimsiz ürün), "sale" (indirimli fiyat), "regular" (normal fiyat).
export function priceEditPlan(
  p: { price?: unknown; regular_price?: unknown },
  value: number,
  target: "single" | "sale" | "regular"
): { adjust: number | null; patch: Record<string, number> | null; error?: string } {
  const reg = Number(p?.regular_price) || 0;
  const sale = Number(p?.price) || 0;
  if (target === "sale") {
    if (!(value < reg)) return { adjust: null, patch: null, error: `İndirimli fiyat normal fiyattan (${tl(reg)}) düşük olmalı. İndirimi kaldırmak için İndirim bölümünü kullanın.` };
    return { adjust: value, patch: null };
  }
  if (target === "regular") {
    if (!(value > sale)) return { adjust: null, patch: null, error: `Normal fiyat indirimli fiyattan (${tl(sale)}) yüksek olmalı.` };
    return { adjust: null, patch: { regular_price: value } };
  }
  return { adjust: value, patch: reg > value ? { regular_price: value } : null };
}
