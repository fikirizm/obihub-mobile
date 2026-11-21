// POS'ta adla hızlı müşteri (geri bildirim 2 / web G2b; saf modül, birim testi dev/test-pos-quick-customer.mjs).
// Web: pages/POSPage.js createCustomerFromSearch. Mobilde müşteri seçici yalnız açık hesap satışındadır; bu yüzden seçilebilir
// kart = kayıtlı ve tedarikçi olmayan (pos-money openAccountBlock). Aranan ad yoksa tek dokunuşla yalnız adla kart açılır.
// Açmadan önce kesin ad sorgusu (per_page=100, rol süzgeci yok) yapılır: aynı adla seçilebilir kart varsa o seçilir; aynı ad yalnız
// tedarikçi kartındaysa ikinci kart açılmaz. Arama ya da kesin sorgu hata verirse kart açılmaz (kayıtlı olup olmadığı bilinmiyor).
import { openAccountBlock } from "./pos-money";

type PartyLike = { id: string; name?: string; company_name?: string; full_name?: string; source?: string; contact_role?: string };

export const partyName = (p: PartyLike | null | undefined) => String(p?.name || p?.company_name || p?.full_name || "").trim();
export const cleanName = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
const norm = (v: unknown) => cleanName(v).toLocaleLowerCase("tr-TR");
export const sameName = (a: unknown, b: unknown) => !!norm(a) && norm(a) === norm(b);

// Sunucu aramayı ham regex olarak işler; ad içindeki noktalama kaçışlanır.
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function probePath(name: string) {
  const qs = new URLSearchParams({ search: escapeRegex(cleanName(name)), per_page: "100" });
  return `/customers?${qs.toString()}`;
}

export type QuickOption<P> = { kind: "none" } | { kind: "failed" } | { kind: "suggest"; party: P } | { kind: "create"; name: string };
// results: seçicide listelenen seçilebilir kartlar.
export function quickOption<P extends PartyLike>(s: { term: string; loading: boolean; failed: boolean; results: P[] }): QuickOption<P> {
  const name = cleanName(s.term);
  if (!name || s.loading) return { kind: "none" };
  if (s.failed) return { kind: "failed" };
  const exact = s.results.find((p) => sameName(partyName(p), name) && openAccountBlock(p) === null);
  return exact ? { kind: "suggest", party: exact } : { kind: "create", name };
}

export type ProbeResult<P> = { kind: "existing"; party: P } | { kind: "blocked"; text: string } | { kind: "create" };
export function resolveProbe<P extends PartyLike>(items: P[], name: string): ProbeResult<P> {
  const same = (Array.isArray(items) ? items : []).filter((p) => sameName(partyName(p), name));
  const usable = same.find((p) => openAccountBlock(p) === null);
  if (usable) return { kind: "existing", party: usable };
  // Siparişten türeyen kişi kart değildir; yalnız kayıtlı (tedarikçi) kart ikinci kartı engeller.
  if (same.some((p) => openAccountBlock(p) === "supplier")) return { kind: "blocked", text: SUPPLIER_TEXT };
  return { kind: "create" };
}

export const createBody = (name: string) => ({ name: cleanName(name), contact_role: "customer" as const });
export function createdParty(res: any, name: string): { id: string; name: string } | null {
  const id = String(res?.id || "");
  if (!id) return null;
  return { id, name: partyName(res) || cleanName(name) };
}

export const createLabel = (name: string) => `“${cleanName(name)}” adıyla yeni müşteri oluştur`;
export const CREATE_HINT = "Yalnız ad kaydedilir; telefon ve adresi sonra cari kartında tamamlarsınız.";
export const suggestLabel = (p: PartyLike) => `Bu isimde kayıtlı müşteri var: ${partyName(p)}`;
export const SUGGEST_HINT = "Yeni kart açmak yerine bunu seçin.";
export const existingText = (p: PartyLike) => `“${partyName(p)}” zaten kayıtlı; mevcut kart seçildi.`;
export const createdText = (name: string) => `“${cleanName(name)}” için cari kartı açıldı. Ayrıntıları Cariler ekranından tamamlayabilirsiniz.`;
export const SEARCH_FAILED_TEXT = "Müşteriler aranamadı; bağlantıyı kontrol edip yeniden deneyin. Kayıtlı olup olmadığı bilinmeden yeni kart açılmaz.";
export const PROBE_FAILED_TEXT = "Aynı adla kayıt olup olmadığı denetlenemedi; kart açılmadı. Bağlantıyı kontrol edip yeniden deneyin.";
export const SUPPLIER_TEXT =
  "Bu adla yalnız bir tedarikçi kartı kayıtlı; açık hesap satışı müşteri kartına yazılır. İkinci kart açılmadı. Kartın rolünü Cariler ekranında “Her ikisi” yapın ya da başka bir müşteri seçin.";
export function createErrorText(e: { message?: unknown } | null | undefined) {
  const msg = typeof e?.message === "string" ? e.message.trim() : "";
  return msg || "Müşteri kartı açılamadı. Yeniden deneyin.";
}
