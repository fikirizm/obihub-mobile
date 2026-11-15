// Kasa ve bankalar (D-15; saf modül, birim testi: dev/test-kasa-ui.mjs). Sözleşme: docs/pm/tasarim/D-15.md.
// Hesap listesi aktif/arşiv sekmeli ve gruplu (Paraşüt aynası / ObiHub), toplamlar para birimi başına (asla tek sayı),
// arşivle/arşivden çıkar/sil sunucunun `actions`'ına göre, hareket listesi imleçli (açılış tarihi öncesi satırlar ayrı).

export type AccountStatus = "active" | "archived" | "all";

type Acc = {
  id?: string; currency?: string; balance?: number; group?: string; read_only?: boolean; archived?: boolean;
  is_active?: boolean; active?: boolean; is_deleted?: boolean;
  actions?: { add_movement?: boolean; transfer?: boolean; edit?: boolean; archive?: boolean; unarchive?: boolean; delete?: boolean } | null;
};
type Group = { key?: string; label?: string; count?: number; account_ids?: string[] };
type ListResp<A> = {
  items?: A[]; groups?: Group[]; counts?: { active?: number; archived?: number };
  totals_by_currency?: Record<string, number>; archived_totals_by_currency?: Record<string, number>;
};

const normCur = (c?: string | null) => {
  const v = String(c || "TRY").trim().toUpperCase();
  return v === "TRL" || v === "TL" || v === "" ? "TRY" : v;
};

export function accountsPath(status: AccountStatus) {
  return status === "active" ? "/finance/accounts" : `/finance/accounts?status=${status}`;
}

// Sunucunun gruplarıyla bölümler; tek grup varsa başlık "Hesaplar". Grupta olmayan hesap (eski sunucu) son bölüme.
export function accountSections<A extends Acc>(resp: ListResp<A>) {
  const items = Array.isArray(resp?.items) ? resp.items : [];
  const groups = (Array.isArray(resp?.groups) ? resp.groups : []).filter((g) => Array.isArray(g?.account_ids));
  if (!groups.length) return items.length ? [{ key: "all", title: "Hesaplar", items }] : [];
  const byId = new Map(items.map((a) => [String(a.id), a]));
  const used = new Set<string>();
  const sections = groups
    .map((g) => {
      const list = (g.account_ids || []).map((id) => byId.get(String(id))).filter(Boolean) as A[];
      list.forEach((a) => used.add(String(a.id)));
      return { key: String(g.key || ""), title: String(g.label || "Hesaplar"), items: list };
    })
    .filter((s) => s.items.length > 0);
  const rest = items.filter((a) => !used.has(String(a.id)));
  if (rest.length) {
    const obi = sections.find((s) => s.key === "obihub");
    if (obi) obi.items.push(...rest);
    else sections.push({ key: "other", title: "Hesaplar", items: rest });
  }
  if (sections.length === 1) sections[0].title = "Hesaplar";
  return sections;
}

const ordered = (map: Record<string, number>) =>
  Object.entries(map)
    .map(([currency, amount]) => ({ currency, amount: Number(amount) || 0 }))
    .sort((a, b) => (a.currency === "TRY" ? -1 : b.currency === "TRY" ? 1 : a.currency.localeCompare(b.currency)));

// Para birimi başına toplam: sunucunun `totals_by_currency`'si, yoksa satırlardan (kuruşa yuvarlanmış).
export function currencyTotals(resp: ListResp<Acc>) {
  if (resp?.totals_by_currency && typeof resp.totals_by_currency === "object") {
    const m: Record<string, number> = {};
    for (const [c, v] of Object.entries(resp.totals_by_currency)) m[normCur(c)] = (m[normCur(c)] || 0) + (Number(v) || 0);
    return ordered(m);
  }
  const m: Record<string, number> = {};
  for (const a of resp?.items || []) {
    const c = normCur(a.currency);
    m[c] = Math.round(((m[c] || 0) + (Number(a.balance) || 0)) * 100) / 100;
  }
  return ordered(m);
}

export function archivedNote(resp: ListResp<Acc>, fmt: (v: number, c: string) => string) {
  const map = resp?.archived_totals_by_currency;
  if (!map || typeof map !== "object") return null;
  const parts = ordered(map).filter((x) => Math.abs(x.amount) > 0.004);
  return parts.length ? `Arşivli hesaplar bu toplama dahil değil: ${parts.map((x) => fmt(x.amount, x.currency)).join(", ")}` : null;
}

export function tabCounts(resp: ListResp<unknown>) {
  const c = resp?.counts;
  if (c && typeof c === "object") return { active: Number(c.active) || 0, archived: Number(c.archived) || 0 };
  return { active: Array.isArray(resp?.items) ? resp.items.length : 0, archived: 0 };
}

// Düğmeler sunucunun kararıdır; `actions` gelmeyen eski sunucuda yalnız hareket ekleme/virman (aynalı ya da arşivli değilse).
export function accountActions(a: Acc) {
  const x = a?.actions;
  if (x && typeof x === "object") {
    return { addMovement: x.add_movement === true, transfer: x.transfer === true, archive: x.archive === true, unarchive: x.unarchive === true, remove: x.delete === true };
  }
  const writable = a?.read_only !== true && a?.archived !== true;
  return { addMovement: writable, transfer: writable, archive: false, unarchive: false, remove: false };
}

