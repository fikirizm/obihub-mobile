import React, { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { FadeInDown } from "react-native-reanimated";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { getCatalog, setChannelPrice, setChannelStock, setProductPrice, setProductStock, SYNC_NONE } from "../../src/api";
import { recallChannels, recallProduct, rememberCatalog } from "../../src/catalogCache";
import { useTheme } from "../../src/theme/ThemeProvider";
import { palette, radius, spacing, tabular, type } from "../../src/theme/tokens";
import { formatTry } from "../../src/utils";
import { ArrowRightIcon, LinkIcon, PackageIcon, ZapIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { PressableScale } from "../../src/components/KPICard";
import { PlatformLogo } from "../../src/components/PlatformLogo";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { DetailHero } from "../../src/ui/DetailHero";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { ON_HERO } from "../../src/ui/HeroCard";
import { Card, IconTile, SectionTitle } from "../../src/ui/ListRow";
import type { CatalogProduct, ChannelRef } from "../../src/types";

// Koyu gradyan üzerinde okunabilen uyarı kırmızısı (koyu tema paletinden).
const HERO_BAD = palette.dark.error;

// Özet kartındaki rakam hücresi. Düzenlenebiliyorsa hücrenin kendisi dokunulabilir olur.
function HeroStat({
  label,
  value,
  bad,
  busy,
  onPress,
  testID,
  valueTestID,
}: {
  label: string;
  value: string;
  bad?: boolean;
  busy?: boolean;
  onPress?: () => void;
  testID: string;
  valueTestID: string;
}) {
  const inner = (
    <View style={styles.statInner}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text testID={valueTestID} style={[styles.statValue, tabular, { color: bad ? HERO_BAD : ON_HERO.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {onPress ? (
        <View style={styles.statHintRow}>
          {busy ? <ActivityIndicator size="small" color={ON_HERO.soft} /> : <Text style={styles.statHint}>Düzenle</Text>}
        </View>
      ) : null}
    </View>
  );
  if (!onPress) {
    return (
      <View style={styles.statCell} accessible accessibilityLabel={`${label}: ${value}`}>
        {inner}
      </View>
    );
  }
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}, Düzenle`}
      accessibilityState={{ busy: Boolean(busy), disabled: Boolean(busy) }}
      style={styles.statCell}
    >
      {inner}
    </PressableScale>
  );
}

// Kanal satırı: solda pazaryeri logosu, sağda değer; eşleşme yoksa soluk, ana stoktan farklıysa uyarı notu.
function ChannelRow({
  channel,
  value,
  matched,
  note,
  divider,
  busy,
  editable,
  onPress,
  testID,
}: {
  channel: ChannelRef;
  value: string;
  matched: boolean;
  note?: string;
  divider: boolean;
  busy: boolean;
  editable: boolean;
  onPress?: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  const content = (
    <View style={[styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <View style={!matched && styles.dim}>
        <PlatformLogo provider={channel.platform} size="sm" />
      </View>
      <View style={styles.rowBody}>
        <Text style={[type.bodyStrong, { color: matched ? colors.textPrimary : colors.textSecondary }]} numberOfLines={1}>
          {channel.name}
        </Text>
        {!matched ? (
          <Text style={[type.caption, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
            Eşleştirilmemiş
          </Text>
        ) : note ? (
          <View style={[styles.notePill, { backgroundColor: colors.amberSoft }]}>
            <View style={[styles.noteDot, { backgroundColor: colors.amber }]} />
            <Text style={[type.caption, { color: colors.amber }]} numberOfLines={1}>
              {note}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={[type.bodyStrong, tabular, styles.rowValue, { color: matched ? colors.textPrimary : colors.textTertiary }]} numberOfLines={1}>
        {value}
      </Text>
      {busy ? (
        <ActivityIndicator size="small" color={colors.textTertiary} />
      ) : editable ? (
        <ArrowRightIcon size={16} color={colors.textTertiary} />
      ) : null}
    </View>
  );
  if (!onPress) return <View testID={testID}>{content}</View>;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[channel.name, value, note, "Düzenle"].filter(Boolean).join(", ")}
    >
      {content}
    </PressableScale>
  );
}

export default function ProductDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id || "");
  const { token, user, accountingProvider, accountingLoaded, reloadAccounting } = useAuth();
  const { colors } = useTheme();
  const { toast, promptNumber, promptEntry } = useFeedback();
  const [product, setProduct] = useState<CatalogProduct | null>(() => recallProduct(id));
  const [channels, setChannels] = useState<ChannelRef[]>(() => recallChannels());
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const canEdit = canManage(user, "inventory");

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

  // Değişikliği sunucuya yazar. Başarılıysa yazılan değer ekrana hemen uygulanır; ardından liste yeniden okunur.
  const run = async (
    key: string,
    action: () => Promise<{ message?: string; skipped_providers?: Record<string, string> }>,
    apply: (p: CatalogProduct) => CatalogProduct,
    done: string
  ) => {
    setBusyKey(key);
    try {
      const res = await action();
      setProduct((prev) => {
        if (!prev) return prev;
        const next = apply(prev);
        rememberCatalog([next], []);
        return next;
      });
      const skipped = Object.keys(res?.skipped_providers || {});
      if (skipped.length > 0) toast(`Kaydedildi, ancak şu kanallara gönderilemedi: ${skipped.join(", ")}`, "error");
      else toast(done, "success");
      await reload();
    } catch (e: any) {
      toast(e?.message || "Güncellenemedi.", "error");
      // Sunucu yerel değeri yazıp kanal hatası döndürmüş olabilir; güncel durumu oku.
      await reload();
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
    // Hedef muhasebe programı bilinmeden yazılmaz: sunucu boş hedefi "tüm kanallar" sayar.
    if (!accountingLoaded) {
      await reloadAccounting();
      toast("Muhasebe ayarı okunamadı. Bağlantıyı kontrol edip tekrar deneyin.", "error");
      return;
    }
    const v = await promptNumber({
      title: "Ana stok",
      message: accountingProvider ? `${product.name}\nMuhasebe programına da yansıtılır; pazaryeri stokları ayrı güncellenir.` : product.name,
      initial: product.stock,
      suffix: "adet",
    });
    if (v === null || v === product.stock) return;
    // Web panelindeki gibi: ana stok yalnızca muhasebe programına yansıtılır.
    await run("stock", () => setProductStock(token, product.id, v, [accountingProvider || SYNC_NONE]), (p) => ({ ...p, stock: v }), "Stok güncellendi");
  };

  const editBasePrice = async () => {
    if (!token) return;
    // Kapsam aynı sayfada seçilir (iOS'ta art arda iki sayfa açılamaz). Varsayılan: yalnızca ana fiyat.
    const entry = await promptEntry({
      title: "Ana fiyat",
      message: product.name,
      initial: product.price,
      decimal: true,
      suffix: "₺",
      methods: [
        { value: "base", label: "Yalnızca ana fiyat" },
        { value: "all", label: "Bağlı tüm kanallara da gönder" },
      ],
    });
    if (!entry) return;
    const v = entry.amount;
    const pushAll = entry.method === "all";
    if (v === product.price && !pushAll) return;
    await run("price", () => setProductPrice(token, product.id, v, pushAll), (p) => ({ ...p, price: v }), pushAll ? "Fiyat güncellendi ve kanallara gönderildi" : "Fiyat güncellendi");
  };

  const editChannelStock = async (ch: ChannelRef, current: number) => {
    if (!token) return;
    const v = await promptNumber({ title: `${ch.name} stoğu`, message: product.name, initial: current, suffix: "adet" });
    if (v === null || v === current) return;
    await run(
      `cs-${ch.id}`,
      () => setChannelStock(token, product.id, ch.id, v),
      (p) => ({ ...p, channelStocks: p.channelStocks.map((x) => (x.integration_id === ch.id ? { ...x, stock: v } : x)) }),
      `${ch.name} stoğu güncellendi`
    );
  };

  const editChannelPrice = async (ch: ChannelRef, current: number) => {
    if (!token) return;
    const v = await promptNumber({ title: `${ch.name} fiyatı`, message: product.name, initial: current, decimal: true, suffix: "₺" });
    if (v === null || v === current) return;
    await run(
      `cp-${ch.id}`,
      () => setChannelPrice(token, product.id, ch.id, v),
      (p) => ({ ...p, channelPrices: p.channelPrices.map((x) => (x.integration_id === ch.id ? { ...x, price: v } : x)) }),
      `${ch.name} fiyatı güncellendi`
    );
  };

  const hasImage = Boolean(product.image_url && /^https?:\/\//i.test(product.image_url));
  const lowStock = product.stock <= 5;
  // Özet kartının başlığı iki satırla sınırlıdır; uzun adlar ve kodlar kesilmeden, seçilebilir biçimde altında gösterilir.
  const longName = product.name.length > 40;
  const codes = [
    product.sku ? { label: "SKU", value: String(product.sku) } : null,
    product.barcode ? { label: "Barkod", value: String(product.barcode) } : null,
  ].filter((c): c is { label: string; value: string } => c !== null);
  const matchedStocks = channels.filter((ch) => product.channelStocks.some((x) => x.integration_id === ch.id)).length;
  const matchedPrices = channels.filter((ch) => product.channelPrices.some((x) => x.integration_id === ch.id)).length;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="product-detail-screen">
      <StackHeader title="Ürün" />
      <ScrollView
        contentContainerStyle={{ paddingTop: spacing.xs, paddingBottom: spacing.huge }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); reload(); }} tintColor={colors.primary} />}
      >
        <DetailHero
          tone="blue"
          testID="product-hero"
          leading={
            <View style={styles.image}>
              {hasImage ? (
                <ExpoImage source={{ uri: product.image_url as string }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
              ) : (
                <PackageIcon size={28} color={ON_HERO.soft} />
              )}
            </View>
          }
          title={product.name}
          subtitle={codes.length === 0 ? "Kod yok" : undefined}
        >
          {longName || codes.length > 0 ? (
            <View style={styles.identity}>
              {longName ? (
                <Text testID="product-full-name" style={styles.fullName} selectable>
                  {product.name}
                </Text>
              ) : null}
              {codes.map((c) => (
                <View key={c.label} style={styles.codeRow}>
                  <Text style={styles.codeLabel}>{c.label}</Text>
                  <Text style={[styles.codeValue, tabular]} selectable>
                    {c.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.stats}>
            <HeroStat
              label="Ana stok"
              value={String(product.stock)}
              bad={lowStock}
              busy={busyKey === "stock"}
              onPress={canEdit ? editBaseStock : undefined}
              testID="product-edit-stock"
              valueTestID="product-stock"
            />
            <View style={styles.statDivider} />
            <HeroStat
              label="Ana fiyat"
              value={formatTry(product.price)}
              busy={busyKey === "price"}
              onPress={canEdit ? editBasePrice : undefined}
              testID="product-edit-price"
              valueTestID="product-price"
            />
          </View>
          {lowStock ? (
            <View style={styles.lowRow}>
              <View style={[styles.lowDot, { backgroundColor: HERO_BAD }]} />
              <Text style={styles.lowText} numberOfLines={1}>
                Stok azaldı
              </Text>
            </View>
          ) : null}
        </DetailHero>

        {channels.length > 0 ? (
          <>
            <SafeAnimatedView entering={FadeInDown.delay(80).duration(380)}>
              <SectionTitle
                title="Kanal stokları"
                action={
                  <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>
                    {`${matchedStocks} / ${channels.length} eşleşti`}
                  </Text>
                }
              />
              <Card style={styles.block}>
                {channels.map((ch, i) => {
                  const row = product.channelStocks.find((x) => x.integration_id === ch.id);
                  return (
                    <ChannelRow
                      key={ch.id}
                      testID={`channel-stock-${ch.id}`}
                      channel={ch}
                      divider={i > 0}
                      matched={Boolean(row)}
                      value={row ? `${row.stock} adet` : "-"}
                      note={row && row.stock !== product.stock ? "Ana stoktan farklı" : undefined}
                      busy={busyKey === `cs-${ch.id}`}
                      editable={canEdit && Boolean(row)}
                      onPress={canEdit && row && !busyKey ? () => editChannelStock(ch, row.stock) : undefined}
                    />
                  );
                })}
              </Card>
            </SafeAnimatedView>

            <SafeAnimatedView entering={FadeInDown.delay(150).duration(380)}>
              <SectionTitle
                title="Kanal fiyatları"
                action={
                  <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>
                    {`${matchedPrices} / ${channels.length} eşleşti`}
                  </Text>
                }
              />
              <Card style={styles.block}>
                {channels.map((ch, i) => {
                  const row = product.channelPrices.find((x) => x.integration_id === ch.id);
                  return (
                    <ChannelRow
                      key={ch.id}
                      testID={`channel-price-${ch.id}`}
                      channel={ch}
                      divider={i > 0}
                      matched={Boolean(row)}
                      value={row ? formatTry(row.price) : "-"}
                      busy={busyKey === `cp-${ch.id}`}
                      editable={canEdit && Boolean(row)}
                      onPress={canEdit && row && !busyKey ? () => editChannelPrice(ch, row.price) : undefined}
                    />
                  );
                })}
              </Card>
            </SafeAnimatedView>

            <SafeAnimatedView entering={FadeInDown.delay(220).duration(380)} style={styles.note}>
              <IconTile tint={colors.primarySoft}>
                <ZapIcon size={18} color={colors.primary} />
              </IconTile>
              <Text style={[type.caption, styles.noteText, { color: colors.textSecondary }]}>
                Kanal değeri değiştiğinde ilgili pazaryerine hemen gönderilir. Ürün eşleştirme web panelinden yapılır.
              </Text>
            </SafeAnimatedView>
          </>
        ) : (
          <SafeAnimatedView entering={FadeInDown.delay(80).duration(380)}>
            <Card padded style={[styles.block, styles.emptyCard]}>
              <IconTile tint={colors.primarySoft}>
                <LinkIcon size={18} color={colors.primary} />
              </IconTile>
              <Text style={[type.footnote, styles.noteText, { color: colors.textSecondary }]}>
                Kanal bilgisi henüz yüklenmedi. Yenilemek için ekranı aşağı çekin.
              </Text>
            </Card>
          </SafeAnimatedView>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  image: { width: 64, height: 64, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: ON_HERO.faint },
  identity: { marginTop: spacing.md, gap: 6 },
  fullName: { color: ON_HERO.soft, fontSize: 13, lineHeight: 18 },
  codeRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  codeLabel: { color: ON_HERO.soft, fontSize: 12, lineHeight: 18, fontWeight: "600", width: 52 },
  codeValue: { flex: 1, minWidth: 0, color: ON_HERO.text, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  stats: { flexDirection: "row", alignItems: "stretch", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: ON_HERO.faint },
  statCell: { flex: 1, minWidth: 0, minHeight: 64, justifyContent: "center" },
  statInner: { alignItems: "center", paddingHorizontal: 4 },
  statLabel: { color: ON_HERO.soft, fontSize: 12, fontWeight: "500" },
  statValue: { fontSize: 22, fontWeight: "800", marginTop: 2, letterSpacing: -0.4 },
  statHintRow: { height: 20, marginTop: 2, alignItems: "center", justifyContent: "center" },
  statHint: { color: ON_HERO.soft, fontSize: 12, fontWeight: "600", textDecorationLine: "underline" },
  statDivider: { width: 1, backgroundColor: ON_HERO.faint, marginVertical: 4 },
  lowRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  lowDot: { width: 6, height: 6, borderRadius: 3 },
  lowText: { color: ON_HERO.soft, fontSize: 12, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 60, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  rowBody: { flex: 1, minWidth: 0, alignItems: "flex-start" },
  rowValue: { flexShrink: 0, maxWidth: "45%", textAlign: "right" },
  dim: { opacity: 0.45 },
  notePill: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, maxWidth: "100%" },
  noteDot: { width: 6, height: 6, borderRadius: 3 },
  note: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md },
  noteText: { flex: 1, minWidth: 0 },
  emptyCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
});
