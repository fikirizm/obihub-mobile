// Kategori / etiket (sınıflandırma) — saf modül; birim testi dev/test-classification.mjs.
// Web: lib/classification.js, components/classification/ClassChips.jsx, useClassificationNames.js. Uçlar: /classification/categories?kind=…,
// /classification/tags (?ids=…). PM kararı 25 Kas 2026: A salt okuma çipleri (cari, satış/gider faturası, kasa), B liste filtresi;
// arşivli soluk; 403'te çipler hiç gösterilmez; önbellek çıkışta ve firma değişince temizlenir. Atama (C) ve ürün kategorileri (D) sonra.

export const COLORS: Record<string, string> = {
  slate: "#64748b", blue: "#3b82f6", green: "#22a55e", amber: "#e8a317", red: "#ef4444", violet: "#8b5cf6",
  teal: "#14b8a6", pink: "#ec4899", orange: "#f97316", indigo: "#6366f1", lime: "#84cc16", rose: "#f43f5e",
};
export const colorHex = (id: unknown): string | null => COLORS[String(id || "")] || null;

export type ClassItem = { id: string; name: string; color?: string | null; active?: boolean };
export type Names = { category: (id: string) => ClassItem | null; tag: (id: string) => ClassItem | null };

export function nameIndex(categories: ClassItem[], tags: ClassItem[]): Names {
  const c = new Map(categories.map((x) => [x.id, x]));
  const t = new Map(tags.map((x) => [x.id, x]));
  return { category: (id) => c.get(id) || null, tag: (id) => t.get(id) || null };
}

// Satır biçimleri: doğrudan {category_id, tag_ids} (cari, satış faturası, kasa) ya da {classification: {…}} (gider faturası).
export function classOf(row: any): { categoryId: string | null; tagIds: string[] } {
  const src = row?.classification && typeof row.classification === "object" ? row.classification : row || {};
  const tags = Array.isArray(src.tag_ids) ? src.tag_ids : [];
  return { categoryId: src.category_id ? String(src.category_id) : null, tagIds: Array.from(new Set(tags.filter((x: unknown) => typeof x === "string" && x))) as string[] };
}
export const hasClass = (row: any) => {
  const c = classOf(row);
  return Boolean(c.categoryId || c.tagIds.length);
};

export type Chip = { key: string; label: string; color: string | null; archived: boolean; kind: "category" | "tag" };

// Kategori önce; arşivli soluk "(arşiv)"; en çok `max` etiket, fazlası `more`. Çözülemeyen kimlik atlanır (web "—" yer tutucusu yerine).
export function chipsView(names: Names, cls: { categoryId: string | null; tagIds: string[] }, max = 3): { chips: Chip[]; more: number } {
  const chips: Chip[] = [];
  const c = cls.categoryId ? names.category(cls.categoryId) : null;
  if (c) chips.push({ key: `c:${c.id}`, label: `${c.name}${c.active === false ? " (arşiv)" : ""}`, color: colorHex(c.color), archived: c.active === false, kind: "category" });
  const tags = cls.tagIds.map((id) => names.tag(id)).filter(Boolean) as ClassItem[];
  tags.slice(0, max).forEach((t) => chips.push({ key: `t:${t.id}`, label: `${t.name}${t.active === false ? " (arşiv)" : ""}`, color: colorHex(t.color), archived: t.active === false, kind: "tag" }));
  return { chips, more: Math.max(0, tags.length - max) };
}

// Ad listesinde olmayan (ilk 200'ün dışındaki) etiketler kimlikle ayrıca çözülür.
export function missingTagIds(names: Names, rows: any[]): string[] {
  const ids = new Set<string>();
  rows.forEach((r) => classOf(r).tagIds.forEach((id) => !names.tag(id) && ids.add(id)));
  return Array.from(ids).sort();
}

// ---- B: liste filtresi (sunucu parse_classification_filter ile aynı parametreler) ----
export type ClassFilter = { categoryId: string | null; tagIds: string[]; tagMode: "any" | "all" | "untagged" };
export const EMPTY_FILTER: ClassFilter = { categoryId: null, tagIds: [], tagMode: "any" };

export function classificationQuery(f: ClassFilter): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.categoryId) out.category_id = f.categoryId;
  if (f.tagMode === "untagged") out.tag_mode = "untagged";
  else if (f.tagIds.length) {
    out.tags = f.tagIds.join(",");
    out.tag_mode = f.tagMode;
  }
  return out;
}
export const filterCount = (f: ClassFilter) => (f.categoryId ? 1 : 0) + (f.tagMode === "untagged" ? 1 : f.tagIds.length);

export function filterLabel(names: Names, f: ClassFilter): string {
  const cat = f.categoryId ? names.category(f.categoryId)?.name || "Kategori" : "";
  const tagNames = f.tagIds.map((id) => names.tag(id)?.name || "Etiket");
  const tags = f.tagMode === "untagged" ? "Etiketsiz" : tagNames.join(f.tagMode === "all" ? " + " : " ya da ");
  return [cat, tags].filter(Boolean).join(" · ");
}
