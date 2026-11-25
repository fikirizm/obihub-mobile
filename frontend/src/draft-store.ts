// Form taslağı deposu (KABUK-2). Telefonda uygulamanın belge klasörü (önbellek gibi işletim sistemince silinmez), web önizlemesinde
// localStorage. Her erişim try/catch içinde: depolama yoksa form taslaksız çalışır. Kurallar: src/form-draft.ts.
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { DRAFT_PREFIX, staleKeys } from "./form-draft";

const web = Platform.OS === "web";
const dir = `${FileSystem.documentDirectory ?? ""}obihub_drafts/`;
const fileOf = (key: string) => `${dir}${encodeURIComponent(key)}.json`;
const ls = () => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

export async function readDraftText(key: string): Promise<string | null> {
  try {
    if (web) return ls()?.getItem(key) ?? null;
    const f = fileOf(key);
    if (!(await FileSystem.getInfoAsync(f)).exists) return null;
    return await FileSystem.readAsStringAsync(f);
  } catch {
    return null;
  }
}

export async function writeDraftText(key: string, text: string): Promise<boolean> {
  try {
    if (web) {
      ls()?.setItem(key, text);
      return true;
    }
    if (!(await FileSystem.getInfoAsync(dir)).exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    await FileSystem.writeAsStringAsync(fileOf(key), text);
    return true;
  } catch {
    return false;
  }
}

export async function removeDraft(key: string): Promise<void> {
  try {
    if (web) ls()?.removeItem(key);
    else await FileSystem.deleteAsync(fileOf(key), { idempotent: true });
  } catch {}
}

async function allKeys(): Promise<string[]> {
  try {
    if (web) {
      const s = ls();
      if (!s) return [];
      const out: string[] = [];
      for (let i = 0; i < s.length; i += 1) {
        const k = s.key(i);
        if (k && k.startsWith(DRAFT_PREFIX)) out.push(k);
      }
      return out;
    }
    if (!(await FileSystem.getInfoAsync(dir)).exists) return [];
    return (await FileSystem.readDirectoryAsync(dir)).filter((n) => n.endsWith(".json")).map((n) => decodeURIComponent(n.slice(0, -5)));
  } catch {
    return [];
  }
}

// Çıkış dönemi: her temizlikte artar; önceki dönemde zamanlanmış yazım silinen taslağı geri getirmez.
let epoch = 0;
export const draftEpoch = () => epoch;

// keepPrefix verilirse yalnız o kapsamın (aynı firma + kullanıcı) taslakları kalır; null: hepsi silinir (çıkış).
export async function clearDrafts(keepPrefix: string | null = null): Promise<void> {
  if (!keepPrefix) epoch += 1;
  const keys = staleKeys(await allKeys(), keepPrefix);
  await Promise.all(keys.map(removeDraft));
}
