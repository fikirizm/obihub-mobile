import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Platform, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { getCatalog } from "../../src/api";
import { rememberCatalog } from "../../src/catalogCache";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { formatTry } from "../../src/utils";
import { PackageIcon, Path, SearchIcon, Svg } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { PressableScale } from "../../src/components/KPICard";
import { FadeInDown, SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { Skeleton } from "../../src/components/Skeleton";
import { useDebounce } from "../../src/hooks/useDebounce";
import { Button } from "../../src/ui/Button";
import { StackHeader } from "../../src/ui/Header";
import { SearchField } from "../../src/ui/SearchField";
import type { CatalogProduct } from "../../src/types";

const PER_PAGE = 30;

// Barkod okutma simgesi: köşe çerçevesi içinde çizgiler.
function BarcodeIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 8V6a2 2 0 0 1 2-2h2M17 4h2a2 2 0 0 1 2 2v2M21 16v2a2 2 0 0 1-2 2h-2M7 20H5a2 2 0 0 1-2-2v-2" />
      <Path d="M8 8v8M12 8v8M16 8v8" />
    </Svg>
  );
}

// Yükleme sırasında ürün satırıyla aynı biçimde yer tutucu.
function ProductRowSkeleton() {
  const { colors, shadows } = useTheme();
  return (
    <View style={[styles.row, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
      <Skeleton width={52} height={52} borderRadius={radius.md} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="78%" height={14} />
        <Skeleton width="52%" height={11} />
      </View>
      <View style={{ alignItems: "flex-end", gap: 8 }}>
        <Skeleton width={68} height={14} />
        <Skeleton width={58} height={22} borderRadius={11} />
      </View>
    </View>
  );
}

export default function ProductsScreen() {
  const params = useLocalSearchParams<{ q?: string; t?: string }>();
  const { token } = useAuth();
  const { colors, shadows } = useTheme();
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search.trim(), 350);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  // Barkod okuyucudan dönen değer arama kutusuna yazılır.
  useEffect(() => {
    if (params.q) setSearch(String(params.q));
  }, [params.q, params.t]);

  const fetchPage = useCallback(
    async (nextPage: number, mode: "reset" | "more" | "refresh") => {
      if (!token) return;
      const id = ++requestId.current;
      if (mode === "reset") setLoading(true);
      if (mode === "more") setLoadingMore(true);
      try {
        const res = await getCatalog(token, { page: nextPage, perPage: PER_PAGE, search: debounced || undefined });
        if (id !== requestId.current) return;
        rememberCatalog(res.products, res.channels);
        setProducts((prev) => {
          if (mode !== "more") return res.products;
          const known = new Set(prev.map((p) => p.id));
          return [...prev, ...res.products.filter((p) => !known.has(p.id))];
        });
        setTotal(res.total);
        setPage(nextPage);
        setError(null);
      } catch (e: any) {
        if (id === requestId.current) setError(e?.message || "Ürünler yüklenemedi.");
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [token, debounced]
  );

  useEffect(() => {
    fetchPage(1, "reset");
  }, [fetchPage]);

  const hasMore = products.length < total;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="products-screen">
      <StackHeader title="Ürünler" subtitle={loading ? undefined : `${total} ürün`} />
      <SearchField testID="products-search" value={search} onChangeText={setSearch} placeholder="Ürün adı, SKU veya barkod" />
      {Platform.OS !== "web" ? (
        <SafeAnimatedView entering={FadeInDown.delay(60).duration(380)} style={[styles.scanWrap, shadows.primary]}>
          <Button
            testID="products-scan"
            label="Barkod okut"
            icon={<BarcodeIcon size={18} color="#FFFFFF" />}
            onPress={() => router.push("/products/scan")}
            style={styles.scanBtn}
          />
        </SafeAnimatedView>
      ) : null}
      {loading ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.xs }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <ProductRowSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          keyboardDismissMode="on-drag"
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasMore && !loadingMore) fetchPage(page + 1, "more");
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPage(1, "refresh"); }} tintColor={colors.primary} />}
          ListHeaderComponent={
            debounced && products.length > 0 ? (
              <View style={styles.resultHead}>
                <SearchIcon size={14} color={colors.textTertiary} />
                <Text style={[type.caption, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                  “{debounced}” için <Text style={[tabular, { color: colors.textPrimary, fontWeight: "700" }]}>{total}</Text> sonuç
                </Text>
              </View>
            ) : null
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
          renderItem={({ item, index }) => {
            const out = item.stock <= 0;
            const low = !out && item.stock <= 5;
            const stateColor = out ? colors.error : low ? colors.warning : undefined;
            const pillBg = out ? colors.errorBg : low ? colors.warningBg : colors.surfaceMuted;
            const pillFg = out ? colors.error : low ? colors.amber : colors.textSecondary;
            const stockText = item.stock === 0 ? "Stok yok" : low ? `Az stok · ${item.stock}` : `${item.stock} adet`;
            const row = (
              <PressableScale
                testID={`product-${item.id}`}
                onPress={() => router.push({ pathname: "/products/[id]", params: { id: item.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, stok ${item.stock}, fiyat ${formatTry(item.price)}`}
                style={[styles.row, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
              >
                {stateColor ? <View style={[styles.accent, { backgroundColor: stateColor }]} /> : null}
                <View style={[styles.thumb, { backgroundColor: colors.primarySoft, borderColor: colors.borderSubtle }]}>
                  {item.image_url && /^https?:\/\//i.test(item.image_url) ? (
                    <ExpoImage source={{ uri: item.image_url }} style={styles.thumbImg} contentFit="cover" transition={150} />
                  ) : (
                    <PackageIcon size={22} color={colors.primary} />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={[type.caption, tabular, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
                    {[item.sku && `SKU ${item.sku}`, item.barcode].filter(Boolean).join(" · ") || "Kod yok"}
                  </Text>
                </View>
                <View style={styles.trailing}>
                  <Text style={[type.bodyStrong, tabular, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {formatTry(item.price)}
                  </Text>
                  <View style={[styles.pill, { backgroundColor: pillBg }]}>
                    {stateColor ? <View style={[styles.dot, { backgroundColor: stateColor }]} /> : null}
                    <Text style={[type.caption, tabular, { color: pillFg, fontWeight: "700" }]} numberOfLines={1}>
                      {stockText}
                    </Text>
                  </View>
                </View>
              </PressableScale>
            );
            // İlk ekrandaki satırlar sırayla kayarak gelir; sonradan yüklenenler beklemeden görünür.
            return index < 10 ? <SafeAnimatedView entering={FadeInDown.delay(index * 35).duration(320)}>{row}</SafeAnimatedView> : row;
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<PackageIcon size={30} color={error ? colors.error : colors.primary} />}
              title={error ? "Ürünler yüklenemedi" : debounced ? "Sonuç bulunamadı" : "Ürün yok"}
              description={error || (debounced ? "Farklı bir ad, SKU veya barkod deneyin." : "Ürünler web panelinden eklenir.")}
              actionLabel={error ? "Tekrar dene" : undefined}
              onAction={error ? () => fetchPage(1, "reset") : undefined}
            />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  scanWrap: { marginHorizontal: spacing.lg, marginTop: spacing.sm, borderRadius: radius.pill },
  scanBtn: { height: 48, borderRadius: radius.pill },
  resultHead: { flexDirection: "row", alignItems: "center", gap: spacing.xxs, paddingHorizontal: spacing.xxs, paddingBottom: spacing.xs },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.huge },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.lg, borderWidth: 1, minHeight: 76 },
  accent: { position: "absolute", left: 0, top: 14, bottom: 14, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  thumb: { width: 52, height: 52, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  thumbImg: { width: "100%", height: "100%" },
  trailing: { alignItems: "flex-end", gap: 6, maxWidth: "42%", flexShrink: 0 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: spacing.xs, paddingVertical: 3, borderRadius: radius.pill },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
