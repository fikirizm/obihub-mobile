import * as FileSystem from "expo-file-system/legacy";

const cacheDir = FileSystem.cacheDirectory ?? "";

function path(key: string) {
  return `${cacheDir}obihub_cache_${key}.json`;
}

export async function saveCache<T>(key: string, data: T): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(path(key), JSON.stringify(data), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch {}
}

export async function loadCache<T>(key: string): Promise<T | null> {
  try {
    const info = await FileSystem.getInfoAsync(path(key));
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(path(key), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function clearCache(key: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(path(key), { idempotent: true });
  } catch {}
}

// Tüm çevrimdışı önbelleği siler (çıkışta çağrılır).
export async function clearAllCache(): Promise<void> {
  try {
    if (!cacheDir) return;
    const names = await FileSystem.readDirectoryAsync(cacheDir);
    await Promise.all(
      names.filter((n) => n.startsWith("obihub_cache_")).map((n) => FileSystem.deleteAsync(`${cacheDir}${n}`, { idempotent: true }).catch(() => {}))
    );
  } catch {}
}
