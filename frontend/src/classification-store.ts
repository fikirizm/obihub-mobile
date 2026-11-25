// Kategori/etiket adları önbelleği ve kanca (web useClassificationNames). Adlar tür başına bir kez yüklenir (arşivliler dahil),
// listede olmayan etiketler kimlikle çözülür. 403: çipler gizlenir, hata gösterilmez. Önbellek çıkışta ve firma/kullanıcı değişince
// temizlenir (AuthProvider). Kurallar: src/classification.ts.
import { useEffect, useMemo, useState } from "react";
import { request } from "./api";
import { missingTagIds, nameIndex, type ClassItem, type Names } from "./classification";

type Kind = "party" | "sales" | "expense" | null;
const cats = new Map<string, Promise<ClassItem[]>>();
let tagsP: Promise<ClassItem[]> | null = null;
const extraTags = new Map<string, ClassItem>();
let forbidden = false;
let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
  version += 1;
  listeners.forEach((l) => l());
};

export function clearClassificationCache() {
  cats.clear();
  tagsP = null;
  extraTags.clear();
  forbidden = false;
  bump();
}

const items = (r: any): ClassItem[] => (Array.isArray(r?.items) ? r.items : []);
const deny = (e: any) => {
  if (Number(e?.status) === 403) forbidden = true;
  return [] as ClassItem[];
};

function loadCategories(token: string, kind: string) {
  if (!cats.has(kind)) cats.set(kind, request<any>(`/classification/categories?kind=${encodeURIComponent(kind)}&include_archived=1`, { method: "GET" }, token).then(items, deny));
  return cats.get(kind)!;
}
function loadTags(token: string) {
  if (!tagsP) tagsP = request<any>("/classification/tags?include_archived=1&limit=200", { method: "GET" }, token).then(items, deny);
  return tagsP;
}

// rows: ekrandaki kayıtlar (yalnız sınıflandırması olan varsa istek atılır). hidden: yetki yok (403) → çip çizilmez.
export function useClassNames(token: string | null, kind: Kind, rows: any[], enabled: boolean): { names: Names; hidden: boolean; ready: boolean } {
  const [state, setState] = useState<{ categories: ClassItem[]; tags: ClassItem[]; ready: boolean }>({ categories: [], tags: [], ready: false });
  const [, setV] = useState(version);
  useEffect(() => {
    const l = () => setV(version);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  useEffect(() => {
    if (!enabled || !token) return;
    let live = true;
    Promise.all([kind ? loadCategories(token, kind) : Promise.resolve([] as ClassItem[]), loadTags(token)]).then(([c, t]) => live && setState({ categories: c, tags: t, ready: true }));
    return () => {
      live = false;
    };
  }, [enabled, token, kind, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const names = useMemo(() => nameIndex(state.categories, [...state.tags, ...Array.from(extraTags.values())]), [state, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const missing = state.ready ? missingTagIds(names, rows).filter((id) => !extraTags.has(id)).slice(0, 200) : [];
  const missKey = missing.join(",");
  useEffect(() => {
    if (!missKey || !token || forbidden) return;
    request<any>(`/classification/tags?ids=${missKey.split(",").map(encodeURIComponent).join(",")}`, { method: "GET" }, token)
      .then((r) => {
        items(r).forEach((t) => extraTags.set(t.id, t));
        bump();
      })
      .catch(deny);
  }, [missKey, token]);
  return { names, hidden: forbidden, ready: state.ready };
}

// B: filtre penceresi için seçilebilir listeler (aktif olanlar; arşivliler seçilemez). 403'te hidden.
export function useClassLists(token: string | null, kind: Kind, enabled: boolean): { categories: ClassItem[]; tags: ClassItem[]; hidden: boolean; ready: boolean } {
  const [state, setState] = useState<{ categories: ClassItem[]; tags: ClassItem[]; ready: boolean }>({ categories: [], tags: [], ready: false });
  useEffect(() => {
    if (!enabled || !token) return;
    let live = true;
    Promise.all([kind ? loadCategories(token, kind) : Promise.resolve([] as ClassItem[]), loadTags(token)]).then(
      ([c, t]) => live && setState({ categories: c.filter((x) => x.active !== false), tags: t.filter((x) => x.active !== false), ready: true }),
    );
    return () => {
      live = false;
    };
  }, [enabled, token, kind, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, hidden: forbidden };
}
