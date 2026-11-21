// Satış ekranı kart hesabı (saf modül; birim testi dev/test-pos-card.mjs). Faz C1. Sunucu: GET/PATCH /pos/payment-settings,
// POST /pos/sales {card_account_id, payment_provider:"manual"}. Ayar yoksa hiçbir hesap (web mağazasının PayTR'si dahil) kendiliğinden
// seçilmez; kasiyer seçer, isterse varsayılan olur ("hatırla"). Kart hesapları artık /finance/accounts'tan süzülmez. Web: POSPage.js.

export type CardAccount = { id: string; name: string; web_payment?: boolean };

export function cardSettings(d: any): { configured: boolean; accounts: CardAccount[]; preferred: string } {
  const configured = d?.configured === true;
  const list = (configured ? d?.card_accounts : d?.card_candidates) || [];
  const accounts = (Array.isArray(list) ? list : []).filter((a: any) => a?.id).map((a: any) => ({ id: String(a.id), name: String(a.name || "Hesap"), web_payment: a.web_payment === true }));
  return { configured, accounts, preferred: configured ? String(d?.effective_default_card_account_id || "") : "" };
}

export const keepSelection = (cur: string, list: CardAccount[], preferred: string) => (cur && list.some((a) => a.id === cur) ? cur : preferred);

export const pickerMode = (list: CardAccount[], configured: boolean): "none" | "single" | "pick" =>
  !list.length ? "none" : configured && list.length === 1 ? "single" : "pick";

export const accountLabel = (a: CardAccount) => (a.web_payment ? `${a.name} — web ödemesi` : a.name);
export const rememberDefault = (a: CardAccount | undefined) => !a?.web_payment;
export const WEB_PAYMENT_WARNING = "Bu hesap web mağazası ödemeleri içindir. Mağazadaki POS cihazıyla çektiyseniz cihazın bağlı olduğu hesabı seçin.";
export const FIRST_USE_TEXT = "POS cihazınızın bağlı olduğu hesabı seçin. Daha sonra Ayarlar → Satış ekranı ödeme hesapları'ndan değiştirebilirsiniz.";
export const NONE_TEXT = "Kart ödemesini yazacak hesap yok. Kasa ve Bankalar'dan POS cihazınızın bağlı olduğu hesabı (POS ya da banka) ekleyin.";
export const REMEMBER_FAILED = "Kart hesabı bu satışta kullanıldı ama varsayılan yapılamadı. Ayarlar → Satış ekranı ödeme hesapları'ndan seçebilirsiniz.";

export const rememberBody = (configured: boolean, remember: boolean, id: string) =>
  !configured && remember && id ? { card_account_ids: [id], default_card_account_id: id } : null;

export const cardFields = (usesCard: boolean, id: string): { card_account_id?: string; payment_provider?: "manual" } =>
  usesCard && id ? { card_account_id: id, payment_provider: "manual" } : {};

const RELOAD = new Set(["POS_CARD_ACCOUNT_REQUIRED", "POS_CARD_ACCOUNT_NOT_ALLOWED", "POS_CARD_ACCOUNT_INVALID", "POS_CASH_ACCOUNT_UNAVAILABLE"]);
export const reloadsSettings = (code: unknown) => RELOAD.has(String(code || ""));