export const ARCHIVE_CONFIRM_TEXT = "Kayıt artık Kasa ve Bankalar listelerinde görünmeyecek. Bu kasa/banka'ya işlenmiş kayıtlar etkilenmeyecek.";
export const DELETE_CONFIRM_TEXT = "Dikkat, silme işlemi geri alınamaz. Hesap listeden kalkar.";

const ACCOUNT_ERRORS: Record<string, string> = {
  ACCOUNT_DEFAULT_LOCKED: "Varsayılan kasa arşivlenemez ve silinemez.",
  ACCOUNT_HAS_MOVEMENTS: "Hareketi olan hesap silinemez; arşivleyebilirsiniz.",
  OPERATION_PENDING: "Bu hesaba yazacak bir işlem sürüyor; biraz sonra yeniden deneyin.",
  ACCOUNT_INACTIVE: "Bu hesap arşivde; hareket yazılamaz.",
  PAYMENT_ACCOUNT_INACTIVE: "Seçilen hesap arşivde; başka bir hesap seçin.",
  MIRROR_ACCOUNT_READ_ONLY: "Bu hesap Paraşüt'ten geliyor; Paraşüt'te yönetilir.",
  ACCOUNT_NOT_FOUND: "Hesap bulunamadı; silinmiş olabilir.",
};
const generic = (m?: string) => !m || /^Sunucu hatası/.test(m);

// 409 ACCOUNT_BALANCE_NOT_ZERO → onay (confirm_nonzero_balance ile yeniden gönderilir); diğerleri tek metin.
export function archiveError(err: { status?: number; code?: string; message?: string; data?: any }, fmt?: (v: number, c: string) => string) {
  if (err?.code === "ACCOUNT_BALANCE_NOT_ZERO") {
    const bal = Number(err.data?.balance);
    const cur = normCur(err.data?.currency);
    const amount = Number.isFinite(bal) ? (fmt ? fmt(bal, cur) : `${bal} ${cur}`) : "";
    return { confirm: true, text: `${ARCHIVE_CONFIRM_TEXT}\n\nHesabın bakiyesi sıfır değil${amount ? ` (${amount})` : ""}; hareketler ve bakiye korunur.` };
  }
  const known = err?.code ? ACCOUNT_ERRORS[err.code] : undefined;
  return { confirm: false, text: known && generic(err?.message) ? known : err?.message || known || "İşlem yapılamadı." };
}

export type MovementFilter = { cursor?: string | null; limit?: number; order?: "desc" | "asc"; dateFrom?: string; dateTo?: string; direction?: "in" | "out" };

// İlk sayfa (imleçsiz, süzgeçsiz) geri alınan hareketleri de ister (undone_items).
export function movementsPath(accountId: string, f: MovementFilter) {
  const qs = new URLSearchParams({ limit: String(f.limit || 50) });
  if (f.cursor) qs.set("cursor", f.cursor);
  if (f.order && f.order !== "desc") qs.set("order", f.order);
  if (f.dateFrom) qs.set("date_from", f.dateFrom);
  if (f.dateTo) qs.set("date_to", f.dateTo);
  if (f.direction) qs.set("direction", f.direction);
  if (!f.cursor && !f.dateFrom && !f.dateTo && !f.direction) qs.set("include_undone", "true");
  return `/finance/accounts/${encodeURIComponent(accountId)}/movements?${qs.toString()}`;
}

const ENTRY_LABELS: Record<string, string> = { income: "Gelir", expense: "Gider", transfer_in: "Gelen virman", transfer_out: "Giden virman" };

export function movementRow(e: { entry_type?: string; direction?: string; amount?: number; running_balance?: number | null; before_opening?: boolean }) {
  const type = String(e?.entry_type || "");
  const incoming = e?.direction ? e.direction === "in" : type === "income" || type === "transfer_in";
  const rb = e?.running_balance;
  return {
    incoming,
    typeLabel: ENTRY_LABELS[type] || "Hareket",
    balance: typeof rb === "number" && Number.isFinite(rb) ? rb : null,
    tag: e?.before_opening === true ? "Açılış öncesi" : null,
  };
}

export function movementTotals(resp: { totals?: { in?: number; out?: number; net?: number; count?: number; currency?: string; before_opening?: { in?: number; out?: number; count?: number } } }) {
  const t = resp?.totals;
  if (!t || typeof t !== "object") return null;
  const beforeCount = Number(t.before_opening?.count) || 0;
  return {
    currency: normCur(t.currency),
    in: Number(t.in) || 0,
    out: Number(t.out) || 0,
    net: Number(t.net) || 0,
    count: Number(t.count) || 0,
    beforeCount,
    beforeNote: beforeCount ? `${beforeCount} hareket açılış tarihinden önce; bakiyeyi etkilemez.` : null,
  };
}

// Hesap seçicileri (tahsilat, ödeme, virman): arşivli, pasif ve Paraşüt aynalı (yazılamaz) hesap gösterilmez.
export function pickable(a: Acc) {
  if (!a) return false;
  if (a.archived === true || a.is_active === false || a.active === false || a.is_deleted === true) return false;
  if (a.read_only === true) return false;
  if (a.actions && a.actions.add_movement === false) return false;
  return true;
}
