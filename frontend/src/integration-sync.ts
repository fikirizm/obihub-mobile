// Entegrasyon eşitleme (saf modül; birim testi dev/test-integration-sync.mjs). İlk kullanım dalgası (2eb3cc4b9):
// * Tam / ilk / 15 günü aşan sipariş çekimi 202 + {job_id} döner; GET /integration-jobs/{id} → {state, progress{done,total,label}, partial,
//   error_tr, error_kind}. Aynı entegrasyonda çekim sürüyorsa 409 + X-Job-Id: o iş izlenir, yeniden başlatılmaz. ≤15 gün senkron.
// * Entegrasyon satırı: auto_sync_status="auth_failed" → "Yetki gerekli – Yeniden bağlan"; geçici hata (rate_limited, transient) "Hata"
//   değildir: durum Bağlı kalır, son hata ikincil satırda.

export const jobIdOf = (r: any): string | null => (r && typeof r.job_id === "string" && r.job_id ? r.job_id : null);
export const jobIdOfError = (e: any): string | null => (Number(e?.status) === 409 && typeof e?.jobId === "string" && e.jobId ? e.jobId : null);

type Tone = "info" | "success" | "error";
const TEMPORARY = ["rate_limited", "transient"];
export function jobView(job: any): { phase: "running" | "done" | "failed"; percent: number | null; text: string; tone: Tone } {
  const st = String(job?.state || "");
  if (st === "done") {
    const msg = typeof job?.message === "string" && job.message.trim() ? job.message.trim() : "";
    if (job?.partial) return { phase: "done", percent: 100, text: msg || "Siparişlerin bir kısmı çekildi; kalanlar bir sonraki eşitlemede gelir.", tone: "info" };
    return { phase: "done", percent: 100, text: msg || "Sipariş çekimi tamamlandı.", tone: "success" };
  }
  if (st === "failed") {
    const text = typeof job?.error_tr === "string" && job.error_tr.trim() ? job.error_tr.trim() : "Sipariş çekimi tamamlanamadı.";
    return { phase: "failed", percent: null, text, tone: TEMPORARY.includes(String(job?.error_kind || "")) ? "info" : "error" };
  }
  const done = Number(job?.progress?.done);
  const total = Number(job?.progress?.total);
  const percent = Number.isFinite(done) && Number.isFinite(total) && total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null;
  const label = typeof job?.progress?.label === "string" && job.progress.label.trim() ? job.progress.label.trim() : "";
  return { phase: "running", percent, text: percent != null ? `${label || "Çekiliyor"} · %${percent}` : label || "Çekim sürüyor…", tone: "info" };
}

export function integrationStatus(i: any): { label: string; tone: "success" | "error" | "warning"; reconnect: boolean; note: string | null } {
  if (i?.auto_sync_status === "auth_failed") return { label: "Yetki gerekli – Yeniden bağlan", tone: "error", reconnect: true, note: null };
  const k = String(i?.status || "").trim().toLowerCase();
  if (k === "success" || k === "connected") {
    const err = typeof i?.last_sync_error === "string" && i.last_sync_error.trim() ? i.last_sync_error.trim() : "";
    const note = i?.sync_running ? "Sipariş çekimi sürüyor…" : err ? `Son çekim: ${err}` : null;
    return { label: "Bağlı", tone: "success", reconnect: false, note };
  }
  if (k === "failed") return { label: "Bağlantı sorunu", tone: "error", reconnect: true, note: null };
  return { label: "Kurulum bekliyor", tone: "warning", reconnect: false, note: null };
}
