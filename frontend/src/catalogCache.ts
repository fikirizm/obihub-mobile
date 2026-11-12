// Ürün listesinden detaya geçerken satırı taşımak için küçük bellek içi önbellek.
// Sunucuda tek ürünün kanal stok/fiyatlarını veren ayrı bir uç yoktur.
import type { CatalogProduct, ChannelRef } from "./types";

const items = new Map<string, CatalogProduct>();
let channels: ChannelRef[] = [];

export function rememberCatalog(products: CatalogProduct[], chs: ChannelRef[]) {
  products.forEach((p) => items.set(p.id, p));
  if (chs.length > 0) channels = chs;
}

export function recallProduct(id: string) {
  return items.get(id) || null;
}

export function recallChannels() {
  return channels;
}

export function clearCatalogCache() {
  items.clear();
  channels = [];
}

// Ürün eklendi / silindi gibi listeyi etkileyen değişiklik: liste ekranı odakta bir kez yeniden okur.
let dirty = false;
export function markCatalogDirty() {
  dirty = true;
}
export function consumeCatalogDirty() {
  const d = dirty;
  dirty = false;
  return d;
}
