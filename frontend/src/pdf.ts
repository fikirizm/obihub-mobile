import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

// Base64 PDF'i cihaza yazar ve yazdırma penceresini açar; yazdırılamazsa paylaşım penceresine düşer.
export async function openBase64Pdf(base64: string, name: string) {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "belge";
  const path = `${FileSystem.cacheDirectory}${safe}.pdf`;
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
  try {
    await Print.printAsync({ uri: path });
  } catch {
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: "application/pdf" });
  }
}
