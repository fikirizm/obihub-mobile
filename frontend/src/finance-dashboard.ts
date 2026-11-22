// P6.3 pano sayaçları + Gelir-Gider etiket kırılımı (saf modül; birim testi dev/test-finance-dashboard.mjs).
// Sayaçlar: GET /finance/dashboard-counters → {recurring:{active,due_today,due_week,failing}, unsent:{count,window_days,capped}|null}.
// unsent null = satış yetkisi yok, kart gizli; 403 = tüm sayaçlar gizli. Yazdırılmamış sayacı yok (kullanıcı kararı).
// Gönderilmemiş kartı → GET /local-invoices?unsent=1 (sayaçla aynı küme; sipariş faturaları hariç, son 90 gün).
// Etiket: income-expense-summary currencies[].tags [{tag_id|null, name, income, expense, result}] + scope.notes.tags. Web: durumVerisi.js, ReportsPage.js.

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type CounterTile = { key: "recurring" | "unsent"; label: string; value: string; hint: string; warn: boolean; route: any };

export function counterTiles(data: any): CounterTile[] {
  if (!data || typeof data !== "object") return [];
  const rec = data.recurring || {};
  const unsent = data.unsent && typeof data.unsent === "object" ? data.unsent : null;
  const failing = num(rec.failing);
  const tiles: CounterTile[] = [
    {
      key: "recurring",
      label: "Tekrarlayan belgeler",
      value: String(num(rec.due_week)),
      warn: failing > 0,
      hint:
        failing > 0
          ? `${failing} plan hatalı · ${num(rec.due_today)} bugün`
          : num(rec.due_week) > 0
          ? `${num(rec.due_today)} bugün, 7 gün içinde ${num(rec.due_week)} çalışacak`
          : `7 gün içinde çalışacak plan yok · ${num(rec.active)} etkin`,
      route: "/recurring",
    },
  ];
  if (unsent)
    tiles.push({
      key: "unsent",
      label: "Gönderilmemiş fatura",
      value: String(num(unsent.count)),
      warn: num(unsent.count) > 0,
      hint: `Son ${num(unsent.window_days) || 90} günde gönderilmemiş; sipariş faturaları hariç${unsent.capped ? " (en az)" : ""}`,
      route: { pathname: "/local-invoices", params: { unsent: "1" } },
    });
  return tiles;
}

export const countersFailure = (e: any): "forbidden" | "error" => (Number(e?.status) === 403 ? "forbidden" : "error");

export const isUnsentParam = (v: unknown) => (Array.isArray(v) ? v[0] : v) === "1";
export const UNSENT_CHIP = "Gönderilmemiş faturalar (son 90 gün)";

export type TagRow = { key: string; name: string; untagged: boolean; income: number; expense: number; result: number; loss: boolean };
export function tagRows(currency: any): TagRow[] {
  return (Array.isArray(currency?.tags) ? currency.tags : []).map((t: any) => {
    const untagged = t?.tag_id === null || t?.tag_id === undefined || t?.tag_id === "";
    const result = num(t?.result);
    return {
      key: untagged ? "untagged" : String(t.tag_id),
      name: String(t?.name || (untagged ? "Etiketsiz" : t.tag_id)),
      untagged,
      income: num(t?.income),
      expense: num(t?.expense),
      result,
      loss: result < 0,
    };
  });
}
export const DEFAULT_TAG_NOTE = "Etiketli belge her etiketinde sayılır; etiket toplamı rapor toplamını aşabilir. Etiketsiz belgeler ayrı satırdadır.";
export const tagNote = (data: any) => String(data?.scope?.notes?.tags || "").trim() || DEFAULT_TAG_NOTE;
