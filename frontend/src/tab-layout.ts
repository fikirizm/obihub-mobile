// Alt sekme düzeni (saf modül; birim testi dev/test-tab-layout.mjs).
// Kullanıcı kararı (13 Kas 2026): "ObiHub iconunu ortaya al; tıklanınca Panel açılır; 2 sağa 2 sola."
// Soldan sağa: Mağaza · Sipariş · [ObiHub rozeti = Panel] · Finans · Menü. HepsiJet Menü'de (yalnız entegrasyonu olan firmada).

export type TabName = "dashboard" | "integrations" | "orders" | "finance" | "menu";

export const CENTER_TAB: TabName = "dashboard";
// Panel'e giden mevcut yönlendirmeler değişmez (giriş, POS, geri düğmesi, bildirim).
export const PANEL_ROUTE = "/(tabs)/dashboard";

export const TAB_LABELS: Record<TabName, string> = {
  dashboard: "Panel",
  integrations: "Mağaza",
  orders: "Sipariş",
  finance: "Finans",
  menu: "Menü",
};

// Mağaza sekmesi entegrasyon yetkisi olmayan rollerde gizlenir; rozet ortada kalsın diye yerinde boş yer tutucu (null) durur.
export function tabSlots(access: { integrations: boolean }): { left: (TabName | null)[]; center: TabName; right: TabName[] } {
  return { left: [access.integrations ? "integrations" : null, "orders"], center: CENTER_TAB, right: ["finance", "menu"] };
}

export function tabOrder(access: { integrations: boolean }): TabName[] {
  const s = tabSlots(access);
  return [...s.left, s.center, ...s.right].filter((x): x is TabName => x !== null);
}

// Ortadaki rozet (kullanıcı, 13 Kas 2026: "Panel yazmana gerek yok… icon azıcık daha aşağı inebilir").
// Görünür yazı yok (erişilebilirlik etiketi "Panel" kalır). Rozet merkezi yan sekme simgeleriyle aynı hizada; çubuk üst kenarının
// biraz üstüne taşar ve çubuk kenarı rozetle eş merkezli yumuşak bir kavisle yükselerek onu sarar.
export const CENTER_BADGE = { size: 60, barH: 58, lift: 11, notchR: 37, showsLabel: false } as const;

export function badgeGeometry() {
  const { size, lift, notchR } = CENTER_BADGE;
  const top = -lift; // rozet üst kenarı (çubuk üst kenarına göre; negatif = yukarıda)
  const centerY = size / 2 - lift;
  return { lift, top, bottom: size - lift, centerY, humpTop: centerY - notchR };
}
