// Birim testi: src/pos-money.ts (POS sepet toplamı ve karma bölmesi kuruşta, POS hata → işlem anahtarı kuralı)
// ve src/account-pick.ts (tahsilat hesap listesinin süzülmesi ve sıralanması).
// Çalıştırma: node dev/test-pos-money.mjs  (obihub-mobile kökünden)
// Sepetler sunucu testiyle aynı: backend/tests/test_asama4_p4_pos_kasa_mongo.py (_compute_totals, ROUND_HALF_UP kuruş).
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
const pm = await load("pos-money.ts");
const ap = await load("account-pick.ts");
const cl = await load("currency-lines.ts");

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const line = (unit_price, quantity, discount_percent = 0) => ({ unit_price, quantity, discount_percent });
const sum = (payments) => payments.reduce((s, p) => s + Math.round(Number(p.amount) * 100), 0);

// ── Sepet toplamı (sunucu _compute_totals ile aynı) ─────────────────────────────
t("300,95 × 2, satır iskontosu %5 → 571,81 (float 571,80 bulur)", () => {
  assert.deepEqual(pm.posTotalsCents([line(300.95, 2, 5)], 0), { subtotalCents: 57181, discountCents: 0, totalCents: 57181 });
});
t("1,13 × 7, satır iskontosu %50 → 3,96 (float 3,95 bulur)", () => {
  assert.equal(pm.posTotalsCents([line(1.13, 7, 50)], 0).totalCents, 396);
});
t("300,95 × 2, genel indirim 30,10 → 571,80", () => {
  assert.deepEqual(pm.posTotalsCents([line(300.95, 2)], 30.1), { subtotalCents: 60190, discountCents: 3010, totalCents: 57180 });
});
t("indirim ara toplamı aşamaz; boş sepet 0", () => {
  assert.deepEqual(pm.posTotalsCents([line(10, 1)], 25), { subtotalCents: 1000, discountCents: 1000, totalCents: 0 });
  assert.equal(pm.posTotalsCents([], 0).totalCents, 0);
});
t("float tuzağı: 0,1 × 3 = 0,30; 1,15 × 3 = 3,45", () => {
  assert.equal(pm.posTotalsCents([line(0.1, 3)], 0).totalCents, 30);
  assert.equal(pm.posTotalsCents([line(1.15, 3)], 0).totalCents, 345);
});

// ── Karma bölmesi: kart = toplam − nakit (kuruş) ───────────────────────────────
t("karma 571,81: nakit 300,00 → kart 271,81, toplam kuruşu kuruşuna", () => {
  const total = pm.posTotalsCents([line(300.95, 2, 5)], 0).totalCents;
  const p = pm.karmaPayments(total, 30000);
  assert.deepEqual(p, [{ method: "nakit", amount: "300.00" }, { method: "kart", amount: "271.81" }]);
  assert.equal(sum(p), 57181);
});
t("karma 3,96: nakit 2,00 → kart 1,96", () => {
  const total = pm.posTotalsCents([line(1.13, 7, 50)], 0).totalCents;
  const p = pm.karmaPayments(total, 200);
  assert.deepEqual(p, [{ method: "nakit", amount: "2.00" }, { method: "kart", amount: "1.96" }]);
  assert.equal(sum(p), 396);
});
t("nakit toplamı aşarsa ya da eksiyse sınırlanır; toplam yine tutar", () => {
  assert.deepEqual(pm.splitCents(1000, 1500), { cash: 1000, card: 0 });
  assert.deepEqual(pm.splitCents(1000, -5), { cash: 0, card: 1000 });
});
t("girilen nakit metni kuruşa: 50,30 → 5030 (float 5029 değil)", () => {
  assert.equal(pm.toCents(50.3), 5030);
  assert.equal(pm.toCents(0.1 + 0.2), 30);
  assert.equal(pm.fromCents(27181), "271.81");
});

// ── POS hatası → işlem anahtarı ────────────────────────────────────────────────
const e = (status, code, message) => ({ status, code, message: message || "" });
t("POS_* 4xx kesin ret: yeni anahtar (409 dahil)", () => {
  for (const x of [e(400, "POS_CARD_ACCOUNT_REQUIRED"), e(409, "POS_OPEN_ACCOUNT_PENDING"), e(422, "POS_PAYMENT_SPLIT_MISMATCH"), e(422, "POS_PAYMENT_INVALID"), e(400, "POS_CASH_ACCOUNT_REQUIRED")])
    assert.equal(pm.posErrorAction(x), "new-key", x.code);
});
t("kodsuz 4xx (400/404/422) kesin ret: yeni anahtar", () => {
  for (const s of [400, 404, 422]) assert.equal(pm.posErrorAction(e(s, "")), "new-key");
});
t("belirsiz sonuç (ağ, 5xx, stok işlemi süren 409): aynı anahtarla tekrar", () => {
  for (const x of [e(0, ""), e(500, ""), e(502, ""), e(409, "", "Stok işlemi başka bir istekte sürüyor")])
    assert.equal(pm.posErrorAction(x), "retry-same");
});
t("anahtar farklı sepetle kullanılmış (409): yeni anahtar, ayrı uyarı", () => {
  assert.equal(pm.posErrorAction(e(409, "", "Bu ödeme anahtarı farklı bir sepetle kullanılmış; yeni satış başlatın")), "conflict");
  assert.equal(pm.posErrorAction(e(409, "IDEMPOTENCY_CONFLICT")), "conflict");
});
t("nextPosKey: belirsizde aynı anahtar, kesin retten sonra yeni", () => {
  let i = 0;
  const make = () => "pos-new-" + ++i;
  assert.equal(pm.nextPosKey("pos-a", e(500, ""), make), "pos-a");
  assert.equal(pm.nextPosKey("pos-a", e(0, ""), make), "pos-a");
  assert.equal(pm.nextPosKey("pos-a", e(400, "POS_CARD_ACCOUNT_REQUIRED"), make), "pos-new-1");
  assert.equal(pm.nextPosKey("pos-a", e(409, "POS_OPEN_ACCOUNT_PENDING"), make), "pos-new-2");
  assert.equal(pm.nextPosKey("pos-a", e(409, "IDEMPOTENCY_CONFLICT"), make), "pos-new-3");
});

