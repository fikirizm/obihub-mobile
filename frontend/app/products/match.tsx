// Dalga 2 / B1 — ürün eşleştirme. Web: ProductDetailPage.js (mağaza ürünü ve Paraşüt ürünü eşleştirme).
// Ürün detayındaki "Eşleştirmeler" satırından açılır (yığın ekranı; sekme ve menü değişmez).
// Parametreler: id (ObiHub ürünü), target (mağaza kimliği ya da "parasut").
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import {
  channelLinkFor,
  getParasutProductsForMatch,
  getProductLinks,
  getSourceProducts,
  linkProductChannel,
  linkProductParasut,
  unlinkProductChannel,
  unlinkProductParasut,
  type ProductLinks,
  type SourceProduct,
} from "../../src/api-urun-stok";
import { recallChannels, recallProduct } from "../../src/catalogCache";
import { getIntegrations } from "../../src/api";
import type { ChannelRef } from "../../src/types";
import { useDebounce } from "../../src/hooks/useDebounce";
import { haptic } from "../../src/haptics";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { AlertIcon, CheckIcon, LinkIcon, PackageIcon, SearchIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { PressableScale } from "../../src/components/KPICard";
import { PlatformLogo } from "../../src/components/PlatformLogo";
import { FadeInDown, SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { Skeleton } from "../../src/components/Skeleton";
import { Button } from "../../src/ui/Button";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { SearchField } from "../../src/ui/SearchField";

const PER_PAGE = 50;
const norm = (s: string) => s.trim().toLocaleLowerCase("tr-TR");

function RowSkeleton() {
  return (
    <View style={styles.skRow}>
      <Skeleton width={22} height={22} borderRadius={11} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="45%" height={11} />
      </View>
    </View>
  );
}

export default function ProductMatchScreen() {
  const params = useLocalSearchParams<{ id: string; target: string }>();
  const productId = String(params.id || "");
  const target = String(params.target || "");
  const isParasut = target === "parasut";
  const { token, user } = useAuth();
  const { colors, shadows } = useTheme();
  const { toast, confirm } = useFeedback();
  const insets = useSafeAreaInsets();
  const allowed = canManage(user, "catalog");

  const cachedProduct = recallProduct(productId);
  // Mağaza önce katalog önbelleğinden; doğrudan açılışta (önbellek boş) entegrasyon listesinden çözülür.
  const [channel, setChannel] = useState<ChannelRef | null>(() => recallChannels().find((c) => c.id === target) || null);
  const [channelResolved, setChannelResolved] = useState(isParasut || Boolean(channel));
  useEffect(() => {
    if (channelResolved || !token) return;
    let alive = true;
    getIntegrations(token)
      .then((list) => {
        const hit = (Array.isArray(list) ? list : []).find((i) => String(i.id) === target);
        if (alive && hit) setChannel({ id: String(hit.id), name: String(hit.name || hit.provider), platform: String(hit.provider || "") });
      })
      .catch(() => {})
      .finally(() => alive && setChannelResolved(true));
    return () => {
      alive = false;
    };
  }, [channelResolved, token, target]);
  const platform = isParasut ? "parasut" : String(channel?.platform || "").toLowerCase();
  const targetName = isParasut ? "Paraşüt" : channel?.name || "Mağaza";

  const [links, setLinks] = useState<ProductLinks | null>(null);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search.trim(), 400);
  const [items, setItems] = useState<SourceProduct[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SourceProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const seq = useRef(0);

  const productBarcode = links?.barcode || String(cachedProduct?.barcode || "");
  const productSku = links?.sku || String(cachedProduct?.sku || "");
  const current = isParasut
    ? links?.parasutProductId
      ? { externalId: links.parasutProductId, otherStore: "", barcode: "", name: links.parasutProductName }
      : null
    : channel
      ? (() => {
          const l = channelLinkFor(links, channel);
          return l ? { ...l, name: "" } : null;
        })()
      : null;

  const loadLinks = useCallback(async () => {
    if (!token || !productId) return;
    try {
      setLinks(await getProductLinks(token, productId));
    } catch {
      // Ürün belgesi okunamazsa eşleştirme yine yapılabilir; mevcut eşleşme gösterilmez.
    }
  }, [token, productId]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const fetchPage = useCallback(
    async (nextPage: number) => {
      if (!token || (!isParasut && !channel)) return;
      const id = ++seq.current;
      if (nextPage === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = isParasut
          ? { items: await getParasutProductsForMatch(token, debounced), hasMore: false }
          : await getSourceProducts(token, channel!.id, debounced, nextPage, PER_PAGE);
        if (id !== seq.current) return;
        setItems((prev) => {
          if (nextPage === 1) return res.items;
          const seen = new Set(prev.map((x) => x.externalId));
          return [...prev, ...res.items.filter((x) => !seen.has(x.externalId))];
        });
        setHasMore(res.hasMore);
        setPage(nextPage);
        setError(null);
      } catch (e: any) {
        if (id !== seq.current) return;
        setError(e?.message || `${targetName} ürünleri alınamadı.`);
        if (nextPage === 1) setItems([]);
      } finally {
        if (id === seq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [token, isParasut, channel, debounced, targetName]
  );

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  // Barkodu ya da SKU'su ObiHub ürünüyle aynı olanlar başa alınır.
  const sorted = useMemo(() => {
    const bc = norm(productBarcode);
    const sk = norm(productSku);
    const score = (x: SourceProduct) => (bc && norm(x.barcode) === bc ? 2 : 0) + (sk && norm(x.sku) === sk ? 1 : 0);
    return [...items].map((x, i) => ({ x, i, s: score(x) })).sort((a, b) => b.s - a.s || a.i - b.i).map((r) => r.x);
  }, [items, productBarcode, productSku]);

  const save = async () => {
    if (!token || !selected || saving) return;
    const differentBarcode =
      platform === "trendyol" && productBarcode && selected.barcode && norm(selected.barcode) !== norm(productBarcode);
    if (differentBarcode) {
      const ok = await confirm({
        title: "Barkodlar farklı",
        message: `ObiHub barkodu ${productBarcode}, Trendyol barkodu ${selected.barcode}. Stok ve fiyat Trendyol'a bu ürünün Trendyol barkoduyla gönderilir. Eşleştirilsin mi?`,
        confirmLabel: "Eşleştir",
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      if (isParasut) await linkProductParasut(token, productId, selected.externalId, selected.name);
      else
        await linkProductChannel(token, productId, {
          provider: platform,
          externalId: selected.externalId,
          integrationId: channel!.id,
          barcode: selected.barcode,
        });
      toast(`${targetName} eşleştirmesi kaydedildi.`, "success");
      router.back();
    } catch (e: any) {
      toast(e?.message || "Eşleştirme kaydedilemedi.", "error");
    } finally {
      setSaving(false);
    }
  };

  const unlink = async () => {
    if (!token || unlinking) return;
    const ok = await confirm({
      title: "Eşleşme kaldırılsın mı?",
      message: isParasut
        ? "Ürün Paraşüt'teki ürünle bağını kaybeder; faturalar ve stok bu ürün için Paraşüt'e gitmez."
        : `Ürünün ${targetName} bağlantısı kalkar; stok ve fiyat bu mağazaya gönderilmez.`,
      confirmLabel: "Eşleşmeyi kaldır",
      destructive: true,
    });
    if (!ok) return;
    setUnlinking(true);
    try {
      if (isParasut) await unlinkProductParasut(token, productId);
      else await unlinkProductChannel(token, productId, platform);
      toast("Eşleşme kaldırıldı.", "success");
      setSelected(null);
      await loadLinks();
    } catch (e: any) {
      toast(e?.message || "Eşleşme kaldırılamadı.", "error");
    } finally {
      setUnlinking(false);
    }
  };

  if (allowed && !channelResolved) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Eşleştir" />
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      </View>
    );
  }

  if (!allowed || (!isParasut && !channel)) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Eşleştir" />
        <EmptyState
          icon={<LinkIcon size={30} color={colors.textTertiary} />}
          title={allowed ? "Mağaza bulunamadı" : "Yetkiniz yok"}
          description={allowed ? "Ürün detayına dönüp yeniden açın." : "Ürün eşleştirmek için katalog yönetme izni gerekir."}
        />
      </View>
    );
  }

  const header = (
    <View>
      <SafeAnimatedView entering={FadeInDown.duration(360)}>
        <View style={[styles.productCard, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <View style={[styles.productIcon, { backgroundColor: colors.primarySoft }]}>
            <PackageIcon size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.caption, { color: colors.textTertiary }]}>ObiHub ürünü</Text>
            <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={2}>
              {links?.name || cachedProduct?.name || "Ürün"}
            </Text>
            <Text style={[type.caption, tabular, { color: colors.textSecondary, marginTop: 2 }]} numberOfLines={1}>
              {[productSku && `SKU ${productSku}`, productBarcode && `Barkod ${productBarcode}`].filter(Boolean).join(" · ") || "Kod yok"}
            </Text>
          </View>
        </View>
      </SafeAnimatedView>

      {current ? (
        <SafeAnimatedView entering={FadeInDown.delay(60).duration(360)}>
          <View
            testID="match-current"
            style={[styles.currentCard, { backgroundColor: current.otherStore ? colors.warningBg : colors.successBg, borderColor: colors.borderSubtle }]}
          >
            <View style={styles.currentHead}>
              {current.otherStore ? <AlertIcon size={16} color={colors.amber} /> : <CheckIcon size={16} color={colors.success} />}
              <Text style={[type.callout, { color: colors.textPrimary, fontWeight: "600", flex: 1 }]}>
                {current.otherStore ? `Başka bir ${targetName === "Mağaza" ? "mağaza" : "mağazayla"} eşleşik` : "Şu an eşleşik"}
              </Text>
            </View>
            <Text style={[type.caption, tabular, { color: colors.textSecondary }]} numberOfLines={2}>
              {[current.name || null, `Kimlik ${current.externalId}`, current.barcode ? `Barkod ${current.barcode}` : null].filter(Boolean).join(" · ")}
            </Text>
            {current.otherStore ? (
              <Text style={[type.caption, { color: colors.textSecondary }]}>Yeni seçim bu bağlantının yerini alır.</Text>
            ) : null}
            <Button
              testID="match-unlink"
              size="sm"
              variant="secondary"
              label="Eşleşmeyi kaldır"
              busy={unlinking}
              onPress={unlink}
              style={{ alignSelf: "flex-start" }}
            />
          </View>
        </SafeAnimatedView>
      ) : null}

      <Text style={[type.callout, styles.sectionLabel, { color: colors.textSecondary }]}>
        {isParasut ? "Paraşüt ürünleri" : `${targetName} ürünleri`}
      </Text>
      <SearchField testID="match-search" value={search} onChangeText={setSearch} placeholder="Ad, SKU veya barkod ara" />
      {(productBarcode || productSku) && !search ? (
        <ChipRow>
          {productBarcode ? <Chip testID="match-suggest-barcode" label={`Barkod: ${productBarcode}`} onPress={() => setSearch(productBarcode)} /> : null}
          {productSku ? <Chip testID="match-suggest-sku" label={`SKU: ${productSku}`} onPress={() => setSearch(productSku)} /> : null}
        </ChipRow>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="match-screen">
      <StackHeader
        title="Eşleştir"
        subtitle={targetName}
        right={isParasut ? undefined : <PlatformLogo provider={platform} size="sm" />}
      />
      <FlatList
        data={loading ? [] : sorted}
        keyExtractor={(x) => x.externalId}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (hasMore && !loadingMore && !loading) fetchPage(page + 1);
        }}
        renderItem={({ item, index }) => {
          const isSel = selected?.externalId === item.externalId;
          const isCurrent = current?.externalId === item.externalId && !current?.otherStore;
          const sameBarcode = Boolean(productBarcode && item.barcode && norm(item.barcode) === norm(productBarcode));
          const sameSku = Boolean(productSku && item.sku && norm(item.sku) === norm(productSku));
          return (
            <PressableScale
              testID={`match-item-${item.externalId}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSel }}
              accessibilityLabel={`${item.name}${sameBarcode ? ", barkod aynı" : ""}`}
              onPress={() => {
                haptic.select();
                setSelected(isSel ? null : item);
              }}
              style={[
                styles.row,
                { backgroundColor: colors.surface, borderColor: isSel ? colors.primary : colors.borderSubtle },
                isSel && { backgroundColor: colors.primarySoft },
                index === 0 && { marginTop: spacing.sm },
              ]}
            >
              <View style={[styles.radio, { borderColor: isSel ? colors.primary : colors.textTertiary }]}>
                {isSel ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={2}>
                  {item.name || `#${item.externalId}`}
                </Text>
                <Text style={[type.caption, tabular, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
                  {[item.sku && `SKU ${item.sku}`, item.barcode && `Barkod ${item.barcode}`].filter(Boolean).join(" · ") || `Kimlik ${item.externalId}`}
                </Text>
                {sameBarcode || sameSku || isCurrent ? (
                  <View style={styles.tags}>
                    {isCurrent ? (
                      <View style={[styles.tag, { backgroundColor: colors.successBg }]}>
                        <Text style={[type.caption, { color: colors.success, fontWeight: "600" }]}>Şu anki</Text>
                      </View>
                    ) : null}
                    {sameBarcode ? (
                      <View style={[styles.tag, { backgroundColor: colors.infoBg }]}>
                        <Text style={[type.caption, { color: colors.info, fontWeight: "600" }]}>Barkod aynı</Text>
                      </View>
                    ) : sameSku ? (
                      <View style={[styles.tag, { backgroundColor: colors.infoBg }]}>
                        <Text style={[type.caption, { color: colors.info, fontWeight: "600" }]}>SKU aynı</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </PressableScale>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View style={[styles.skCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]} accessibilityLabel="Ürünler yükleniyor">
              {[0, 1, 2, 3, 4].map((i) => (
                <RowSkeleton key={i} />
              ))}
            </View>
          ) : error ? (
            <EmptyState
              icon={<AlertIcon size={30} color={colors.error} />}
              title="Ürünler alınamadı"
              description={error}
              actionLabel="Tekrar dene"
              onAction={() => fetchPage(1)}
            />
          ) : (
            <EmptyState
              icon={<SearchIcon size={30} color={colors.primary} />}
              title={debounced ? "Sonuç yok" : "Ürün bulunamadı"}
              description={debounced ? "Başka bir ad, SKU ya da barkodla arayın." : `${targetName} tarafında listelenecek ürün yok.`}
            />
          )
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : null}
      />
      <View
        style={[
          styles.bar,
          shadows.md,
          { backgroundColor: colors.surface, borderTopColor: colors.borderSubtle, paddingBottom: Math.max(insets.bottom, spacing.md) },
        ]}
      >
        <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
          {selected ? `Seçilen: ${selected.name || selected.externalId}` : "Listeden bir ürün seçin"}
        </Text>
        <Button
          testID="match-save"
          label={current && !current.otherStore ? "Eşleşmeyi değiştir" : "Eşleştir"}
          icon={<LinkIcon size={18} color="#FFFFFF" />}
          busy={saving}
          disabled={!selected || selected.externalId === (current && !current.otherStore ? current.externalId : "")}
          onPress={save}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  productCard: { flexDirection: "row", gap: spacing.sm, alignItems: "center", marginHorizontal: spacing.lg, marginTop: spacing.xs, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  productIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  currentCard: { marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: spacing.xs },
  currentHead: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  sectionLabel: { fontWeight: "600", marginHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.xs },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", marginHorizontal: spacing.lg, marginBottom: spacing.xs, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 1 },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  tags: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  skCard: { marginHorizontal: spacing.lg, marginTop: spacing.sm, borderRadius: radius.lg, borderWidth: 1 },
  skRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center", padding: spacing.md },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth },
});
