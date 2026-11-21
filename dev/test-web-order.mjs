// Birim testi: src/web-order.ts (Faz A M2b/M2c: ObiHub web mağaza siparişi). Sunucu: website_live_checkout.py (havale: status pending,
// payment_status awaiting_transfer; kart: PayTR, payment_status paid), models.OrderDetail (payment_status, payment_method, shipping_fee),
// website_checkout_address.Invoice (personal: name, identity_number; company: company_name, tax_office, tax_number), havale onayı
// POST /settings/website/transfers/{sipariş id}/confirm (yalnız firma sahibi; 409 ORDER_CANCELLED / TRANSFER_NOT_PENDING).
// Web: OrderDetailModal.jsx (Müşteri fatura bilgileri), WebsitePaymentsPanel.jsx (Havaleyi doğrula). Çalıştırma: node dev/test-web-order.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
async function load(rel) {
  const src = readFileSync(join(here, "../frontend/src", rel), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}
const w = await load("web-order.ts");
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("web mağaza siparişi tanınır: channel website ya da integration_id website:", () => {
  assert.equal(w.isWebOrder({ channel: "website" }), true);
  assert.equal(w.isWebOrder({ integration_id: "website:u1", channel: "" }), true);
  assert.equal(w.isWebOrder({ channel: "trendyol" }), false);
  assert.equal(w.WEB_LABEL, "Web Mağaza");
});
t("havale bekleniyor: awaiting_transfer ve iptal edilmemiş", () => {
  assert.equal(w.awaitingTransfer({ channel: "website", status: "pending", payment_status: "awaiting_transfer" }), true);
  assert.equal(w.awaitingTransfer({ channel: "website", status: "cancelled", payment_status: "awaiting_transfer" }), false);
  assert.equal(w.awaitingTransfer({ channel: "website", status: "processing", payment_status: "paid" }), false);
});
t("ödeme yöntemi ve durum metni", () => {
  assert.equal(w.paymentMethodText("bank_transfer"), "Havale / EFT");
  assert.equal(w.paymentMethodText("paytr"), "Kredi / banka kartı (PayTR)");
  assert.equal(w.paymentMethodText(""), "");
  assert.equal(w.paymentStatusText("awaiting_transfer"), "Havale bekleniyor");
  assert.equal(w.paymentStatusText("paid"), "Ödendi");
  assert.equal(w.paymentStatusText(undefined), "");
});
t("fatura bilgileri: bireysel ve kurumsal", () => {
  assert.deepEqual(w.invoiceRows({ kind: "personal", name: "Ayşe Yılmaz", identity_number: "11111111111" }),
    [["Fatura türü", "Bireysel"], ["Ad soyad", "Ayşe Yılmaz"], ["T.C. kimlik numarası", "11111111111"]]);
  assert.deepEqual(w.invoiceRows({ kind: "company", company_name: "Örnek A.Ş.", tax_office: "Kadıköy", tax_number: "1234567890" }),
    [["Fatura türü", "Kurumsal"], ["Şirket adı", "Örnek A.Ş."], ["Vergi dairesi", "Kadıköy"], ["Vergi numarası", "1234567890"]]);
  assert.deepEqual(w.invoiceRows(null), []);
  assert.deepEqual(w.invoiceRows({ kind: "personal", name: "", identity_number: "" }), [["Fatura türü", "Bireysel"]]);
});
t("teslimat adresi tek satır (mahalle, adres, ilçe, il, posta kodu)", () => {
  assert.equal(w.shippingText({ neighborhood: "Moda Mah.", address_detail: "Bahariye Cad. No 1", district: "Kadıköy", city: "İstanbul", postcode: "34710" }),
    "Moda Mah., Bahariye Cad. No 1, Kadıköy, İstanbul, 34710");
  assert.equal(w.shippingText(null), "");
});
t("havale onayı: yol, yalnız firma sahibi, çift dokunuş", () => {
  assert.equal(w.confirmPath("ab/c"), "/settings/website/transfers/ab%2Fc/confirm");
  assert.equal(w.canConfirmTransfer({ channel: "website", status: "pending", payment_status: "awaiting_transfer" }, true), true);
  assert.equal(w.canConfirmTransfer({ channel: "website", status: "pending", payment_status: "awaiting_transfer" }, false), false);
  assert.equal(w.canConfirmTransfer({ channel: "website", status: "processing", payment_status: "paid" }, true), false);
});
t("havale onay metni ve hata metinleri", () => {
  assert.equal(w.CONFIRM_TEXT, "Banka hesabında bu tutarın geldiğini doğruladım. Onay, seçili banka hesabına gelir yazar ve stok düşer.");
  assert.equal(w.transferErrorText({ status: 403 }), "Havale onayını yalnız firma sahibi verebilir.");
  assert.equal(w.transferErrorText({ status: 409, code: "ORDER_CANCELLED", message: "İptal edilen sipariş için tahsilat onaylanamaz." }), "İptal edilen sipariş için tahsilat onaylanamaz.");
  assert.equal(w.transferErrorText({ status: 409, code: "TRANSFER_NOT_PENDING" }), "Bekleyen havale bulunamadı veya süresi doldu.");
  assert.equal(w.transferErrorText({ status: 500, message: "Sunucu hatası (500)" }), "Tahsilat doğrulanamadı. Yeniden deneyin.");
});
t("havale bekleyen siparişte kargola/fatura uyarısı", () => {
  assert.equal(w.shipWarning({ channel: "website", status: "pending", payment_status: "awaiting_transfer" }), "Bu siparişin havalesi henüz onaylanmadı. Para gelmeden kargolamayın ya da fatura kesmeyin.");
  assert.equal(w.shipWarning({ channel: "website", payment_status: "paid" }), null);
});
console.log(`${n} test geçti`);