// ── Tahsilat hesap listesi ─────────────────────────────────────────────────────
const acc = (id, extra) => ({ id, name: id, balance: 0, currency: "TRY", account_type: "cash", ...extra });
const list = [
  acc("pos", { account_type: "pos", name: "POS (Kart)" }),
  acc("bank", { account_type: "bank" }),
  acc("pasif", { is_active: false, is_default: true }),
  acc("arsiv", { archived: true }),
  acc("silinmis", { is_deleted: true }),
  acc("kapali", { active: false }),
  acc("kasa", { is_default: true }),
  acc("usd", { currency: "USD" }),
  acc("tl", { currency: "TL" }),
];
t("pasifler dışarıda, varsayılan başta, POS en sonda", () => {
  assert.deepEqual(ap.accountsForCurrency(list, "TRY").map((a) => a.id), ["kasa", "bank", "tl", "pos"]);
});
t("TL/TRL girişi TRY sayılır; para birimi süzülür", () => {
  assert.deepEqual(ap.accountsForCurrency(list, "TRL").map((a) => a.id), ["kasa", "bank", "tl", "pos"]);
  assert.deepEqual(ap.accountsForCurrency(list, "usd").map((a) => a.id), ["usd"]);
  assert.deepEqual(ap.accountsForCurrency(list, "EUR"), []);
});
t("POS varsayılan işaretli olsa da en sonda", () => {
  const l = [acc("pos", { account_type: "pos", is_default: true }), acc("kasa")];
  assert.deepEqual(ap.accountsForCurrency(l, "TRY").map((a) => a.id), ["kasa", "pos"]);
});
t("etiketler: varsayılan yalnız birden çok seçenekte, POS işaretli", () => {
  assert.equal(ap.accountOptionLabel(acc("Nakit Kasa", { name: "Nakit Kasa", is_default: true }), true), "Nakit Kasa (varsayılan)");
  assert.equal(ap.accountOptionLabel(acc("Nakit Kasa", { name: "Nakit Kasa", is_default: true }), false), "Nakit Kasa");
  assert.equal(ap.accountOptionLabel(acc("p", { name: "POS (Kart)", account_type: "pos" }), true), "POS (Kart) · kart");
  assert.equal(ap.accountOptionLabel(acc("p", { name: "Yapı Kredi", account_type: "pos" }), true), "Yapı Kredi (POS)");
});

// ── POS açık hesap (12 Kas 2026, 366cdf789) ──────────────────────────────────
t("açık hesap carisi: yalnız kayıtlı ve tedarikçi olmayan kart", () => {
  assert.equal(pm.openAccountBlock(null), "missing");
  assert.equal(pm.openAccountBlock({ id: "" }), "missing");
  assert.equal(pm.openAccountBlock({ id: "c1", source: "registered" }), null);
  assert.equal(pm.openAccountBlock({ id: "c1", source: "registered", contact_role: "customer" }), null);
  assert.equal(pm.openAccountBlock({ id: "c1", source: "registered", contact_role: "both" }), null);
  assert.equal(pm.openAccountBlock({ id: "c3", source: "registered", contact_role: "supplier" }), "supplier");
  assert.equal(pm.openAccountBlock({ id: "e:ayse", source: "orders" }), "unregistered");
  // kimlik siparişten türetilmişse kaynak alanı yanlış gelse de seçtirilmez
  for (const id of ["e:x", "p:x", "n:x"]) assert.equal(pm.openAccountBlock({ id, source: "registered" }), "unregistered", id);
});
t("açık hesap alanları: customer_id, paid 0, para üstü 0, bölme yok", () => {
  assert.deepEqual(pm.openAccountFields({ id: "c1", name: "Elif Kaya" }), { customer_id: "c1", customer_name: "Elif Kaya", paid_amount: 0, change_amount: 0 });
});
t("açık hesap hata kodları kesin ret: yeni anahtar", () => {
  for (const x of [e(400, "POS_CUSTOMER_REQUIRED"), e(422, "POS_CUSTOMER_NOT_CUSTOMER"), e(422, "POS_OPEN_ACCOUNT_NOT_SPLITTABLE"), e(404, "CUSTOMER_NOT_FOUND")])
    assert.equal(pm.posErrorAction(x), "new-key", x.code);
});

// ── Rapor: TRY dışı para birimleri ayrı (reports/overview by_currency) ───────────
t("by_currency: TRY dışı, sıfır olmayan satırlar; para birimleri toplanmaz", () => {
  const by = {
    TRY: { summary: { total_revenue: 1000, total_orders: 4 } },
    USD: { summary: { total_revenue: 250.5, total_orders: 2 } },
    EUR: { summary: { total_revenue: 0, total_orders: 0 } },
  };
  assert.deepEqual(cl.otherCurrencyRevenue(by), [{ currency: "USD", revenue: 250.5, orders: 2 }]);
  assert.deepEqual(cl.otherCurrencyRevenue(undefined), []);
  assert.deepEqual(cl.otherCurrencyRevenue({ TL: { summary: { total_revenue: 5, total_orders: 1 } } }), []);
});

console.log(`${n} test geçti`);
