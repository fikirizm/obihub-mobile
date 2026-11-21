// Sipariş kargo etiketini alır ve yazdırır. Sipariş detayı ve sipariş listesindeki hızlı eylem ortak kullanır.
// Kanal başına şablonlar ve varsayılanlar web CargoLabelSidebar ile aynıdır:
// - Trendyol, n11, Pazarama: ObiHub ürünlü etiketi (/orders/{id}/product-label/pdf); pazaryeri etiketi seçeneği yok.
// - Hepsiburada: varsayılan ürünlü etiket; ikinci seçenek Hepsiburada etiketi (API hatasında ObiHub etiketine düşülür).
// - Idefix: varsayılan ortak HepsiJet etiketi (?variant=shared, kargo kodu gerekir); ikinci seçenek Idefix ürünlü etiketi.
// - Diğerleri (WooCommerce vb.): varsayılan orijinal HepsiJet etiketi; ikinci seçenek kargo gönderisinin ürünlü etiketi.
import * as FileSystem from "expo-file-system/legacy";
import { printOrShare } from "./pdf";
import { getHepsiJetLabel, getHepsiJetLabelWithProducts, getShippingLabel } from "./api";
import {
  channelKeyOf,
  fileLooksLikePdf,
  getHepsiburadaMarketplaceLabel,
  orderProductLabelPdf,
  writePdfBase64,
  type ChannelKey,
  type OrderFull,
} from "./api-siparis";

export { labelOptionsFor, type LabelOption, type LabelTemplate } from "./label-options";
import { labelOptionsFor, type LabelTemplate } from "./label-options";

// Web getDisplayCodes: önce siparişe açılmış barkodlar, yoksa pazaryerinin kargo kodu.
export function orderDisplayCodes(order: Partial<OrderFull> | null | undefined, provider: string): string[] {
  if (!order) return [];
  const key = channelKeyOf(provider || order.channel);
  const local = (Array.isArray(order.cargo_barcodes) ? order.cargo_barcodes : [])
    .map((b) => String(b?.barcode || "").trim())
    .filter(Boolean);
  if (local.length > 0) return local;
  const pick = (...vals: unknown[]) => {
    for (const v of vals) {
      const s = String(v || "").trim();
      if (s) return [s];
    }
    return [];
  };
  if (key === "n11") return pick(order.n11_cargo_tracking);
  if (key === "hepsiburada") return pick(order.hb_package_number, order.cargo_tracking);
  if (key === "trendyol") return pick(order.trendyol_package_id, order.channel_order_id);
  if (key === "idefix") return pick(order.idefix_cargo_tracking, order.cargo_tracking);
  if (key === "pazarama") return pick(order.pazarama_cargo_tracking, order.cargo_tracking, order.pazarama_order_number, order.channel_order_id);
  return pick(order.cargo_tracking);
}

// Web orderHasPrintableLabel: Trendyol, Hepsiburada, Pazarama her zaman; n11 ve Idefix kargo kodu varsa.
export function orderHasPrintableLabel(order: Partial<OrderFull> | null | undefined, provider: string): boolean {
  const key: ChannelKey = channelKeyOf(provider || order?.channel);
  if (key === "trendyol" || key === "hepsiburada" || key === "pazarama") return true;
  return orderDisplayCodes(order, provider).length > 0;
}

export type LabelFile = { path: string; notice?: string };

// E2 (web handlePrintOriginalPDF): kargo firmasının kendi PDF etiketi; barkod siparişe açılmış gönderiden okunur.
async function originalLabel(token: string, orderId: string): Promise<string> {
  const info = await getShippingLabel(token, orderId);
  const barcode = String(info?.barcode || info?.cargo_barcodes?.[0]?.barcode || "").trim();
  if (!barcode) {
    // Yurtiçi gibi barkodsuz gönderide orijinal HepsiJet etiketi yoktur; ürünlü kargo etiketine düşülür.
    if (String(info?.cargo_provider || "").trim().toLowerCase() === "yurtici") return cargoLabel(token, orderId);
    throw new Error("Bu sipariş için henüz kargo gönderisi oluşturulmamış. Önce gönderi oluşturun.");
  }
  const r: any = await getHepsiJetLabel(token, encodeURIComponent(barcode));
  const url = String(r?.file_url || "");
  if (url && /^https:\/\//i.test(url)) {
    const path = `${FileSystem.cacheDirectory}hj-${orderId}.pdf`;
    const dl = await FileSystem.downloadAsync(url, path);
    if (dl.status >= 200 && dl.status < 300 && (await fileLooksLikePdf(path))) return path;
    throw new Error(`HepsiJet etiketi indirilemedi (${dl.status}).`);
  }
  const data = r?.data || r?.data_base64 || "";
  if (r?.success !== false && data) return writePdfBase64(data, `hj-${orderId}`);
  throw new Error(r?.message || `Etiket alınamadı: ${barcode}`);
}

