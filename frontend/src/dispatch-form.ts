// Elle ya da gelen irsaliye formu (P5.1; saf modül, birim testi dev/test-dispatch-form.mjs). POST /dispatch-notes + Idempotency-Key.
// Web: pages/stock/DispatchNoteFormPage.jsx ile aynı gövde ve doğrulama. Kaydedince stok takipli ürünler seçilen depodan düşer (giden)
// ya da depoya girer (gelen). Siparişten / faturadan irsaliye app/dispatch/new.tsx'tedir.

export type Direction = "out" | "in";
export type DispatchForm = {
  direction: Direction;
  name: string;
  number: string;
  party_name: string;
  party_tax_no: string;
  address: string;
  district: string;
  city: string;
  postal_code: string;
  origin_address: string;
  shipment_method: "cargo" | "carrier";
  carrier: string;
  tracking_no: string;
  driver_name: string;
  driver_tckn: string;
  plate: string;
  trailer: string;
  issue_date: string;
  shipment_date: string;
  order_no: string;
  notes: string;
};
export type DispatchLine = { product_id: string | null; name: string; sku: string; unit: string; qty: string; warehouse_id: string };

const QTY = /^\d{1,9}([.,]\d{1,4})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const partyLabel = (d: Direction) => (d === "in" ? "Tedarikçi" : "Alıcı");
export function blankDispatch(direction: Direction, today: string): DispatchForm {
  return {
    direction, name: "", number: "", party_name: "", party_tax_no: "", address: "", district: "", city: "", postal_code: "", origin_address: "",
    shipment_method: "cargo", carrier: "", tracking_no: "", driver_name: "", driver_tckn: "", plate: "", trailer: "",
    issue_date: today, shipment_date: today, order_no: "", notes: "",
  };
}

export const itemLine = (item: { id: string; name?: string; sku?: string; unit?: string }, warehouseId: string): DispatchLine => ({
  product_id: item.id, name: String(item.name || ""), sku: String(item.sku || ""), unit: String(item.unit || "adet").toLowerCase(), qty: "1", warehouse_id: warehouseId,
});
export const textLine = (): DispatchLine => ({ product_id: null, name: "", sku: "", unit: "adet", qty: "1", warehouse_id: "" });

// Arşivlenmemiş depolardan varsayılan olan, yoksa ilki (web activeWarehouses).
export function defaultWarehouse(list: { id: string; name?: string; is_default?: boolean; archived?: boolean }[]) {
  const live = (Array.isArray(list) ? list : []).filter((w) => w && !w.archived);
  return (live.find((w) => w.is_default) || live[0] || { id: "" }).id;
}

export function validateDispatch(f: DispatchForm, lines: DispatchLine[]): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.party_name.trim()) e.party_name = `${partyLabel(f.direction)} adı zorunlu.`;
  if (!f.issue_date) e.issue_date = "Düzenleme tarihi zorunlu.";
  else if (!DATE.test(f.issue_date)) e.issue_date = "Tarihi YYYY-AA-GG biçiminde yazın.";
  if (f.shipment_date && !DATE.test(f.shipment_date)) e.shipment_date = "Tarihi YYYY-AA-GG biçiminde yazın.";
  if (f.shipment_method === "carrier" && f.driver_tckn.trim() && !/^\d{11}$/.test(f.driver_tckn.trim())) e.driver_tckn = "T.C. kimlik no 11 haneli olmalı.";
  if (!lines.length) e.lines = "En az bir satır ekleyin.";
  else if (lines.some((l) => !QTY.test(String(l.qty).trim()) || Number(String(l.qty).replace(",", ".")) <= 0)) e.lines = "Miktarlar sıfırdan büyük olmalı (en çok 4 ondalık).";
  else if (lines.some((l) => !l.product_id && !l.name.trim())) e.lines = "Açıklama satırlarına metin yazın.";
  return e;
}

export function dispatchBody(f: DispatchForm, lines: DispatchLine[]) {
  const carrier = f.shipment_method === "carrier";
  const drivers = carrier && (f.driver_name.trim() || f.driver_tckn.trim()) ? [{ name: f.driver_name.trim(), tckn: f.driver_tckn.trim() }] : [];
  return {
    direction: f.direction,
    name: f.name.trim(),
    ...(f.number.trim() ? { number: f.number.trim() } : {}),
    customer_id: null,
    party_name: f.party_name.trim(),
    party_tax_no: f.party_tax_no.trim(),
    shipment_address: { address: f.address.trim(), district: f.district.trim(), city: f.city.trim(), postal_code: f.postal_code.trim() },
    origin_address: f.origin_address.trim(),
    shipment_method: f.shipment_method,
    cargo: carrier ? null : { carrier: f.carrier.trim(), tracking_no: f.tracking_no.trim() },
    drivers,
    vehicle_plate: carrier ? f.plate.trim().toUpperCase() : "",
    trailer_plates: carrier && f.trailer.trim() ? [f.trailer.trim().toUpperCase()] : [],
    issue_date: f.issue_date,
    shipment_date: f.shipment_date || f.issue_date,
    shipment_time: "",
    order_no: f.order_no.trim(),
    notes: f.notes.trim(),
    lines: lines.map((l) => {
      const base = { quantity: String(l.qty).trim().replace(",", "."), unit: l.unit || "adet" };
      return l.product_id
        ? { ...base, product_id: l.product_id, product_name: l.name, ...(l.warehouse_id ? { warehouse_id: l.warehouse_id } : {}) }
        : { ...base, description: l.name.trim() };
    }),
  };
}

export const savedText = (d: Direction) => (d === "out" ? "İrsaliye kaydedildi; stok düşüldü." : "İrsaliye kaydedildi; stok girildi.");
