// HepsiJet ekranı kuralları (saf modül; birim testi dev/test-hepsijet-ui.mjs).
// 13 Kas 2026 (kullanıcı isteği): HepsiJet alt sekmeden çıkıp Menü'ye taşındı; yalnız HepsiJet kurulu firmada görünür.
// Düzeltme (PM, aynı gün): HepsiJet entegrasyon kaydı DEĞİLDİR (ayar user_settings.hepsijet; canlıda provider "hepsijet"
// kaydı yok). Görünürlük GET /hepsijet/config → { configured: true } ile; okunamazsa gizli.
// Alıcı listesinden doğrudan silme yok; düzeltme/silme kaydın içinde.

export function hepsiJetVisible(config: { configured?: unknown } | null | undefined): boolean {
  return config?.configured === true;
}

export type RecipientForm = { full_name: string; phone: string; email: string; city: string; town: string; district: string; address_line: string };

export function recipientError(f: RecipientForm): string | null {
  if (!f.full_name.trim()) return "Ad soyad zorunludur.";
  if (f.phone.replace(/\D/g, "").length < 10) return "Telefon en az 10 haneli olmalıdır.";
  if (!f.city.trim() || !f.town.trim() || !f.district.trim()) return "İl, ilçe ve mahalle zorunludur.";
  if (!f.address_line.trim()) return "Adres zorunludur.";
  return null;
}

const fold = (s: unknown) => String(s ?? "").toLocaleLowerCase("tr-TR");

export function filterRecipients<T extends Partial<RecipientForm>>(list: T[], query: string): T[] {
  const q = fold(query).trim();
  if (!q) return list;
  return list.filter((c) => [c.full_name, c.phone, c.city, c.town, c.district, c.email].some((s) => s && fold(s).includes(q)));
}
