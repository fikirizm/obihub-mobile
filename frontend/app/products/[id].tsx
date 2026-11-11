import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canAccess } from "../../src/auth/permissions";
import { getCatalog, setChannelPrice, setChannelStock, setProductPrice, setProductStock } from "../../src/api";
import { recallChannels, recallProduct, rememberCatalog } from "../../src/catalogCache";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { formatTry } from "../../src/utils";
import { PackageIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { PlatformLogo } from "../../src/components/PlatformLogo";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { Card, ListRow, SectionTitle } from "../../src/ui/ListRow";
import type { CatalogProduct, ChannelRef } from "../../src/types";

export default function ProductDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id || "");
  const { token, user, accountingProvider } = useAuth();
  const { colors } = useTheme();
  const { toast, promptNumber } = useFeedback();
  const [product, setProduct] = useState<CatalogProduct | null>(() => recallProduct(id));
  const [channels, setChannels] = useState<ChannelRef[]>(() => recallChannels());
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const canEdit = canAccess(user, "inventory");

  const reload = useCallback(async () => {
    if (!token || !product) return;
    try {
      const res = await getCatalog(token, { search: product.sku || product.barcode || product.name, perPage: 50 });
      rememberCatalog(res.products, res.channels);
      const fresh = res.products.find((p) => p.id === product.id);
      if (fresh) setProduct(fresh);
      if (res.channels.length > 0) setChannels(res.channels);
    } catch {
      // Yenilenemedi: eldeki değerler gösterilmeye devam eder.
    } finally {
      setRefreshing(false);
    }
  }, [token, product]);

  // Değişikliği sunucuya yazar; başarılıysa listeyi yeniden okur.
  const run = async (key: string, action: () => Promise<{ message?: string }>, done: string) => {
    setBusyKey(key);
    try {
      await action();
      toast(done, "success");
      await reload();
    } catch (e: any) {
      toast(e?.message || "Güncellenemedi.", "error");
    } finally {
      setBusyKey(null);
    }
  };

  if (!product) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Ürün" />
        <EmptyState icon={<PackageIcon size={30} color={colors.textTertiary} />} title="Ürün bulunamadı" description="Ürünü listeden yeniden açın." />
      </View>
    );
  }

  const editBaseStock = async () => {
    if (!token) return;
    const v = await promptNumber({ title: "Ana stok", message: product.name, initial: product.stock, suffix: "adet" });
    if (v === null || v === product.stock) return;
    // Web panelindeki gibi: ana stok yalnızca muhasebe programına yansıtılır, kanallar ayrı güncellenir.
    await run("stock", () => setProductStock(token, product.id, v, accountingProvider ? [accountingProvider] : []), "Stok güncellendi");
  };

  const editBasePrice = async () => {
    if (!token) return;
    const v = await promptNumber({ title: "Ana fiyat", message: product.name, initial: product.price, decimal: true, suffix: "₺" });
    if (v === null || v === product.price) return;
    await run("price", () => setProductPrice(token, product.id, v), "Fiyat güncellendi");
  };

  const editChannelStock = async (ch: ChannelRef, current: number) => {
    if (!token) return;
    const v = await promptNumber({ title: `${ch.name} stoğu`, message: product.name, initial: current, suffix: "adet" });
    if (v === null || v === current) return;
    await run(`cs-${ch.id}`, () => setChannelStock(token, product.id, ch.id, v), `${ch.name} stoğu güncellendi`);
  };

  const editChannelPrice = async (ch: ChannelRef, current: number) => {
    if (!token) return;
    const v = await promptNumber({ title: `${ch.name} fiyatı`, message: product.name, initial: current, decimal: true, suffix: "₺" });
    if (v === null || v === current) return;
    await run(`cp-${ch.id}`, () => setChannelPrice(token, product.id, ch.id, v), `${ch.name} fiyatı güncellendi`);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="product-detail-screen">
      <StackHeader title="Ürün" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); reload(); }} tintColor={colors.primary} />}
      >
        <View style={styles.head}>
          <View style={[styles.image, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            {product.image_url && /^https?:\/\//i.test(product.image_url) ? (
              <ExpoImage source={{ uri: product.image_url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            ) : (
              <PackageIcon size={28} color={colors.textTertiary} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.headline, { color: colors.textPrimary }]}>{product.name}</Text>
            <Text style={[type.footnote, { color: colors.textSecondary, marginTop: 2 }]} selectable>
              {[product.sku && `SKU ${product.sku}`, product.barcode && `Barkod ${product.barcode}`].filter(Boolean).join("\n") || "Kod yok"}
            </Text>
          </View>
        </View>

        <View style={styles.kpis}>
          <Card padded style={{ flex: 1 }}>
            <Text style={[type.caption, { color: colors.textTertiary }]}>Ana stok</Text>
            <Text testID="product-stock" style={[type.title, tabular, { color: product.stock <= 5 ? colors.error : colors.textPrimary }]}>{product.stock}</Text>
            {canEdit ? <Button testID="product-edit-stock" label="Düzenle" variant="secondary" size="sm" busy={busyKey === "stock"} onPress={editBaseStock} style={{ marginTop: spacing.sm }} /> : null}
          </Card>
          <Card padded style={{ flex: 1 }}>
            <Text style={[type.caption, { color: colors.textTertiary }]}>Ana fiyat</Text>
            <Text testID="product-price" style={[type.title, tabular, { color: colors.textPrimary }]}>{formatTry(product.price)}</Text>
            {canEdit ? <Button testID="product-edit-price" label="Düzenle" variant="secondary" size="sm" busy={busyKey === "price"} onPress={editBasePrice} style={{ marginTop: spacing.sm }} /> : null}
          </Card>
        </View>

        {channels.length > 0 ? (
          <>
            <SectionTitle title="Kanal stokları" />
            <Card style={styles.block}>
              {channels.map((ch, i) => {
                const row = product.channelStocks.find((x) => x.integration_id === ch.id);
                return (
                  <ListRow
                    key={ch.id}
                    testID={`channel-stock-${ch.id}`}
                    divider={i > 0}
                    leading={<PlatformLogo provider={ch.platform} size="sm" />}
                    title={ch.name}
                    subtitle={row ? undefined : "Eşleştirilmemiş"}
                    trailing={<Text style={[type.bodyStrong, tabular, { color: row ? colors.textPrimary : colors.textTertiary }]}>{row ? `${row.stock} adet` : "-"}</Text>}
                    chevron={canEdit && Boolean(row)}
                    onPress={canEdit && row && !busyKey ? () => editChannelStock(ch, row.stock) : undefined}
                  />
                );
              })}
            </Card>

            <SectionTitle title="Kanal fiyatları" />
            <Card style={styles.block}>
              {channels.map((ch, i) => {
                const row = product.channelPrices.find((x) => x.integration_id === ch.id);
                return (
                  <ListRow
                    key={ch.id}
                    testID={`channel-price-${ch.id}`}
                    divider={i > 0}
                    leading={<PlatformLogo provider={ch.platform} size="sm" />}
                    title={ch.name}
                    subtitle={row ? undefined : "Eşleştirilmemiş"}
                    trailing={<Text style={[type.bodyStrong, tabular, { color: row ? colors.textPrimary : colors.textTertiary }]}>{row ? formatTry(row.price) : "-"}</Text>}
                    chevron={canEdit && Boolean(row)}
                    onPress={canEdit && row && !busyKey ? () => editChannelPrice(ch, row.price) : undefined}
                  />
                );
              })}
            </Card>
            <Text style={[type.caption, styles.note, { color: colors.textTertiary }]}>
              Kanal değeri değiştiğinde ilgili pazaryerine hemen gönderilir. Ürün eşleştirme web panelinden yapılır.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  head: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.xs, alignItems: "center" },
  image: { width: 84, height: 84, borderRadius: radius.lg, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  kpis: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  note: { marginHorizontal: spacing.lg, marginTop: spacing.sm },
});
