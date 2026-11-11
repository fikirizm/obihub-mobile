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
import { PackageIcon, SearchIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { PressableScale } from "../../src/components/KPICard";
import { OrderCardSkeleton } from "../../src/components/Skeleton";
import { useDebounce } from "../../src/hooks/useDebounce";
import { Button } from "../../src/ui/Button";
import { StackHeader } from "../../src/ui/Header";
import { SearchField } from "../../src/ui/SearchField";
import type { CatalogProduct } from "../../src/types";

const PER_PAGE = 30;

export default function ProductsScreen() {
  const params = useLocalSearchParams<{ q?: string; t?: string }>();
  const { token } = useAuth();
  const { colors } = useTheme();
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
        <Button
          testID="products-scan"
          label="Barkod okut"
          variant="secondary"
          size="sm"
          icon={<SearchIcon size={16} color={colors.textPrimary} />}
          onPress={() => router.push("/products/scan")}
          style={{ marginHorizontal: spacing.lg, marginTop: spacing.xs }}
        />
      ) : null}
      {loading ? (
        <View style={{ padding: spacing.lg, gap: spacing.sm }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <OrderCardSkeleton key={i} />
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
          ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
          renderItem={({ item }) => {
            const low = item.stock <= 5;
            return (
              <PressableScale
                testID={`product-${item.id}`}
                onPress={() => router.push({ pathname: "/products/[id]", params: { id: item.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, stok ${item.stock}, fiyat ${formatTry(item.price)}`}
                style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
              >
                <View style={[styles.thumb, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}>
                  {item.image_url && /^https?:\/\//i.test(item.image_url) ? (
                    <ExpoImage source={{ uri: item.image_url }} style={styles.thumbImg} contentFit="cover" transition={150} />
                  ) : (
                    <PackageIcon size={20} color={colors.textTertiary} />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={[type.caption, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
                    {[item.sku && `SKU ${item.sku}`, item.barcode].filter(Boolean).join(" · ") || "Kod yok"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Text style={[type.bodyStrong, tabular, { color: colors.textPrimary }]}>{formatTry(item.price)}</Text>
                  <Text style={[type.caption, tabular, { color: low ? colors.error : colors.textSecondary, fontWeight: "600" }]}>
                    {item.stock} adet
                  </Text>
                </View>
              </PressableScale>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<PackageIcon size={30} color={colors.textTertiary} />}
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
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.huge },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.lg, borderWidth: 1, minHeight: 72 },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  thumbImg: { width: "100%", height: "100%" },
});
