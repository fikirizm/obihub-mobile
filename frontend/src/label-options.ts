// Kanal anahtarı ve etiket şablonları (saf modül; birim testi dev/test-label-options.mjs).  Web: components/CargoLabelSidebar.js.
// - Trendyol, n11, Pazarama: ObiHub ürünlü etiketi; pazaryeri etiketi seçeneği yok.
// - Hepsiburada: varsayılan ürünlü etiket; ikinci seçenek Hepsiburada etiketi.
// - Idefix: varsayılan ortak HepsiJet etiketi; ikinci seçenek Idefix ürünlü etiketi.
// - Diğerleri (WooCommerce vb., E2): varsayılan orijinal HepsiJet etiketi (GET /hepsijet/label/{barkod}?format=PDF);
//   ikinci seçenek ürünlü etiket (/hepsijet/label-with-products/{sipariş}).

export type ChannelKey = "trendyol" | "hepsiburada" | "n11" | "idefix" | "pazarama" | "amazon" | "woocommerce" | "other";

// Web'deki kanal anahtarı (sağlayıcı adı küçük harfle) ile aynı sınıflandırma.
export function channelKeyOf(raw: unknown): ChannelKey {
  const v = String(raw || "").trim().toLowerCase();
  if (v.includes("trendyol")) return "trendyol";
  if (v.includes("hepsiburada")) return "hepsiburada";
  if (v.includes("n11")) return "n11";
  if (v.includes("idefix")) return "idefix";
  if (v.includes("pazarama")) return "pazarama";
  if (v.includes("amazon")) return "amazon";
  if (v.includes("woo")) return "woocommerce";
  return "other";
}

export type LabelTemplate = "product" | "marketplace" | "shared" | "cargo" | "original";
export type LabelOption = { template: LabelTemplate; label: string };

// İlk seçenek varsayılandır.
// cargoProvider: siparişin kargo sağlayıcısı (order.cargo_provider). HepsiJet dışında bir sağlayıcıyla (ör. Yurtiçi) gönderilen
// web/WooCommerce siparişinde "Orijinal HepsiJet etiketi" sunulmaz; yalnız ürünlü etiket kalır. Boşsa (eski kayıt) HepsiJet sayılır.
export function labelOptionsFor(provider: string, cargoProvider?: string | null): LabelOption[] {
  switch (channelKeyOf(provider)) {
    case "trendyol":
      return [{ template: "product", label: "Ürünlü barkod etiketi" }];
    case "hepsiburada":
      return [
        { template: "product", label: "Ürünlü etiket" },
        { template: "marketplace", label: "Hepsiburada etiketi" },
      ];
    case "n11":
      return [{ template: "product", label: "N11 sipariş etiketi" }];
    case "idefix":
      return [
        { template: "shared", label: "HepsiJet ortak etiketi" },
        { template: "product", label: "Idefix ürünlü etiketi" },
      ];
    case "pazarama":
      return [{ template: "product", label: "Pazarama sipariş etiketi" }];
    default: {
      const cargo = String(cargoProvider || "").trim().toLowerCase();
      if (cargo && cargo !== "hepsijet") return [{ template: "cargo", label: "Ürünlü etiket" }];
      return [
        { template: "original", label: "Orijinal HepsiJet etiketi" },
        { template: "cargo", label: "Ürünlü etiket" },
      ];
    }
  }
}
