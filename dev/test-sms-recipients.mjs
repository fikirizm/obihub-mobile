// Birim testi: src/sms-recipients.ts (Toplu SMS birleşik alıcı listesi; web components/sms/recipientsModel.js, 24 Kas 2026).
// Sunucu: GET /netgsm/recipients (parametresiz) → {items[{phone,name,sources,customer_id,role,city,class_ids,channels,order_count,last_order_at}],
//          without_phone, truncated, facets{channels[{key,label,count}], cities[{name,count}], classes[{id,name,kind,count}]}}.
// Çalıştırma: node dev/test-sms-recipients.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/sms-recipients.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const NOW = Date.parse("2026-11-25T12:00:00Z");
const rows = [
  { phone: "+905321112233", name: "Şükrü Çelik", sources: ["customer"], role: "customer", city: "İzmir", class_ids: ["k1"], channels: [], order_count: 0, last_order_at: null },
  { phone: "+905339998877", name: "Ayşe Yılmaz", sources: ["order"], role: null, city: "Ankara", class_ids: [], channels: ["trendyol"], order_count: 3, last_order_at: "2026-11-20T10:00:00Z" },
  { phone: "+905441234567", name: "Tedarik A.Ş.", sources: ["customer"], role: "supplier", city: "İstanbul", class_ids: [], channels: [], order_count: 0, last_order_at: null },
  { phone: "+905551110000", name: "Mehmet Kaya", sources: ["order", "website_member"], role: null, city: "İzmir", class_ids: [], channels: ["website", "hepsiburada"], order_count: 1, last_order_at: "2026-06-01T10:00:00Z" },
];

t("Türkçe katlama ve ulusal numara", () => {
  assert.equal(m.fold("ŞÜKRÜ ÇELİK"), "sukru celik");
  assert.equal(m.fold("Iğdır"), "igdir");
  assert.equal(m.nationalDigits("+90 532 111 22 33"), "5321112233");
  assert.equal(m.nationalDigits("0532 111 22 33"), "5321112233");
  assert.equal(m.nationalDigits("0090 532"), "532");
});
t("arama: ad/şehir Türkçe duyarsız; numara 0/+90 önekiyle baştan, öneki yazarken liste boşalmaz", () => {
  const e = m.indexRows(rows);
  const q = (s) => e.filter((x) => m.matchesQuery(x, s)).map((x) => x.row.name);
  assert.deepEqual(q("sukru"), ["Şükrü Çelik"]);
  assert.deepEqual(q("izmir"), ["Şükrü Çelik", "Mehmet Kaya"]);
  assert.deepEqual(q("0533"), ["Ayşe Yılmaz"]);
  assert.deepEqual(q("+90 544"), ["Tedarik A.Ş."]);
  assert.equal(q("+90").length, 4);
  assert.equal(q("0").length, 4);
  assert.deepEqual(q("1110000"), ["Mehmet Kaya"]);
});
t("varsayılan tür: tedarikçi-yalnız gizli; 'Yalnız müşteriler' boş rollü sipariş/üye satırlarını tutar", () => {
  assert.equal(m.roleOk(rows[2], ""), false);
  assert.equal(m.roleOk(rows[1], "customer"), true);
  assert.equal(m.roleOk(rows[2], "supplier"), true);
  assert.equal(m.roleOk(rows[2], "all"), true);
});
t("filtreler: kaynak, kanal, şehir, sınıf, en az sipariş, son sipariş, hiç sipariş vermemiş", () => {
  const e = m.indexRows(rows);
  const f = (p) => m.applyAll(e, "", { ...m.EMPTY_FILTERS, ...p }, NOW).map((r) => r.name);
  assert.deepEqual(f({}), ["Şükrü Çelik", "Ayşe Yılmaz", "Mehmet Kaya"]);
  assert.deepEqual(f({ sources: ["website_member"] }), ["Mehmet Kaya"]);
  assert.deepEqual(f({ channels: ["trendyol", "hepsiburada"] }), ["Ayşe Yılmaz", "Mehmet Kaya"]);
  assert.deepEqual(f({ city: "İzmir" }), ["Şükrü Çelik", "Mehmet Kaya"]);
  assert.deepEqual(f({ classId: "k1" }), ["Şükrü Çelik"]);
  assert.deepEqual(f({ minOrders: "2" }), ["Ayşe Yılmaz"]);
  assert.deepEqual(f({ lastOrder: "30" }), ["Ayşe Yılmaz"]);
  assert.deepEqual(f({ lastOrder: "never" }), ["Şükrü Çelik"]);
});
t("filtre sayıları tür kuralına göre; etkin filtre çipleri", () => {
  const c = m.countFacets(rows, "");
  assert.deepEqual(c.sources, { customer: 1, order: 2, website_member: 1 });
  assert.deepEqual(c.channels, { trendyol: 1, website: 1, hepsiburada: 1 });
  assert.equal(c.cities["İstanbul"], undefined);
  const facets = { channels: [{ key: "trendyol", label: "Trendyol" }], cities: [], classes: [{ id: "k1", name: "VIP" }] };
  const chips = m.filterChips({ ...m.EMPTY_FILTERS, sources: ["order"], channels: ["trendyol"], city: "İzmir", classId: "k1", role: "supplier", minOrders: "3", lastOrder: "never" }, facets);
  assert.deepEqual(chips.map((x) => x.label), ["Sipariş müşterisi", "Kanal: Trendyol", "Şehir: İzmir", "Sınıf: VIP", "Tür: Yalnız tedarikçiler", "En az 3 sipariş", "Hiç sipariş vermemiş"]);
  assert.deepEqual(chips[0].patch, { sources: [] });
  assert.equal(m.activeFilterCount({ ...m.EMPTY_FILTERS, city: "İzmir", channels: ["a", "b"] }), 3);
});
t("yanıt düzenleme eski/eksik biçime dayanıklı", () => {
  assert.deepEqual(m.normalizeResponse(null), { items: [], without_phone: 0, truncated: false, facets: { channels: [], cities: [], classes: [] } });
  assert.equal(m.normalizeResponse({ items: rows, truncated: 1 }).truncated, true);
});
t("satır alt bilgisi: numara · şehir · sipariş", () => {
  assert.equal(m.rowSub(rows[1]), "+905339998877 · Ankara · 3 sipariş");
  assert.equal(m.rowSub(rows[0]), "+905321112233 · İzmir");
});

console.log(`\n${n} test geçti`);
