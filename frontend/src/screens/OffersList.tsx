import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { FadeInDown } from "react-native-reanimated";
import { useAuth } from "../auth/AuthProvider";
import { canManage } from "../auth/permissions";
import { haptic } from "../haptics";
import { SummaryHero } from "../ui/SummaryHero";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, type } from "../theme/tokens";
import { getSalesOffers } from "../api";
import { formatDate, formatMoney, type StatusKind } from "../utils";
import { AlertIcon, FileTextIcon } from "../components/Icons";
import { InvoiceCardSkeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { NetworkErrorBanner } from "../components/NetworkErrorBanner";
import { SafeAnimatedView } from "../components/SafeAnimatedView";
import { StatusBadge } from "../components/StatusBadge";
import { saveCache, loadCache } from "../offlineCache";
import { useFocusLoad } from "../hooks/useFocusLoad";
import { useDebounce } from "../hooks/useDebounce";
import { Chip, ChipRow } from "../ui/Chip";
import { IconTile } from "../ui/ListRow";
import { RowCard } from "../ui/RowCard";
import { SearchField } from "../ui/SearchField";
import type { SalesOffer } from "../types";

const STATUS: Record<string, { kind: StatusKind; label: string }> = {
  accepted: { kind: "success", label: "Onaylı" },
  approved: { kind: "success", label: "Onaylı" },
  draft: { kind: "neutral", label: "Taslak" },
  waiting: { kind: "warning", label: "Beklemede" },
  sent: { kind: "info", label: "Gönderildi" },
  cancelled: { kind: "error", label: "İptal" },
  rejected: { kind: "error", label: "Reddedildi" },
};

const FILTERS = [
  { key: "all", label: "Tümü" },
  { key: "waiting", label: "Beklemede" },
  { key: "accepted", label: "Onaylı" },
  { key: "sent", label: "Gönderildi" },
  { key: "draft", label: "Taslak" },
  { key: "rejected", label: "Reddedildi" },
];

function offerStatus(status?: string) {
  return STATUS[status || ""] ?? { kind: "neutral" as StatusKind, label: status || "—" };
}

// Paraşüt durum çeşitlerini süzgeç gruplarına indirger.
function normalizeStatus(s?: string) {
  if (!s) return "other";
  if (s === "accepted" || s === "approved") return "accepted";
  return s;
}

function offerTotal(o: SalesOffer) {
  return Number(o.gross_total || o.net_total || 0);
}

function offerCurrency(o: SalesOffer) {
  return String(o.currency || "TRY").toUpperCase().replace("TRL", "TRY");
}

function readOffers(data: any): SalesOffer[] {
  return Array.isArray(data?.offers) ? data.offers : Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
}

function offerTime(o: SalesOffer) {
  const t = o.issue_date ? new Date(o.issue_date).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

// Yeniden eskiye: önce düzenleme tarihi, eşitse kayıt numarası.
function newestFirst(a: SalesOffer, b: SalesOffer) {
  return offerTime(b) - offerTime(a) || (Number(b.id) || 0) - (Number(a.id) || 0);
}

// Bir sayfadaki en yeni teklif (düzenleme tarihi, eşitse kayıt numarası).
function newestOf(rows: SalesOffer[]) {
  return rows.reduce<SalesOffer | null>((best, o) => (best && newestFirst(best, o) <= 0 ? best : o), null);
}

// Sunucu Paraşüt'ten sayfa başına en çok 25 teklif verir ve sıralama göndermez.
const PER_PAGE = 25;
const MAX_OFFERS = 200;

// Bütün sayfaları (üst sınıra kadar) çeker. Toplam üst sınırı aşıyorsa en yeni kayıtların bulunduğu uçtaki sayfalar alınır.
async function fetchAllOffers(token: string): Promise<{ offers: SalesOffer[]; total: number }> {
  const first = await getSalesOffers(token, { page: 1, perPage: PER_PAGE });
  const firstRows = readOffers(first);
  const total = Math.max(Number(first?.total ?? 0) || 0, firstRows.length);
  const pageCount = Math.ceil(total / PER_PAGE);
  const maxPages = Math.floor(MAX_OFFERS / PER_PAGE);
  let rows = [...firstRows];
  let wanted: number[] = [];
  if (pageCount > 1 && firstRows.length > 0) {
    if (pageCount <= maxPages) {
      wanted = Array.from({ length: pageCount - 1 }, (_, i) => i + 2);
    } else {
      // Sıralama yönü tek sayfanın içinden güvenilir biçimde anlaşılamaz (geriye tarihli kayıtlar yanıltır);
      // ilk ve son sayfanın en yeni kayıtları karşılaştırılır. Son sayfa daha yeniyse en yeni teklifler sondadır.
      const lastRows = readOffers(await getSalesOffers(token, { page: pageCount, perPage: PER_PAGE }));
      const newestInFirst = newestOf(firstRows);
      const newestInLast = newestOf(lastRows);
      const ascending = !!newestInFirst && !!newestInLast && newestFirst(newestInFirst, newestInLast) > 0;
      if (ascending) {
        rows = [...lastRows];
        wanted = Array.from({ length: maxPages - 1 }, (_, i) => pageCount - maxPages + 1 + i);
      } else {
        wanted = Array.from({ length: maxPages - 1 }, (_, i) => i + 2);
      }
    }
  }
  // Dörderli gruplar hâlinde çekilir; bir sayfa alınamazsa eksik liste göstermek yerine yükleme başarısız sayılır.
  for (let i = 0; i < wanted.length; i += 4) {
    const batch = await Promise.all(wanted.slice(i, i + 4).map((p) => getSalesOffers(token, { page: p, perPage: PER_PAGE })));
    batch.forEach((b) => rows.push(...readOffers(b)));
  }
  const seen = new Set<string>();
  const offers = rows.filter((o) => {
    const id = String(o.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  offers.sort(newestFirst);
  return { offers, total: Math.max(total, offers.length) };
}

// Teklifler ekranına gömülen Paraşüt teklif listesi.
// readOnly: web TekliflerPage'teki gibi Paraşüt teklifleri salt okuma sekmesidir; yeni teklif ObiHub'da (yerel) açılır.
export function OffersList({ readOnly = false }: { readOnly?: boolean } = {}) {
  const { token, user } = useAuth();
  const canCreate = !readOnly && canManage(user, "billing");
  const { colors } = useTheme();
  const [list, setList] = useState<SalesOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [totalOnServer, setTotalOnServer] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Uçuştaki yükleme paylaşılır: açılışta odak ve oturum tetikleyicileri aynı anda çalışsa da sayfalar bir kez çekilir.
  const inflight = useRef<{ token: string; promise: Promise<void> } | null>(null);

  const runLoad = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (!silent) setLoading(true);
      if (!silent) {
        const cached = await loadCache<SalesOffer[]>("offers_list");
        if (cached && cached.length > 0) {
          setList(cached);
          setIsOffline(true);
          setLoading(false);
        }
      }
      try {
        const { offers, total } = await fetchAllOffers(token);
        setList(offers);
        setTotalOnServer(total);
        setLoadError(null);
        setIsOffline(false);
        await saveCache("offers_list", offers);
      } catch (e: any) {
        // Gösterilecek kayıt yoksa ekran "teklif yok" yerine bu hatayı gösterir.
        // Sunucu hatalarında (5xx) ham hata iletisi yerine sabit metin gösterilir.
        const status = Number(e?.status) || 0;
        setLoadError(
          status >= 500
            ? "Teklifler şu anda alınamıyor. Lütfen kısa bir süre sonra tekrar deneyin."
            : e?.message || "Teklifler yüklenemedi."
        );
        if (list.length === 0 && !silent) {
          const cached = await loadCache<SalesOffer[]>("offers_list");
          if (cached) {
            setList(cached);
            setIsOffline(true);
          }
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token]
  );

  const load = useCallback(
    (silent = false): Promise<void> => {
      if (!token) return Promise.resolve();
      if (inflight.current && inflight.current.token === token) return inflight.current.promise;
      const entry = { token, promise: Promise.resolve() };
      entry.promise = runLoad(silent).finally(() => {
        if (inflight.current === entry) inflight.current = null;
      });
      inflight.current = entry;
      return entry.promise;
    },
    [token, runLoad]
  );

  const debouncedSearch = useDebounce(search, 300);
  useFocusLoad(load, { hasData: list.length > 0 });
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Satır giriş animasyonu yalnızca ilk yüklemede oynar; sanallaştırma ya da süzgeç değişimiyle
  // yeniden bağlanan satırlar beklemeden görünür.
  const animateRows = useRef(true);
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      animateRows.current = false;
    }, 700);
    return () => clearTimeout(t);
  }, [loading]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return list.filter((o) => {
      if (statusFilter !== "all" && normalizeStatus(o.status) !== statusFilter) return false;
      if (!q) return true;
      return (
        String(o.description || "").toLowerCase().includes(q) ||
        String(o.contact_name || "").toLowerCase().includes(q)
      );
    });
  }, [list, debouncedSearch, statusFilter]);

  const totals = useMemo(() => {
    // Farklı para birimleri tek toplamda birleştirilmez.
    const sums: Record<string, number> = {};
    filtered.forEach((o) => {
      const cur = offerCurrency(o);
      sums[cur] = (sums[cur] || 0) + offerTotal(o);
    });
    const currencies = Object.keys(sums);
    const currency = currencies.length === 0 || sums.TRY !== undefined ? "TRY" : currencies[0];
    return {
      total: sums[currency] || 0,
      currency,
      label: currencies.length > 1 ? `Toplam (${currency === "TRY" ? "TL" : currency})` : "Toplam",
      count: filtered.length,
    };
  }, [filtered]);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        haptic.select();
        setRefreshing(true);
        load(true);
      }}
      tintColor={colors.primary}
    />
  );
  const query = search.trim();

  // İstek başarısız ve gösterilecek kayıt yok: sıfırlı özet ve "teklif yok" yerine hata gösterilir.
  if (!loading && loadError && list.length === 0) {
    return (
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.list} refreshControl={refreshControl}>
        <EmptyState
          icon={<AlertIcon size={30} color={colors.error} />}
          title="Teklifler yüklenemedi"
          description={loadError}
          actionLabel="Tekrar dene"
          onAction={() => load()}
        />
      </ScrollView>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <NetworkErrorBanner visible={isOffline} offline />

      {!isOffline && totalOnServer > list.length ? (
        <View style={[styles.notice, { backgroundColor: colors.infoBg }]}>
          <AlertIcon size={16} color={colors.info} />
          <Text style={[type.footnote, styles.noticeText, { color: colors.textSecondary }]}>
            En yeni {list.length} teklif gösteriliyor (toplam {totalOnServer}). Toplamlar yalnızca bu kayıtları içerir.
          </Text>
        </View>
      ) : null}

      <SafeAnimatedView entering={FadeInDown.duration(380)}>
        <SummaryHero
          testID="offers-summary"
          tone="violet"
          label={totals.label}
          value={formatMoney(totals.total, totals.currency)}
          amount={totals.total}
          format={(n) => formatMoney(n, totals.currency)}
          facts={[{ label: "Teklif", value: String(totals.count) }]}
          style={styles.hero}
        />
      </SafeAnimatedView>

      <SafeAnimatedView entering={FadeInDown.delay(70).duration(380)}>
        <SearchField value={search} onChangeText={setSearch} placeholder="Teklif başlığı veya müşteri ara" />
      </SafeAnimatedView>

      <SafeAnimatedView entering={FadeInDown.delay(140).duration(380)}>
        <ChipRow>
          {FILTERS.map((f) => (
            <Chip key={f.key} label={f.label} selected={statusFilter === f.key} onPress={() => setStatusFilter(f.key)} />
          ))}
        </ChipRow>
      </SafeAnimatedView>

      {loading ? (
        <ScrollView contentContainerStyle={styles.list} refreshControl={refreshControl}>
          {[0, 1, 2, 3, 4].map((i) => (
            <InvoiceCardSkeleton key={i} />
          ))}
        </ScrollView>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          keyboardDismissMode="on-drag"
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews
          refreshControl={refreshControl}
          ListEmptyComponent={
            <EmptyState
              icon={<FileTextIcon size={30} color={colors.violet} />}
              title={query ? "Sonuç bulunamadı" : "Henüz teklif yok"}
              description={
                query ? `"${query}" için eşleşen teklif bulunamadı.` : "Paraşüt'te oluşturulmuş teklif bulunmuyor."
              }
              actionLabel={query ? "Aramayı temizle" : canCreate ? "Yeni teklif" : undefined}
              onAction={query ? () => setSearch("") : canCreate ? () => router.push("/offers/new") : undefined}
            />
          }
          renderItem={({ item, index }) => {
            const st = offerStatus(item.status);
            // Şerit durum rengini taşır; durumu belirsiz ya da taslak tekliflerde alanın mor tonu kullanılır.
            const accent =
              st.kind === "success"
                ? colors.success
                : st.kind === "warning"
                  ? colors.warning
                  : st.kind === "error"
                    ? colors.error
                    : st.kind === "info"
                      ? colors.info
                      : colors.violet;
            const row = (
              <RowCard
                accent={accent}
                leading={
                  <IconTile tint={colors.violetSoft}>
                    <FileTextIcon size={18} color={colors.violet} />
                  </IconTile>
                }
                title={item.description || `Teklif #${item.id}`}
                subtitle={item.contact_name || "—"}
                meta={item.issue_date ? formatDate(item.issue_date) : undefined}
                amount={formatMoney(offerTotal(item), item.currency)}
                badge={<StatusBadge label={st.label} kind={st.kind} size="sm" />}
                onPress={() => router.push({ pathname: "/offers/[id]", params: { id: item.id } })}
              />
            );
            // Sarmalayıcı her satırda aynı kalır (tip değişimi yeniden bağlamaya yol açmasın);
            // yalnızca ilk yüklemede ilk ekrandaki satırlar sırayla kayarak gelir.
            return (
              <SafeAnimatedView entering={animateRows.current && index < 8 ? FadeInDown.delay(index * 35).duration(320) : undefined}>
                {row}
              </SafeAnimatedView>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  wrap: { flex: 1 },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  noticeText: { flex: 1, minWidth: 0 },
  stats: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, gap: spacing.xs, paddingBottom: spacing.huge },
});
