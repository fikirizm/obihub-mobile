// KABUK-2 form taslakları (saf modül; birim testi dev/test-form-draft.mjs). Web: lib/formDraft.js.
// PM kararı (25 Kas 2026): yalnız YENİ satış faturası ve YENİ ürün; anahtar kullanıcı + firma; çıkışta ve firma/kullanıcı değişince
// silinir; 7 gün geçerli; sunucuya yazmaz. Para tutarları kullanıcının girdiği metin olarak HAM saklanır (ondalıklı sayıya çevrilmez;
// birim fiyat 4 ondalık alabildiği için kuruşa yuvarlanmaz). İşlem anahtarları (createKey vb.) taslağa girmez: yeniden kullanılırsa çift kayıt.

export const DRAFT_PREFIX = "obihub.taslak.v1:";
const VERSION = 1;
export const TTL_MS = 7 * 24 * 3600 * 1000;
const MAX_BYTES = 200 * 1024;
const NEVER = new Set(["create_key", "createKey", "idempotency_key", "idempotencyKey", "preview"]);

type UserLike = { id?: string; email?: string; role?: string; [k: string]: any } | null | undefined;

const tenantOf = (u: UserLike) => u?.selected_company_id || u?.company_id || u?.tenant_id || u?.owner_id || u?.id || null;
const whoOf = (u: UserLike) => (u?.role === "member" && u?.email ? `${u.id}~${String(u.email).toLowerCase()}` : String(u?.id));

// `obihub.taslak.v1:<firma>:<kullanıcı>:` — bu oturumun kapsamı; kullanıcı yoksa null.
export function tenantPrefix(user: UserLike): string | null {
  const tenant = tenantOf(user);
  if (!user?.id || !tenant) return null;
  return `${DRAFT_PREFIX}${tenant}:${whoOf(user)}:`;
}

export function draftKey(user: UserLike, kind: string): string | null {
  const p = tenantPrefix(user);
  return p && kind ? `${p}${kind}` : null;
}

export type Draft<F = any> = { v: number; at: number; form: F };

// Yazılacak metin; 200 KB'ı aşarsa null (yazılmaz).
export function envelope(form: unknown, now = Date.now()): string | null {
  const text = JSON.stringify({ v: VERSION, at: now, form });
  return text.length > MAX_BYTES ? null : text;
}

export function parseDraft(raw: string | null | undefined, now = Date.now()): Draft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (d && d.v === VERSION && typeof d.at === "number" && d.form && typeof d.form === "object" && now - d.at <= TTL_MS) return d;
  } catch {
    /* bozuk */
  }
  return null;
}

// Saklanacak kopya: NEVER alanları her derinlikte, `omit` alanları üst düzeyde, cihazdaki yerel dosya/görsel adresleri düşer.
export function sanitize<F extends object>(form: F, omit: string[] = []): Partial<F> {
  const skip = new Set(omit);
  const text = JSON.stringify(form, function replacer(this: any, k, v) {
    if (k && (NEVER.has(k) || (this === form && skip.has(k)))) return undefined;
    if (typeof v === "string" && (v.startsWith("blob:") || v.startsWith("data:image") || v.startsWith("file:") || v.startsWith("ph://") || v.startsWith("content://"))) return undefined;
    return v;
  });
  return JSON.parse(text);
}

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const TR = 3 * 3600 * 1000;
const pad = (x: number) => String(x).padStart(2, "0");
// "bugün 14:32" | "dün 14:32" | "12 Kas 14:32" (İstanbul, UTC+3).
export function formatDraftTime(at: number, now = Date.now()): string {
  const d = new Date(at + TR);
  const day = Math.floor((at + TR) / 86400000);
  const today = Math.floor((now + TR) / 86400000);
  const clock = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  if (day === today) return `bugün ${clock}`;
  if (day === today - 1) return `dün ${clock}`;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${clock}`;
}

// Firma/kullanıcı değişince silinecek taslak anahtarları (bu kapsamın dışındakiler); kapsam yoksa hepsi.
export function staleKeys(keys: string[], keepPrefix: string | null): string[] {
  return keys.filter((k) => k.startsWith(DRAFT_PREFIX) && !(keepPrefix && k.startsWith(keepPrefix)));
}
