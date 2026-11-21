// Gelen e-fatura kaynağı (saf modül; birim testi dev/test-incoming-source.mjs). Faz A M7: BenimPOS gelen kutusu kaldırıldı
// (sunucu hep boş döner); web IncomingEInvoicesPage BenimPOS'ta yönlendirici metin gösterir. Sıra: kayıtlı kaynak, muhasebe programı, ilk bağlı.

export type Source = "parasut" | "turkcell-efatura";

export function incomingSources(acc: any, turkcell: any, saved: any): { source: Source | null; connected: Source[]; benimposOnly: boolean } {
  const connected: Source[] = [];
  if (acc?.parasut?.connected) connected.push("parasut");
  if (turkcell?.connected) connected.push("turkcell-efatura");
  const wanted = [saved?.source, acc?.provider].map((x) => String(x || ""));
  const source = (wanted.find((w) => connected.includes(w as Source)) as Source | undefined) ?? connected[0] ?? null;
  return { source, connected, benimposOnly: !connected.length && acc?.benimpos?.connected === true };
}

export const BENIMPOS_TEXT = "BenimPOS alış kayıtları gelen e-fatura kaynağı değildir. Gelen e-faturalar için Turkcell veya Paraşüt e-fatura bağlantısını kullanın.";
export const NO_SOURCE_TEXT = "Gelen e-faturalar Paraşüt veya Turkcell e-Fatura bağlantısıyla çalışır. Bağlantı web panelinden yapılır.";
