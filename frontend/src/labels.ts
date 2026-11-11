// Sipariş kargo etiketini alır ve yazdırır. Sipariş detayı ve sipariş listesindeki hızlı eylem ortak kullanır.
import * as FileSystem from "expo-file-system/legacy";
import { printOrShare } from "./pdf";
import { getHepsiburadaOrderLabel, getHepsiJetLabelWithProducts, getShippingLabel, getTrendyolOrderLabel } from "./api";
import { providerKey } from "./utils";

// Etiket PDF'ini cihaza yazar; dosya yolunu döndürür. Etiket yoksa nedenini açıklayan hata fırlatır.
export async function fetchOrderLabelFile(token: string, orderId: string, provider: string): Promise<string> {
  const path = `${FileSystem.cacheDirectory}order-${orderId}.pdf`;
  const writeBase64 = async (data: string) => {
    await FileSystem.writeAsStringAsync(path, data, { encoding: FileSystem.EncodingType.Base64 });
    return path;
  };
  const k = providerKey(provider);
  if (k === "trendyol") {
    const r = await getTrendyolOrderLabel(token, orderId);
    const data = r?.data || r?.label_data || "";
    if (data) return writeBase64(data);
    throw new Error("Trendyol bu sipariş için etiket döndürmedi.");
  }
  if (k === "hepsiburada") {
    const r = await getHepsiburadaOrderLabel(token, orderId);
    const data = r?.data || r?.data_base64 || "";
    if (data) return writeBase64(data);
    // Hepsiburada bazı paketlerde dosya yerine indirme bağlantısı verir.
    if (r?.url && /^https:\/\//i.test(r.url)) {
      const dl = await FileSystem.downloadAsync(r.url, path);
      if (dl.status >= 200 && dl.status < 300) return path;
    }
    throw new Error("Hepsiburada bu sipariş için etiket döndürmedi.");
  }
  // Diğer kanallar (WooCommerce, n11 vb.): etiket, sipariş için oluşturulmuş kargo gönderisinden gelir.
  const info = await getShippingLabel(token, orderId);
  const barcode = String(info?.barcode || info?.cargo_barcodes?.[0]?.barcode || "").trim();
  const cargoProvider = String(info?.cargo_provider || "").trim().toLowerCase();
  if (!barcode && cargoProvider !== "yurtici") {
    throw new Error("Bu sipariş için henüz kargo gönderisi oluşturulmamış. Önce gönderi oluşturun.");
  }
  const r = await getHepsiJetLabelWithProducts(token, orderId, barcode || undefined);
  const data = r?.data || r?.data_base64 || "";
  if (data) return writeBase64(data);
  throw new Error(r?.message || "Kargo firması bu gönderi için etiket döndürmedi.");
}

// Etiketi alır ve yazdırma penceresini açar. Kullanıcı yazdırmaktan vazgeçerse false döner.
export async function printOrderLabel(token: string, orderId: string, provider: string) {
  const path = await fetchOrderLabelFile(token, orderId, provider);
  return printOrShare(path);
}
