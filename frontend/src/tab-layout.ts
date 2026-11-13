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
