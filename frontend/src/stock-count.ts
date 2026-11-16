// Barkodla toplu sayım (saf modül; birim testi dev/test-stock-count.mjs). Dalga 4 (P4.1): POST /stock/count-bulk/preview {warehouse_id,
// lines:[{code, counted_quantity}]} → beklenen, fark, satır durumu (yazmaz); /apply {warehouse_id, reason, lines:[{product_id,
// counted_quantity, expected_quantity}]} + Idempotency-Key (zorunlu). Tek satır engelliyse (muhasebe sahipli, Paraşüt aynası, takipsiz,
// değişmiş) HİÇBİR satır yazılmaz (409); onaya yalnız farkı olan satırlar gönderilir.

export type CountLine = { code: string; counted: number };

export function addScan(lines: CountLine[], raw: string): CountLine[] {
  const code = String(raw || "").trim();
  if (!code) return lines;
  const hit = lines.find((l) => l.code === code);
  if (hit) return [{ code, counted: hit.counted + 1 }, ...lines.filter((l) => l.code !== code)];
  return [{ code, counted: 1 }, ...lines];
}
export function setCount(lines: CountLine[], code: string, text: string): CountLine[] {
  const t = String(text || "").trim();
  if (!/^\d{1,9}$/.test(t)) return lines;
  return lines.map((l) => (l.code === code ? { ...l, counted: Number(t) } : l));
}
export const removeLine = (lines: CountLine[], code: string) => lines.filter((l) => l.code !== code);

export const previewBody = (warehouseId: string, lines: CountLine[]) => ({
  warehouse_id: warehouseId,
  lines: lines.map((l) => ({ code: l.code, counted_quantity: l.counted })),
});

type Row = { product_id?: string | null; counted?: number; expected?: number; diff?: number; status?: string };
const changeRows = (rows: Row[]) => rows.filter((r) => r.status === "change" && r.product_id);
// Hatalı satır varken onay verilmez (sunucu yine hiçbirini yazmaz); farklı satır yoksa onaylanacak bir şey yok.
export const canApply = (rows: Row[]) => !rows.some((r) => r.status === "error") && changeRows(rows).length > 0;
export const applyBody = (warehouseId: string, rows: Row[], reason: string) => ({
  warehouse_id: warehouseId,
  reason: String(reason || "").trim() || "Mobil toplu sayım",
  lines: changeRows(rows).map((r) => ({ product_id: String(r.product_id), counted_quantity: Number(r.counted), expected_quantity: Number(r.expected) })),
});

export function summaryText(s: { lines?: number; changes?: number; same?: number; errors?: number; increase?: number; decrease?: number } | null | undefined) {
  if (!s) return "";
  const parts = [`${s.lines || 0} satır`, `${s.changes || 0} farklı (+${s.increase || 0} / −${s.decrease || 0})`, `${s.same || 0} aynı`];
  if (s.errors) parts.push(`${s.errors} hatalı`);
  return parts.join(" · ");
}

const TEXT: Record<string, string> = {
  STOCK_CHANGED: "Önizlemeden sonra bazı ürünlerin stoğu değişti. Önizlemeyi yenileyin ve sayımı yeniden onaylayın.",
  MIRROR_READ_ONLY: "Listede Paraşüt'te yönetilen ürün var; bu ürünleri çıkarıp yeniden deneyin.",
  INVENTORY_OWNED_BY_ACCOUNTING: "Stok sahibi muhasebe programınız; bu ürünlerin sayımını orada yapın.",
  ITEM_NOT_TRACKED: "Listede stok takibi kapalı ürün var; çıkarıp yeniden deneyin.",
  IDEMPOTENCY_KEY_REUSED: "Bu sayım daha önce farklı bilgilerle gönderilmiş. Önizlemeyi yenileyin.",
  COUNT_UNCHANGED: "Onaylanacak fark yok.",
};
export function countErrorText(e: { code?: string; message?: string } | null | undefined) {
  const m = typeof e?.message === "string" ? e.message.trim() : "";
  if (m && !/^Sunucu hatası/.test(m) && m !== e?.code) return m;
  return (e?.code && TEXT[e.code]) || "Sayım kaydedilemedi.";
}
export function applyResultText(r: { status?: string; applied?: number; unchanged?: number; replayed?: number; failed?: unknown[] } | null | undefined) {
  const failed = Array.isArray(r?.failed) ? r!.failed.length : 0;
  const done = (r?.applied || 0) + (r?.replayed || 0);
  if (failed) return `Sayım kısmen kaydedildi: ${done} ürün güncellendi, ${failed} ürün yazılamadı. Aynı sayımı yeniden gönderebilirsiniz.`;
  return `Sayım kaydedildi: ${done} ürün güncellendi.`;
}
