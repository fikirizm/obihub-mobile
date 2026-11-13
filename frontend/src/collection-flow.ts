// Aşama 4 / P11: tahsilat silme akışı (cari ekstresi ve fatura "Tahsilatlar" ortak).  Web: CollectionVoidDialog.
// Onay → DELETE + Idempotency-Key; belirsiz sonuçta (ağ / 5xx / MONEY_INCOMPLETE) sorulur ve AYNI anahtarla yeniden gönderilir.
import { newIdempotencyKey } from "./api";
import { sendKeyedMoney, voidCollection } from "./api-finans";
import { collectionDoneText, collectionErrorText, collectionWarnings, collectionWriteKind, PARASUT_TEXT, VOID_TEXT, type Collection } from "./collection-actions";
import { formatDate, formatMoney } from "./utils";

type Deps = {
  token: string;
  c: Collection;
  currency: string;
  confirm: (o: { title: string; message?: string; confirmLabel?: string; destructive?: boolean }) => Promise<boolean>;
  toast: (message: string, kind?: "success" | "error" | "info") => void;
};

export function voidMessage(c: Collection, currency: string): string {
  const lines = [VOID_TEXT, ""];
  lines.push(`Tutar: ${formatMoney(Number(c.amount || 0), currency)} · Tarih: ${c.date ? formatDate(c.date) : "—"}`);
  if (c.type === "invoice" && c.invoice_number) lines.push(`Fatura: ${c.invoice_number}`);
  const invoices = (c.invoices || []).filter((i) => i && i.invoice_id);
  if (invoices.length) {
    lines.push("", "Yeniden açılacak faturalar:");
    for (const i of invoices) lines.push(`• ${i.invoice_number || "Fatura"} · ${formatMoney(Number(i.amount || 0), currency)} kalan bakiyeye geri eklenir`);
  } else if (c.type === "customer") lines.push("", "Tahsilat faturalara işlenmemişti; tutar carinin alacak bakiyesinde duruyordu.");
  if (c.parasut) lines.push("", PARASUT_TEXT);
  return lines.join("\n");
}

// true: bir şey değişmiş olabilir (çağıran listeyi yeniler).
export async function runVoidCollection({ token, c, currency, confirm, toast }: Deps): Promise<boolean> {
  const ok = await confirm({ title: "Tahsilat silinsin mi?", message: voidMessage(c, currency), confirmLabel: "Tahsilatı sil", destructive: true });
  if (!ok) return false;
  const key = newIdempotencyKey("void");
  const out = await sendKeyedMoney(
    () => voidCollection(token, c, key),
    () =>
      confirm({
        title: "Sonuç alınamadı",
        message: "Tahsilat silinmiş olabilir. Aynı işlemi yeniden gönderebilirsiniz; ikinci kez işlenmez.",
        confirmLabel: "Yeniden gönder",
      })
  );
  if (out.ok) {
    toast([collectionDoneText("void", out.result), ...collectionWarnings(out.result)].join(" "), "success");
  } else {
    const kind = collectionWriteKind(out.error);
    toast(collectionErrorText(out.error), kind === "pending" ? "info" : "error");
  }
  return true;
}
