// Web Mağaza özet kartı (saf modül; birim testi dev/test-web-store.mjs). Faz A M9.
// GET/PUT /settings/website/publication-status (PUT {expected_revision, is_published}, yalnız firma sahibi),
// GET/PUT /settings/website/cart-reservations (PUT {expected_revision, enabled}; sahibe active_carts, reserved_units),
// GET /settings/website/payment-monitor (yalnız sahip, son 100), GET /settings/website/members (yalnız sahip, okuma).
// 409 REVISION_CHANGED → yeniden oku. Web: WebsitePaymentsPanel.jsx.

export const publicationBody = (s: any, on: boolean) => ({ expected_revision: Number(s?.revision) || 0, is_published: on });
export const reservationBody = (s: any, on: boolean) => ({ expected_revision: Number(s?.revision) || 0, enabled: on });

export function storeError(e: { status?: number; code?: string; message?: string } | null | undefined): { text: string; reload: boolean } {
  if (e?.code === "REVISION_CHANGED") return { text: "Ayarlar başka bir yerde değişti; güncel hali yüklendi. Gerekirse yeniden deneyin.", reload: true };
  if (Number(e?.status) === 403) return { text: "Bu ayarı yalnız firma sahibi değiştirebilir.", reload: false };
  const m = typeof e?.message === "string" ? e.message.trim() : "";
  if (m && !/^Sunucu hatası/.test(m) && m !== e?.code) return { text: m, reload: false };
  return { text: "İşlem doğrulanamadı. Yeniden yükleyip kontrol edin.", reload: false };
}

const STATES: Record<string, string> = {
  preparing: "Hazırlanıyor", reserved: "Stok ayrıldı", token_requested: "Ödeme formu hazırlanıyor", token_uncertain: "Bağlantı kontrol ediliyor",
  payment_pending: "Ödeme bekleniyor", awaiting_transfer: "Havale bekleniyor", paid: "Sipariş işleniyor", completed: "Tamamlandı",
  expired: "Süresi doldu", cancelled: "İptal edildi", failed: "Başarısız", payment_review: "İnceleme gerekli",
};
const TONE: Record<string, "success" | "warning" | "error" | "neutral"> = {
  completed: "success", paid: "success", awaiting_transfer: "warning", payment_pending: "warning", payment_review: "error", failed: "error",
};
const REVIEW: Record<string, string> = { AMOUNT_MISMATCH: "Ödeme tutarı uyuşmuyor.", PAYMENT_AFTER_CANCEL: "İptal edilen işlem için ödeme bildirimi geldi." };

export type MonitorRow = { id: string; code: string; state: string; tone: "success" | "warning" | "error" | "neutral"; total: number; createdAt: string; note: string | null };
export function monitorRows(resp: any): MonitorRow[] {
  return (Array.isArray(resp?.items) ? resp.items : []).map((r: any) => {
    const st = String(r?.state || "");
    let note: string | null = null;
    if (st === "payment_review") note = `${REVIEW[String(r?.review_reason || "")] || "Ödeme rezervasyon süresinden sonra geldi."} Sipariş otomatik hazırlanmadı; ödeme mutabakatı gerekli.`;
    else if (r?.needs_attention) note = "Sipariş işleme kontrol edilmeli; ödeme yeniden alınmamalı.";
    return {
      id: String(r?.id || ""),
      code: String(r?.id || "").slice(0, 8),
      state: `${STATES[st] || st}${r?.test_mode ? " · Test" : ""}`,
      tone: r?.needs_attention ? "error" : TONE[st] || "neutral",
      total: Number(r?.total) || 0,
      createdAt: String(r?.created_at || ""),
      note,
    };
  });
}

export const publicationText = (s: any) =>
  s?.is_published ? "Mağaza yayında; müşteriler ürünleri görüp sipariş verebilir." : `Mağaza kapalı; ziyaretçiler "${s?.message || "Yakında buradayız"}" sayfasını görür.`;

export function reservationText(s: any) {
  if (!s?.enabled) return s?.server_ready ? "Kapalı" : "Kapalı · mağaza sepet bağlantısı hazır değil";
  const parts = [`Açık · sepetteki ürün ${Number(s.reservation_minutes) || 15} dakika ayrılır`];
  if (s.active_carts != null) parts.push(`${s.active_carts} aktif sepet, ${Number(s.reserved_units) || 0} adet ayrılmış`);
  return parts.join(" · ");
}
