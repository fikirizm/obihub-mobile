// Cross-platform secure storage. Uses expo-secure-store on native,
// falls back to localStorage / in-memory on web.

import { Platform } from "react-native";

const memoryStore: Record<string, string> = {};

function isWeb() {
  return Platform.OS === "web";
}

function getNative() {
  // Lazy require so web bundle doesn't trigger expo-secure-store's web stub
  // that may throw on first access.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-secure-store");
}

export async function getItemAsync(key: string): Promise<string | null> {
  if (isWeb()) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {}
    return memoryStore[key] ?? null;
  }
  try {
    return await getNative().getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (isWeb()) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {}
    memoryStore[key] = value;
    return;
  }
  try {
    await getNative().setItemAsync(key, value);
  } catch {}
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (isWeb()) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
    } catch {}
    delete memoryStore[key];
    return;
  }
  try {
    await getNative().deleteItemAsync(key);
  } catch {}
}
