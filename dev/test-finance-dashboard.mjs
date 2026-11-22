// Birim testi: src/finance-dashboard.ts (P6.3 pano sayaçları + Gelir-Gider etiket kırılımı). Sunucu: GET /finance/dashboard-counters
// {recurring:{active,due_today,due_week,failing}, unsent:{count,window_days,capped}|null}; GET /local-invoices?unsent=1;
// GET /finance/income-expense-summary currencies[].tags + scope.notes.tags. Web: components/dashboard/durumVerisi.js, pages/ReportsPage.js.
// Çalıştırma: node dev/test-finance-dashboard.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/finance-dashboard.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("sayaçlar: tekrarlayan + gönderilmemiş; yazdırılmamış yok", () => {
  const tiles = m.counterTiles({ recurring: { active: 4, due_today: 1, due_week: 3, failing: 0 }, unsent: { count: 5, window_days: 90, capped: false } });
  assert.deepEqual(tiles.map((x) => x.key), ["recurring", "unsent"]);
  assert.equal(tiles[0].value, "3");
  assert.equal(tiles[0].hint, "1 bugün, 7 gün içinde 3 çalışacak");
  assert.equal(tiles[0].route, "/recurring");
  assert.equal(tiles[1].value, "5");
  assert.equal(tiles[1].warn, true);
  assert.equal(tiles[1].hint, "Son 90 günde gönderilmemiş; sipariş faturaları hariç");
  assert.deepEqual(tiles[1].route, { pathname: "/local-invoices", params: { unsent: "1" } });
});
t("sayaçlar: unsent null ise kart gizli; hatalı plan uyarısı; capped", () => {
  const tiles = m.counterTiles({ recurring: { active: 2, due_today: 0, due_week: 0, failing: 1 }, unsent: null });
  assert.deepEqual(tiles.map((x) => x.key), ["recurring"]);
  assert.equal(tiles[0].hint, "1 plan hatalı · 0 bugün");
  assert.equal(tiles[0].warn, true);
  assert.equal(m.counterTiles({ recurring: { active: 2 } })[0].hint, "7 gün içinde çalışacak plan yok · 2 etkin");
  assert.match(m.counterTiles({ recurring: {}, unsent: { count: 500, capped: true } })[1].hint, /\(en az\)$/);
  assert.equal(m.counterTiles({ recurring: {}, unsent: { count: 0 } })[1].warn, false);
  assert.deepEqual(m.counterTiles(null), []);
});
t("sayaç hatası: 403 tüm kartı gizler, diğer hata yüklenemedi", () => {
  assert.equal(m.countersFailure({ status: 403 }), "forbidden");
  assert.equal(m.countersFailure({ status: 500 }), "error");
  assert.equal(m.countersFailure(null), "error");
});
t("gönderilmemiş süzgeci: adres değeri ve çip metni", () => {
  assert.equal(m.isUnsentParam("1"), true);
  assert.equal(m.isUnsentParam(["1"]), true);
  assert.equal(m.isUnsentParam("0"), false);
  assert.equal(m.isUnsentParam(undefined), false);
  assert.equal(m.UNSENT_CHIP, "Gönderilmemiş faturalar (son 90 gün)");
});
t("etiket tablosu: sunucu sırası, etiketsiz işaretli, zarar", () => {
  const rows = m.tagRows({ currency: "TRY", tags: [{ tag_id: "t1", name: "Kampanya", income: "1000.00", expense: "400.00", result: "600.00" }, { tag_id: null, name: "Etiketsiz", income: "50.00", expense: "80.00", result: "-30.00" }] });
  assert.deepEqual(rows.map((r) => [r.key, r.name, r.untagged, r.income, r.expense, r.result, r.loss]), [
    ["t1", "Kampanya", false, 1000, 400, 600, false],
    ["untagged", "Etiketsiz", true, 50, 80, -30, true],
  ]);
  assert.deepEqual(m.tagRows({ currency: "TRY" }), []);
});
t("etiket notu: sunucu notu, yoksa varsayılan", () => {
  assert.equal(m.tagNote({ scope: { notes: { tags: "Sunucu notu." } } }), "Sunucu notu.");
  assert.match(m.tagNote({ scope: {} }), /^Etiketli belge her etiketinde sayılır/);
});
console.log(`${n} test geçti`);
