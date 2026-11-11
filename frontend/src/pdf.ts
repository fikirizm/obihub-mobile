import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

// Yazdırma penceresini açar; yazdırılamıyorsa paylaşım penceresine düşer.
// Kullanıcı yazdırmaktan vazgeçerse sessizce false döner (paylaşım açılmaz).
export async function printOrShare(path: string): Promise<boolean> {
  try {
    await Print.printAsync({ uri: path });
    return true;
  } catch (e: any) {
    const cancelled = e?.code === "ERR_PRINT_INCOMPLETE" || /did not complete|incomplete|cancel/i.test(String(e?.message || ""));
    if (cancelled) return false;
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, { mimeType: "application/pdf" });
      return true;
    }
    throw e;
  }
}

// Base64 PDF'i cihaza yazar ve yazdırma penceresini açar.
export async function openBase64Pdf(base64: string, name: string) {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "belge";
  const path = `${FileSystem.cacheDirectory}${safe}.pdf`;
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
  return printOrShare(path);
}
