// Paraşüt aynası (saf modül; birim testi dev/test-mirror.mjs). Sözleşme: docs/pm/tasarim/G4-30.md, mobil-oturum-icin-notlar.md (G4-30).
// Kilit kuralı: düzenleme kapısı `read_only` (cari: firma Paraşüt bağlıyken; fatura/hesap/ürün: kaydın kaynağı). Tahsilat kapısı `collect_blocked`.
type Rec = Record<string, any> | null | undefined;

export const isReadOnly = (r: Rec) => r?.read_only === true;

export function mirrorBadge(r: Rec): { label: string; syncedAt: string | null } | null {
  const fromParasut = r?.source_kind === "parasut" || (r?.read_only === true && (r?.mirror?.provider === "parasut" || !r?.mirror?.provider));
  if (!fromParasut || r?.source_kind === "obihub") return null;
  return { label: "Paraşüt", syncedAt: typeof r?.mirror?.synced_at === "string" ? r.mirror.synced_at : null };
}

const MIRROR_CODES: Record<string, string> = {
  MIRROR_READ_ONLY: "Bu kayıt Paraşüt'ten geliyor ve Paraşüt'te yönetilir; ObiHub'da değiştirilemez.",
  MIRROR_ACCOUNT_READ_ONLY: "Bu hesap Paraşüt'ten geliyor; hareketleri Paraşüt'te girin.",
  COLLECT_IN_PARASUT: "Bu fatura Paraşüt'te; tahsilatını Paraşüt'te tahsil edin.",
};
export const isMirrorError = (e: any) => Number(e?.status) === 409 && Boolean(MIRROR_CODES[e?.code]);
export function mirrorErrorText(e: any): string {
  const msg = typeof e?.message === "string" ? e.message.trim() : "";
  if (msg && !/^Sunucu hatası \(\d+\)$/.test(msg)) return msg;
  return MIRROR_CODES[e?.code] || "Bu kayıt Paraşüt'te yönetilir.";
}

export const COLLECT_IN_PARASUT_TEXT = "Paraşüt'te tahsil edin";
export const collectBlocked = (r: Rec) => r?.collect_blocked === true;
