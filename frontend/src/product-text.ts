// Ürün açıklaması ve ObiHub web sitesi durumu (saf modül; birim testi dev/test-product-text.mjs). Faz A M10.
// Detaylı açıklama mağazadan HTML olarak gelebilir; biçimliyse mobilde düzenlenmez (biçim bozulmasın), düz metin önizlemesi gösterilir.
// Web sitesi durumu: GET /settings/website/integration/products/{id}; gönderme POST /settings/website/integration/publish (web ile aynı).

export const isPlainText = (s: unknown) => !/<\/?[a-z][^>]*>/i.test(String(s ?? ""));

export const plainPreview = (s: unknown) =>
  String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();

const BUSY = new Set(["queued", "processing"]);
export function webStatusLabel(d: any) {
  if (d?.published) return "Yayında";
  if (d?.ready) return "Yayına hazır";
  if (BUSY.has(String(d?.state || ""))) return "Yayına hazırlanıyor";
  if (d?.selected) return "Düzenleme gerekli";
  return "Yayında değil";
}
export function webStatusTone(d: any): "success" | "info" | "warning" | "neutral" {
  if (d?.published) return "success";
  if (d?.ready || BUSY.has(String(d?.state || ""))) return "info";
  if (d?.selected) return "warning";
  return "neutral";
}
export const pushLabel = (d: any) => (d?.matched ? "Mağazada güncelle" : "Mağazaya gönder");
export const isBusyState = (d: any) => BUSY.has(String(d?.state || ""));
