// Faz C5 "Ürünleri kanaldan çek" + eşleştirme onay kuyruğu (saf modül; birim testi dev/test-channel-import.mjs).
// Akış: kanal seç → çek (POST {id}/scan → 202 {job_id, run_id}; sürüyorsa 409 + X-Job-Id) → önizleme (GET runs/{id}, rows) → onayla
// (POST runs/{id}/apply → 202) → sonuç. Emin olunamayan eşleşmeler kuyruğa düşer: önerilen karta bağla / başka karta bağla / yeni ürün /
// yoksay (POST queue/{row}/resolve). Aynı satıra ikinci karar 409; OTHER_STORE satırda yalnız "Yoksay". Web: lib/channelImport.js.

export const BASE = "/products/channel-import";
export const PROVIDERS = ["trendyol", "hepsiburada", "n11", "amazon", "idefix", "pazarama", "woocommerce"];
const LABELS: Record<string, string> = {
  trendyol: "Trendyol",
  hepsiburada: "Hepsiburada",
  n11: "n11",
  amazon: "Amazon",
  idefix: "idefix",
  pazarama: "Pazarama",
  woocommerce: "WooCommerce",
};
export const channelLabel = (p: unknown) => {
  const k = String(p || "").toLowerCase();
  return LABELS[k] || k || "Kanal";
};
const nf = (v: unknown) => (Number(v) || 0).toLocaleString("tr-TR");

export function importableIntegrations(list: any[]) {
  return (Array.isArray(list) ? list : [])
    .filter((i) => PROVIDERS.includes(String(i?.provider || "").toLowerCase()) && String(i?.status || "") !== "deleted")
    .map((i) => ({ id: String(i.id), provider: String(i.provider).toLowerCase(), name: String(i.name || channelLabel(i.provider)) }));
}

// --- Yollar ---
export const scanPath = (integrationId: string) => `${BASE}/${encodeURIComponent(integrationId)}/scan`;
export const runPath = (runId: string) => `${BASE}/runs/${encodeURIComponent(runId)}`;
export const applyPath = (runId: string) => `${BASE}/runs/${encodeURIComponent(runId)}/apply`;
export function rowsPath(runId: string, decision: string, page = 1) {
  const q = new URLSearchParams({ page: String(page), per_page: "50" });
  if (decision) q.set("decision", decision);
  return `${BASE}/runs/${encodeURIComponent(runId)}/rows?${q.toString()}`;
}
export const latestPath = (integrationId: string) => `${BASE}/latest?integration_id=${encodeURIComponent(integrationId)}`;
export function queuePath(integrationId: string, page = 1) {
  const q = new URLSearchParams({ page: String(page), per_page: "25" });
  if (integrationId) q.set("integration_id", integrationId);
  return `${BASE}/queue?${q.toString()}`;
}
export const resolvePath = (rowId: string) => `${BASE}/queue/${encodeURIComponent(rowId)}/resolve`;
export const resolveBody = (action: "link" | "new" | "skip", productId?: string) => ({ action, ...(productId ? { product_id: productId } : {}) });

// --- Çalışma ve iş ---
export function stepForRun(run: any): "start" | "review" | "done" {
  if (!run) return "start";
  if (run.state === "ready") return "review";
  if (run.state === "applied" || run.state === "partial" || run.state === "applying") return "done";
  return "start";
}
export const defaultFilter = (c: any) => (c?.new ? "new" : c?.match ? "match" : c?.ambiguous ? "ambiguous" : "skip");
export function progressText(job: any, fallback: string) {
  const p = job?.progress || {};
  const done = Number(p.done || 0);
  const total = Number(p.total || 0);
  const label = String(p.label || "").trim() || fallback;
  if (total > 0) return `${label} (${nf(Math.min(done, total))}/${nf(total)})`;
  return done > 0 ? `${label} (${nf(done)})` : `${fallback}…`;
}
export function jobOutcome(job: any): { phase: "running" | "done" | "failed"; message: string } {
  if (job?.state === "done") return { phase: "done", message: "" };
  if (job?.state === "failed") return { phase: "failed", message: String(job.error_tr || "İşlem tamamlanamadı. Birkaç dakika sonra yeniden deneyin.") };
  return { phase: "running", message: "" };
}

