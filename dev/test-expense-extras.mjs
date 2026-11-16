// Birim testi: src/expense-extras.ts — gider faturası geçmişi ve kopyası (Dalga 1 P1.3; backend expense_invoice_extras.py).
// Çalıştırma: node dev/test-expense-extras.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/expense-extras.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("geçmiş satırları: sunucu başlığı; yoksa tür etiketi; bilinmeyen tür 'İşlem'", () => {
  const rows = m.historyRows({ items: [
    { at: "2026-11-16T09:00:00Z", kind: "payment", title: "Ödeme eklendi", detail: "₺500,00 · Nakit Kasa" },
    { at: "2026-11-15T09:00:00Z", kind: "archived", title: "", detail: "" },
    { at: "2026-11-14T09:00:00Z", kind: "weird" },
  ] });
  assert.deepEqual(rows.map((r) => [r.title, r.detail]), [["Ödeme eklendi", "₺500,00 · Nakit Kasa"], ["Arşivlendi", ""], ["İşlem", ""]]);
  assert.deepEqual(m.historyRows(null), []);
});
t("kopya → elle gider formu: tedarikçi, kategori, kalemler (belge no / tarih / ödeme yok)", () => {
  const f = m.copyToForm({
    source_id: "obihub:e1", supplier: { party_id: "s1", name: "Kargo A.Ş.", tax_id: "1234567890" }, expense_category_id: "c1",
    lines: [
      { description: "Kargo", quantity: "10", unit_price: "120.00", vat_rate: "18", discount: "5.00" },
      { kind: "product", product_id: "p1", description: "Koli", quantity: "2", unit_price: "15.5", vat_rate: 20 },
    ],
    warnings: ["CATEGORY_NOT_COPIED", "TAGS_NOT_COPIED"],
  });
  assert.equal(f.supplierMode, "existing"); assert.equal(f.partyId, "s1"); assert.equal(f.name, "Kargo A.Ş."); assert.equal(f.taxId, "1234567890");
  assert.equal(f.categoryId, "c1"); assert.equal(f.documentNumber, ""); assert.equal(f.issueDate, "");
  assert.deepEqual(f.lines[0], { kind: "service", productId: "", productName: "", description: "Kargo", quantity: "10", unitPrice: "120.00", vatRate: "18", discount: "5.00" });
  assert.deepEqual(f.lines[1], { kind: "product", productId: "p1", productName: "Koli", description: "Koli", quantity: "2", unitPrice: "15.5", vatRate: "20", discount: "" });
  assert.match(m.copyNotice({ warnings: ["CATEGORY_NOT_COPIED", "TAGS_NOT_COPIED"] }), /Kategori kopyalanmadı.*Etiketler/);
  assert.equal(m.copyNotice({ warnings: [] }), null);
});
t("kopya: Paraşüt/eski tedarikçi kartı yoksa yeni tedarikçi olarak", () => {
  const f = m.copyToForm({ supplier: { party_id: null, name: "Ambalaj Ltd.", tax_id: "" }, lines: [] });
  assert.equal(f.supplierMode, "new"); assert.equal(f.lines.length, 1);
});

console.log(`\n${n} test geçti`);
