// Dalga B3 — yeni ürün. Web: ProductsPage.js "Ürün ekle" (POST /products). Ad zorunlu; SKU önerilir.
// İlk stok sunucuda "Açılış stoğu" hareketi olarak yazılır. Kayıttan sonra ürün detayı açılır (görsel ve eşleştirme oradan).
import React, { useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { createProduct } from "../../src/api-urun-stok";
import { getUiCapabilities } from "../../src/api-gider";
import { markCatalogDirty, rememberCatalog } from "../../src/catalogCache";
import { isUncertainWrite } from "../../src/api-finans";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { formatTry } from "../../src/utils";
import { AlertIcon, PackageIcon, PlusIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { Button } from "../../src/ui/Button";
import { parseAmount, useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { HeroCard, ON_HERO } from "../../src/ui/HeroCard";
import { SectionTitle } from "../../src/ui/ListRow";

const suggestSku = () => `SKU-${Date.now().toString().slice(-6)}`;

export default function NewProductScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const allowed = canManage(user, "catalog");
  const [name, setName] = useState("");
  const [sku, setSku] = useState(suggestSku);
  const [barcode, setBarcode] = useState("");
  const [priceText, setPriceText] = useState("");
  const [stockText, setStockText] = useState("0");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [ownerAccounting, setOwnerAccounting] = useState(false);
  const sending = useRef(false);

  React.useEffect(() => {
    if (!token) return;
    getUiCapabilities(token).then((c) => setOwnerAccounting(c.inventoryOwner?.owner === "accounting"));
  }, [token]);

  const price = priceText.trim() === "" ? 0 : parseAmount(priceText, true);
  const stock = stockText.trim() === "" ? 0 : parseAmount(stockText, false);
  const errors = useMemo(
    () => ({
      name: tried && !name.trim() ? "Ürün adını girin." : name.length > 255 ? "Ad en çok 255 karakter olabilir." : undefined,
      price: tried && price === null ? "Geçerli bir fiyat girin: en çok 2 ondalık, ör. 1.234,56." : undefined,
      stock: tried && stock === null ? "Tam sayı girin, ör. 12." : undefined,
      sku: sku.length > 64 ? "SKU en çok 64 karakter olabilir." : undefined,
      barcode: barcode.length > 64 ? "Barkod en çok 64 karakter olabilir." : undefined,
    }),
    [tried, name, price, stock, sku, barcode]
  );

  const submit = async () => {
    setTried(true);
    if (!token || sending.current || !name.trim() || price === null || stock === null || errors.sku || errors.barcode) return;
    sending.current = true;
    setBusy(true);
    try {
      const created = await createProduct(token, { name, sku, barcode, price, stock });
      if (!created.id) throw { message: "Ürün oluşturuldu ama kimliği alınamadı; listeyi yenileyin.", status: 0 };
      // Detay ekranı ürünü önbellekten açar; liste de bir sonraki odakta yeniden okunur.
      rememberCatalog(
        [{ id: created.id, name: name.trim(), sku: sku.trim() || undefined, barcode: barcode.trim() || undefined, stock, reserved: 0, onHand: stock, price, channelStocks: [], channelPrices: [] }],
        []
      );
      markCatalogDirty();
      toast("Ürün oluşturuldu.", "success");
      router.replace({ pathname: "/products/[id]", params: { id: created.id } });
    } catch (e: any) {
      if (isUncertainWrite(e)) {
        // Ürün oluşmuş olabilir: ikinci kez göndermeden önce listeyi kontrol etmesi istenir.
        setUncertain(true);
        markCatalogDirty();
        toast("Sonuç alınamadı. Ürün oluşmuş olabilir; listeyi kontrol edin.", "error");
      } else toast(e?.message || "Ürün oluşturulamadı.", "error");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  if (!allowed) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Yeni ürün" />
        <EmptyState icon={<PackageIcon size={30} color={colors.textTertiary} />} title="Yetkiniz yok" description="Ürün eklemek için katalog yönetme izni gerekir." />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="new-product-screen">
      <StackHeader title="Yeni ürün" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <HeroCard tone="blue">
            <View style={styles.heroRow}>
              <View style={styles.heroIcon}>
                <PackageIcon size={22} color={ON_HERO.text} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.heroName} numberOfLines={2}>
                  {name.trim() || "Ürün adı"}
                </Text>
                <Text style={styles.heroSub} numberOfLines={1}>
                  {[sku.trim() && `SKU ${sku.trim()}`, barcode.trim() && `Barkod ${barcode.trim()}`].filter(Boolean).join(" · ") || "Kod yok"}
                </Text>
              </View>
            </View>
            <View style={styles.heroStats}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroLabel}>Fiyat</Text>
                <Text style={[styles.heroValue, tabular]}>{formatTry(price || 0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroLabel}>Açılış stoğu</Text>
                <Text style={[styles.heroValue, tabular]}>{`${stock ?? 0} adet`}</Text>
              </View>
            </View>
          </HeroCard>

          <SectionTitle title="Ürün bilgileri" />
          <View style={styles.form}>
            <FormField testID="np-name" label="Ürün adı" value={name} onChangeText={setName} maxLength={255} error={errors.name} />
            <FormField testID="np-sku" label="SKU" value={sku} onChangeText={setSku} autoCapitalize="characters" autoCorrect={false} maxLength={64} error={errors.sku} hint="Boş bırakılabilir; önerilen kod otomatik verildi." />
            <FormField testID="np-barcode" label="Barkod (isteğe bağlı)" value={barcode} onChangeText={setBarcode} autoCapitalize="none" autoCorrect={false} keyboardType="number-pad" maxLength={64} error={errors.barcode} />
          </View>

          <SectionTitle title="Fiyat ve stok" />
          <View style={styles.form}>
            <View style={styles.row2}>
              <FormField testID="np-price" label="Satış fiyatı" value={priceText} onChangeText={setPriceText} keyboardType="decimal-pad" placeholder="0,00" suffix="₺" error={errors.price} style={{ flex: 1.3 }} />
              <FormField testID="np-stock" label="Açılış stoğu" value={stockText} onChangeText={setStockText} keyboardType="number-pad" error={errors.stock} style={{ flex: 1 }} />
            </View>
            {ownerAccounting ? (
              <View style={[styles.notice, { backgroundColor: colors.surfaceMuted }]}>
                <AlertIcon size={16} color={colors.textSecondary} />
                <Text style={[type.footnote, { color: colors.textSecondary, flex: 1 }]}>
                  Stok sahibi muhasebe programınız; ürün programla eşleşince stok oradan gelir.
                </Text>
              </View>
            ) : null}
            <Text style={[type.caption, { color: colors.textTertiary }]}>
              Görsel, kategori ve pazaryeri eşleştirmesini kayıttan sonra ürün detayından ekleyebilirsiniz.
            </Text>
            {uncertain ? (
              <View style={[styles.notice, { backgroundColor: colors.warningBg }]} testID="np-uncertain">
                <AlertIcon size={16} color={colors.amber} />
                <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>
                  Önceki gönderimin sonucu alınamadı; ürün oluşmuş olabilir. Yeniden göndermeden önce Ürünler listesinde arayın.
                </Text>
              </View>
            ) : null}
            <Button testID="np-save" label={uncertain ? "Yine de oluştur" : "Ürünü oluştur"} icon={<PlusIcon size={18} color="#FFFFFF" />} busy={busy} onPress={submit} variant={uncertain ? "destructive" : "primary"} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { paddingTop: spacing.xs, paddingBottom: spacing.huge },
  form: { paddingHorizontal: spacing.lg, gap: spacing.md },
  row2: { flexDirection: "row", gap: spacing.sm },
  notice: { flexDirection: "row", gap: spacing.xs, alignItems: "flex-start", padding: spacing.sm, borderRadius: radius.md },
  heroRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  heroIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: ON_HERO.faint },
  heroName: { color: ON_HERO.text, fontSize: 18, fontWeight: "800" },
  heroSub: { color: ON_HERO.soft, fontSize: 12, marginTop: 2 },
  heroStats: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: ON_HERO.faint },
  heroLabel: { color: ON_HERO.soft, fontSize: 12 },
  heroValue: { color: ON_HERO.text, fontSize: 20, fontWeight: "800", marginTop: 2 },
});
