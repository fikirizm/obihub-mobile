// Gider faturası silme / arşivleme (saf modül; birim testi dev/test-delete-guard.mjs). Paraşüt'ün "Kayıt silinemiyor ve
// arşivlenemiyor" penceresi. Sunucu: routers/expense_invoices.py + document_delete_guard.py (web: DeleteBlockedDialog, ExpenseLifecycleDialog).
// Akış: delete-check (her zaman 200) → engel varsa tüm sebepler birlikte; yoksa onay → DELETE / POST archive. İşlem 409 dönerse kontrol
// yeniden çağrılır; yine izin verirse onay döngüsü yerine "hâlâ işleniyor".

export type GuardAction = "delete" | "archive";
type Reason = { code?: string; message?: string; action?: { label?: string; kind?: string; href?: string; ref?: string } | null };
export type Verdict = {
  allowed: boolean; action?: string; code?: string | null; title?: string; detail?: string;
  reasons?: Reason[]; warnings?: { code?: string; message?: string }[];
  confirm?: { title?: string; message?: string; button?: string } | null;
};

const base = (id: string) => `/accounting/expense-invoices/${encodeURIComponent(id)}`;
export const checkPath = (id: string, action: GuardAction) => `${base(id)}/delete-check?action=${action}`;
export const actionPath = (id: string, action: GuardAction | "unarchive") => (action === "delete" ? base(id) : `${base(id)}/${action}`);

export function verdictOf(v: any): Verdict | null {
  return v && typeof v === "object" && typeof v.allowed === "boolean" ? (v as Verdict) : null;
}

export type ReasonTarget = { label: string; pathname: "/expenses/pay" | "/incoming"; params: Record<string, string> } | null;

// Sebep eylemi → mobil rota. payments/pay: borç ödeme ekranı (ref; yoksa faturanın borç ref'i); incoming_inbox: Gelen e-Faturalar.
// Bilinmeyen eylem ya da web adresi düğmesiz kalır.
function targetOf(a: Reason["action"], payableRef?: string | null): ReasonTarget {
  if (!a || typeof a !== "object" || !a.label) return null;
  const label = String(a.label);
  if (a.kind === "payments" || a.kind === "pay") {
    const ref = a.ref || payableRef;
    return ref ? { label, pathname: "/expenses/pay", params: { ref: String(ref) } } : null;
  }
  if (a.kind === "incoming_inbox") return { label, pathname: "/incoming", params: {} };
  return null;
}

export function dialogModel(v: Verdict, action: GuardAction, payableRef?: string | null) {
  if (!v.allowed) {
    return {
      mode: "blocked" as const,
      title: v.title || "Kayıt silinemiyor ve arşivlenemiyor",
      detail: v.detail || "",
      reasons: (Array.isArray(v.reasons) ? v.reasons : []).map((r) => ({ code: String(r?.code || ""), message: String(r?.message || ""), target: targetOf(r?.action, payableRef) })),
      warnings: [] as string[], message: "", button: "Tamam", destructive: false,
    };
  }
  const c = v.confirm || {};
  return {
    mode: "confirm" as const,
    title: c.title || (action === "archive" ? "Fatura arşivlensin mi?" : "Fatura silinsin mi?"),
    detail: "",
    reasons: [] as { code: string; message: string; target: ReasonTarget }[],
    warnings: (Array.isArray(v.warnings) ? v.warnings : []).map((w) => String(w?.message || "")).filter(Boolean),
    message: c.message || "",
    button: c.button || (action === "archive" ? "Faturayı arşivle" : "Faturayı sil"),
    destructive: action === "delete",
  };
}

export const STILL_PROCESSING = "Fatura kaydı hâlâ işleniyor. Kayıt değişmedi; birkaç dakika sonra yeniden deneyin.";
export const after409 = (v: Verdict | null) => (!v ? "error" : v.allowed ? "processing" : "blocked");

const generic = (m?: string) => !m || /^Sunucu hatası/.test(m);
export function checkErrorText(err: { status?: number; message?: string }) {
  if (Number(err?.status) === 404) return "Bu kayıt bulunamadı; zaten silinmiş olabilir.";
  return generic(err?.message) ? "Şu anda kontrol edilemedi. Kayıt değişmedi; biraz sonra yeniden deneyin." : String(err.message);
}
export const doneText = (action: GuardAction) => (action === "archive" ? "Fatura arşivlendi." : "Fatura silindi; stok ve tedarikçi bakiyesi geri alındı.");
export function runErrorText(err: { status?: number; message?: string }, action: GuardAction) {
  return generic(err?.message) ? (action === "archive" ? "Fatura arşivlenemedi. Kayıt değişmedi." : "Fatura silinemedi. Kayıt değişmedi.") : String(err.message);
}
