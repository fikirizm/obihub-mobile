// Amazon FBM stok gönderimi (saf modül; birim testi dev/test-amazon-stock-push.mjs).
// Web karşılığı: frontend/src/pages/ProductStockListPage.js (stok hücresi), components/integrations/AmazonStockPushCard.jsx.
// Sunucu: GET /parasut/product-stock → integration_stocks[].push {state, code, detail, at} (yalnız kinds "stock" içeren son sonuç);
// integrations[].stock_push_warning; GET /amazon/{id}/stock-push; POST /amazon/{id}/stock-push/approve-first-sync → {pending}.
import type { ChannelPush, PushBadge } from "./api-urun-stok";

export type KindedPush = ChannelPush & { kinds?: string[] | null };

const FBA = "AMAZON_FBA_SKIPPED";
const FIRST_SYNC = "AMAZON_FIRST_SYNC_REVIEW";
const AMAZON_WAIT = new Set(["AMAZON_STOCK_CHANGED_ON_AMAZON", "AMAZON_QUANTITY_UNKNOWN"]);

export const AMAZON_PRICE_NOTE = "Fiyat Amazon'a gönderilmez";

// Stok satırının son gönderim rozeti. Amazon'un "pending" kayıtları hata değildir (Amazon'daki değişiklik ya da sipariş
// senkronu bekleniyor): ayrıntı sakin bilgi olarak gösterilir. "skipped" (FBA, gönderim türü belli değil, ilk eşitleme) bilgidir.
// Diğer durumlar ortak kanal rozetine bırakılır (base = api-urun-stok channelPushBadge).
export function stockPushBadge(push: KindedPush | null | undefined, base: (p: ChannelPush) => PushBadge | null = () => null): PushBadge | null {
  if (!push) return null;
  const state = String(push.state || "").toLowerCase();
  const code = String(push.code || "").toUpperCase();
  const detail = String(push.detail || "").trim();
  if (state === "skipped") {
    if (code === FBA) return { label: "FBA: stok Amazon deposunda yönetilir", tone: "wait" };
    if (code === FIRST_SYNC) return { label: detail || "İlk eşitleme onayı bekliyor", tone: "wait" };
    return { label: detail ? `Gönderilmedi: ${detail}` : "Gönderilmedi", tone: "wait" };
  }
  if (state === "pending" && AMAZON_WAIT.has(code)) return { label: detail || "Amazon sipariş senkronu bekleniyor", tone: "wait" };
  if (state === "failed" && code.startsWith("AMAZON_")) return { label: detail ? `Gönderilemedi: ${detail}` : "Gönderilemedi", tone: "bad" };
  if (state === "failed" && !code) return { label: detail ? `Gönderilemedi: ${detail}` : "Gönderilemedi", tone: "bad" };
  return base(push);
}

// FBA ürününde stok ObiHub'dan gönderilmez: stok girişi kapalı.
export function isFbaStock(push: KindedPush | null | undefined): boolean {
  return Boolean(push && String(push.state || "").toLowerCase() === "skipped" && String(push.code || "").toUpperCase() === FBA);
}

// Amazon'a fiyat gönderilmez (/price/channel-set Amazon → 400).
export function channelPriceEditable(platform: string): boolean {
  return String(platform || "").toLowerCase() !== "amazon";
}

const kindsOf = (p: KindedPush | null | undefined) => (p && Array.isArray(p.kinds) ? p.kinds : null);

// Ürün kartındaki channel_push kaydı stok mu fiyat mı: fiyat satırı stok sonucunu göstermez (türü bilinmeyen eski kayıt gösterilir);
// stok satırı yalnız türü "stock" içeren sonucu gösterir (sunucunun stok hücresi kuralı).
export function pushForPrice(p: KindedPush | null | undefined): KindedPush | undefined {
  if (!p) return undefined;
  const k = kindsOf(p);
  return !k || k.includes("price") ? p : undefined;
}
export function pushForStock(p: KindedPush | null | undefined): KindedPush | undefined {
  const k = kindsOf(p);
  return p && k && k.includes("stock") ? p : undefined;
}

// Mağaza düzeyinde duran stok gönderimi (ör. SP-API Listings yetkisi yok): bir kez, mağaza adıyla.
export function storeStockWarnings(channels: { id: string; name: string; stockPushWarning?: string | null }[]) {
  return channels
    .filter((c) => c.stockPushWarning)
    .map((c) => ({ id: c.id, text: `${c.name}: stok gönderimi durdu. ${c.stockPushWarning}` }));
}

const pad = (x: number) => String(x).padStart(2, "0");
// Türkiye saati (UTC+3, yaz saati yok); Hermes'te saat dilimi desteğine güvenilmez.
function trDateTime(iso: unknown): string {
  const d = new Date(String(iso || ""));
  if (!iso || Number.isNaN(d.getTime())) return "";
  const tr = new Date(d.getTime() + 3 * 3600 * 1000);
  return `${pad(tr.getUTCDate())}.${pad(tr.getUTCMonth() + 1)} ${pad(tr.getUTCHours())}:${pad(tr.getUTCMinutes())}`;
}

export type StorePushView = {
  block: { message: string; retry: string } | null;
  review: number;
  reviewTitle: string;
  confirmText: string;
  sendingText: string;
};

// GET /amazon/{id}/stock-push görünümü. Durum okunamazsa entegrasyon kaydındaki stock_push_block yedek olarak kullanılır.
export function storePushView(status: any, fallbackBlock?: any): StorePushView {
  const raw = status ? status.block : fallbackBlock;
  const block = raw && raw.code ? raw : null;
  const review = Math.max(0, Math.trunc(Number(status?.first_sync_review_count) || 0));
  const sending = Math.max(0, Math.trunc(Number(status?.first_sync_sending_count) || 0));
  const retryAt = block ? trDateTime(block.retry_at) : "";
  return {
    block: block
      ? { message: String(block.message || "Stok gönderimi durdu."), retry: retryAt ? `Otomatik yeniden deneme: ${retryAt}. Yeniden bağlandığınızda hemen denenir.` : "" }
      : null,
    review,
    reviewTitle: `İlk eşitleme onay bekliyor: ${review} ürün`,
    confirmText: `${review} ürünün Amazon stoğu ObiHub'daki satılabilir stokla (0) değiştirilecek. Bu ürünlerde Amazon'da stok var ya da miktar okunamadı.`,
    sendingText: sending > 0 ? `Onaylanan ${sending} ürünün ObiHub stoğu Amazon'a gönderiliyor.` : "",
  };
}

// Onay yanıtı {pending}: onay o an listelenen ürünlere bağlıdır.
export function approveText(res: any, review: number): string {
  const n = res && res.pending != null && Number.isFinite(Number(res.pending)) ? Math.trunc(Number(res.pending)) : review;
  return n > 0 ? `${n} ürünün ObiHub stoğu Amazon'a gönderiliyor.` : "Onay bekleyen ürün kalmadı.";
}