export const FILTERS: [string, string][] = [["new", "Yeni"], ["match", "Eşleşen"], ["ambiguous", "Onay bekleyen"], ["skip", "Atlanan"], ["linked", "Zaten bağlı"]];
export function reviewView(run: any) {
  const c = run?.counts || {};
  const num = (k: string) => Number(c[k] || 0);
  return {
    total: num("total"),
    stats: [
      { label: "Yeni ürün", value: num("new"), tone: "success" },
      { label: "Eşleşen", value: num("match") + num("linked"), tone: "success" },
      { label: "Onay bekleyen", value: num("ambiguous"), tone: "warning" },
      { label: "Atlanan", value: num("skip"), tone: "neutral" },
    ],
    writable: num("new") + num("match") + num("linked") + num("ambiguous"),
    stockNote:
      run?.stock_mode === "none"
        ? `Stok sahibi muhasebe programınız (${run.inventory_owner_label || "muhasebe programı"}). Ürün kartları ve kanal bağları açılır; stok yazılmaz, bir sonraki muhasebe turunda gelir.`
        : "Yeni ürünlerin kanaldaki stoğu Ana depoya açılış stoğu olarak yazılır. Eşleşen ürünlerin ObiHub stoğu değişmez.",
    warnings: [...(run?.partial ? [String(run.partial)] : []), ...(Array.isArray(run?.warnings) ? run.warnings.map(String) : [])],
  };
}
export function doneView(run: any) {
  const a = run?.applied || {};
  const num = (k: string) => Number(a[k] || 0);
  return {
    title: run?.state === "partial" ? "Aktarım kısmen tamamlandı" : "Aktarım tamamlandı",
    message: String(run?.message || ""),
    stats: [
      { label: "Yeni ürün", value: num("created"), tone: "success" },
      { label: "Bağlanan", value: num("linked"), tone: "success" },
      { label: "Onay kuyruğunda", value: num("queued"), tone: "warning" },
      { label: "Aktarılamayan", value: num("failed") + num("limit_skipped"), tone: "error" },
    ],
    retry: run?.state === "partial",
    queued: num("queued"),
  };
}

// --- Satırlar ---
const DECISION: Record<string, string> = { new: "Yeni ürün açılacak", match: "Mevcut ürüne bağlanacak", linked: "Zaten bağlı", ambiguous: "Onayınız gerekiyor", skip: "Atlanacak" };
export const MATCH_BY: Record<string, string> = { barcode: "barkod", sku: "stok kodu", model_code: "model kodu", name: "ad", link: "kanal bağı" };
export function rowDecisionText(r: any) {
  const base = DECISION[r?.decision] || "";
  const by = MATCH_BY[r?.match_by];
  if (r?.decision === "match" && by) return `${base} (${by} eşleşti)`;
  if ((r?.decision === "ambiguous" || r?.decision === "skip") && r?.reason_text) return String(r.reason_text);
  return base;
}
export function rowCodes(r: any) {
  const parts = [r?.barcode && `Barkod ${r.barcode}`, r?.sku && `SKU ${r.sku}`, r?.model_code && `Model ${r.model_code}`, r?.stock != null && `Stok ${nf(r.stock)}`].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Kod yok";
}

// --- Onay kuyruğu ---
export function queueRowView(r: any) {
  return {
    id: String(r?.id || ""),
    channel: channelLabel(r?.provider),
    title: `${r?.name || "Ürün"}${r?.variant ? ` · ${r.variant}` : ""}`,
    codes: rowCodes({ ...r, stock: null }),
    reason: String(r?.reason_text || ""),
    onlySkip: r?.reason === "OTHER_STORE",
    candidates: (Array.isArray(r?.candidates) ? r.candidates : []).map((c: any) => ({ id: String(c.product_id), name: String(c.name || "Adsız ürün"), text: candidateText(c) })),
  };
}
export function candidateText(c: any) {
  return [c?.sku && `SKU ${c.sku}`, c?.barcode && `Barkod ${c.barcode}`, MATCH_BY[c?.by] && `${MATCH_BY[c.by]} benzer`].filter(Boolean).join(" · ");
}
export function resolveText(res: any) {
  if (res?.result === "created") return "Yeni ürün açıldı ve kanala bağlandı.";
  if (res?.result === "linked") return "Ürün kanala bağlandı.";
  return "Ürün yoksayıldı.";
}
export function resolveError(e: any): { text: string; reload: boolean } {
  if (e?.code === "ROW_ALREADY_RESOLVED") return { text: "Bu ürün için zaten karar verilmiş; liste yenilendi.", reload: true };
  if (e?.code === "CHANNEL_LINK_OTHER_STORE") return { text: "Kart başka mağazadaki kanal ürününe bağlı; önce o bağı kaldırın ya da yoksayın.", reload: false };
  const msg = typeof e?.message === "string" && e.message.trim() && !/^Sunucu hatası/.test(e.message) ? e.message.trim() : "";
  return { text: msg || "Karar kaydedilemedi.", reload: false };
}

// --- Ürün kartında kanal ayrıntıları (channel_details.<kanal>) ---
export function channelDetails(details: any) {
  if (!details || typeof details !== "object") return [];
  return Object.entries(details)
    .map(([k, v]: [string, any]) => ({
      channel: channelLabel(k),
      text: [v?.barcode && `Barkod ${v.barcode}`, v?.channel_sku && `Kanal SKU ${v.channel_sku}`, v?.model_code && `Model ${v.model_code}`, v?.variant].filter(Boolean).join(" · "),
    }))
    .filter((x) => x.text);
}