async function cargoLabel(token: string, orderId: string): Promise<string> {
  // Etiket, sipariş için oluşturulmuş kargo gönderisinden gelir.
  const info = await getShippingLabel(token, orderId);
  const barcode = String(info?.barcode || info?.cargo_barcodes?.[0]?.barcode || "").trim();
  const cargoProvider = String(info?.cargo_provider || "").trim().toLowerCase();
  if (!barcode && cargoProvider !== "yurtici") {
    throw new Error("Bu sipariş için henüz kargo gönderisi oluşturulmamış. Önce gönderi oluşturun.");
  }
  const r = await getHepsiJetLabelWithProducts(token, orderId, barcode || undefined);
  const data = r?.data || r?.data_base64 || "";
  if (data) return writePdfBase64(data, `order-${orderId}`);
  throw new Error(r?.message || "Kargo firması bu gönderi için etiket döndürmedi.");
}

// Hepsiburada etiketi; alınamazsa web gibi ObiHub'ın kendi etiketine düşülür ve neden bildirilir.
async function hepsiburadaLabel(token: string, order: Partial<OrderFull>, orderId: string): Promise<LabelFile> {
  let apiError = "";
  try {
    const pkg = String(order.cargo_tracking || order.hb_package_number || "").replace(/\D+/g, "");
    const r = await getHepsiburadaMarketplaceLabel(token, orderId, pkg || undefined);
    const url = r?.file_url || r?.url || "";
    if (url && /^https:\/\//i.test(url)) {
      const path = `${FileSystem.cacheDirectory}hb-${orderId}.pdf`;
      const dl = await FileSystem.downloadAsync(url, path);
      if (dl.status >= 200 && dl.status < 300 && (await fileLooksLikePdf(path))) return { path };
      apiError = dl.status >= 200 && dl.status < 300 ? "Etiket bağlantısı PDF döndürmedi" : `Etiket bağlantısı açılamadı (${dl.status})`;
    } else {
      const data = r?.data_base64 || r?.data || "";
      if (data) {
        try {
          return { path: await writePdfBase64(data, `hb-${orderId}`) };
        } catch {
          apiError = "API PDF olmayan bir yanıt döndürdü";
        }
      } else if (r?.zpl) {
        apiError = "API PDF yerine ZPL döndürdü";
      } else {
        apiError = r?.message || "API etiket döndürmedi";
      }
    }
  } catch (e: any) {
    apiError = String(e?.message || "");
  }
  const path = await orderProductLabelPdf(token, orderId, "product");
  return {
    path,
    notice: apiError
      ? `Hepsiburada etiketi yerine ObiHub etiketi yazdırıldı. API hata: ${apiError}`
      : "Hepsiburada etiketi yerine ObiHub etiketi yazdırıldı.",
  };
}

// Etiket PDF'ini cihaza yazar. Şablon verilmezse kanalın varsayılanı kullanılır.
// `order` verilirse web'deki ön koşullar (n11/Idefix kargo kodu) denetlenir.
export async function fetchOrderLabelFile(
  token: string,
  orderId: string,
  provider: string,
  opts: { template?: LabelTemplate; order?: Partial<OrderFull> | null } = {}
): Promise<LabelFile> {
  const key = channelKeyOf(provider || opts.order?.channel);
  const template = opts.template || labelOptionsFor(provider || String(opts.order?.channel || ""), opts.order?.cargo_provider)[0].template;
  const order = opts.order || null;

  if (template === "original") return { path: await originalLabel(token, orderId) };
  if (template === "cargo") return { path: await cargoLabel(token, orderId) };

  if (key === "hepsiburada" && template === "marketplace") return hepsiburadaLabel(token, order || {}, orderId);

  if (key === "idefix" && template === "shared") {
    if (order && !String(order.idefix_cargo_tracking || order.cargo_tracking || "").trim()) {
      throw new Error("Idefix için önce gerçek HepsiJet barkodunun oluşması gerekir.");
    }
    return { path: await orderProductLabelPdf(token, orderId, "shared") };
  }

  if ((key === "n11" || key === "idefix") && order && !orderHasPrintableLabel(order, provider)) {
    throw new Error(
      key === "n11"
        ? "N11 etiketi henüz hazır değil. Önce \"Etiketi hazırla\" ile kargo kodunu oluşturun."
        : "Idefix kargo kodu henüz oluşmadı. Siparişi işleme alıp yeniden senkronize edin."
    );
  }
  return { path: await orderProductLabelPdf(token, orderId, "product") };
}

// Etiketi alır ve yazdırma penceresini açar. Kullanıcı yazdırmaktan vazgeçerse `printed` false olur.
export async function printOrderLabel(
  token: string,
  orderId: string,
  provider: string,
  opts: { template?: LabelTemplate; order?: Partial<OrderFull> | null } = {}
): Promise<{ printed: boolean; notice?: string }> {
  const file = await fetchOrderLabelFile(token, orderId, provider, opts);
  const printed = await printOrShare(file.path);
  return { printed, notice: file.notice };
}
