import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { balanceListHint, partyRouteParams } from "../../src/cari-ui";
import { getPartiesCompat } from "../../src/api-gider";
import { useDebounce } from "../../src/hooks/useDebounce";
import { usePagedList } from "../../src/hooks/usePagedList";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { formatMoney, formatTry } from "../../src/utils";
import { PlusIcon, UserIcon } from "../../src/components/Icons";
import { FadeInDown, SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { Button } from "../../src/ui/Button";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { StackHeader } from "../../src/ui/Header";
import { HeroCard, ON_HERO } from "../../src/ui/HeroCard";
import { ListBody } from "../../src/ui/ListBody";
import { RowCard } from "../../src/ui/RowCard";
import { SearchField } from "../../src/ui/SearchField";
import type { Party, PartyView } from "../../src/types";

type Filter = "" | "receivable" | "payable";

type Summary = { total_receivable?: number; total_payable?: number; total_contacts?: number; by_currency?: Record<string, { total_receivable?: number; total_payable?: number }> };

function partyName(p: Party) {
  return p.company_name || p.name || p.full_name || "Cari";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toLocaleUpperCase("tr-TR") || "C";
}

// Baş harfli yuvarlak: rengi bakiyenin yönünü gösterir.
function Avatar({ name, bg, fg }: { name: string; bg: string; fg: string }) {
  return (
    <View style={[styles.avatar, { backgroundColor: bg }]}>
      <Text style={[type.callout, { color: fg, fontWeight: "700" }]} numberOfLines={1}>
        {initials(name)}
      </Text>
    </View>
  );
}

// Listenin üstündeki özet: toplam alacak ve toplam borç (liste yanıtındaki özetten).
function isForeign(currency?: string) {
  const cur = String(currency || "TRY").toUpperCase();
  return cur !== "TRY" && cur !== "TRL";
}

// Sunucu özeti dövizli bakiye bilgisini vermez; "unknown" bütün cariler henüz görülmedi demektir.
type ForeignState = "yes" | "no" | "unknown";

function SummaryHero({ summary, foreign }: { summary: Summary; foreign: ForeignState }) {
  // Aşama 4 P5a: tekil toplamlar yalnız TRY; diğer birimler `by_currency`'de ayrı gelir (toplanmaz).
  const others = Object.entries(summary.by_currency || {}).filter(
    ([c, v]) => c !== "TRY" && c !== "TRL" && (Number(v?.total_receivable || 0) !== 0 || Number(v?.total_payable || 0) !== 0)
  );
  return (
    <HeroCard tone="emerald" style={styles.hero}>
      {summary.total_contacts != null ? (
        <Text style={[type.caption, { color: ON_HERO.soft, marginBottom: spacing.xs }]} numberOfLines={1}>
          {summary.total_contacts} cari hesap
        </Text>
      ) : null}
      <View style={styles.heroRow}>
        <View style={styles.heroCol}>
          <Text style={[type.caption, { color: ON_HERO.soft }]} numberOfLines={1}>
            Toplam alacak
          </Text>
          <Text style={[type.title, tabular, { color: ON_HERO.live, marginTop: 2 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {formatTry(Number(summary.total_receivable || 0))}
          </Text>
        </View>
        <View style={[styles.heroDivider, { backgroundColor: ON_HERO.faint }]} />
        <View style={styles.heroCol}>
          <Text style={[type.caption, { color: ON_HERO.soft }]} numberOfLines={1}>
            Toplam borç
          </Text>
          <Text style={[type.title, tabular, { color: ON_HERO.text, marginTop: 2 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {formatTry(Number(summary.total_payable || 0))}
          </Text>
        </View>
      </View>
      {others.length > 0 ? (
        <View style={{ marginTop: spacing.sm, gap: 2 }} testID="customers-summary-other-currencies">
          {others.map(([c, v]) => (
            <Text key={c} style={[type.caption, tabular, { color: ON_HERO.text }]} numberOfLines={1}>
              {`${c}: alacak ${formatMoney(Number(v?.total_receivable || 0), c)} · borç ${formatMoney(Number(v?.total_payable || 0), c)}`}
            </Text>
          ))}
          <Text style={[type.caption, { color: ON_HERO.soft }]}>Toplamlar yalnız TL bakiyeleri kapsar; dövizler ayrı gösterilir.</Text>
        </View>
      ) : summary.by_currency ? null : foreign !== "no" ? (
        <Text style={[type.caption, { color: ON_HERO.soft, marginTop: spacing.sm }]}>
          {foreign === "yes"
            ? "Toplamlara dövizli carilerin bakiyeleri çevrilmeden dahildir."
            : "Dövizli cari bulunuyorsa bakiyesi toplamlara çevrilmeden dahildir."}
        </Text>
      ) : null}
    </HeroCard>
  );
}

export default function CustomersScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const mayAdd = canManage(user, "customers");
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search.trim(), 350);
  const [filter, setFilter] = useState<Filter>("");
  // C5: rol süzgeci (web CustomersPage): müşteri / tedarikçi.
  const [role, setRole] = useState<"" | "customer" | "supplier">("");

  const [summary, setSummary] = useState<Summary | null>(null);

  // Sunucu özeti arama ve bakiye süzgecinden SONRA hesaplar. "Toplam" etiketinin doğru kalması için
  // yalnızca süzgeçsiz ve aramasız ilk sayfanın özeti saklanır; sayaç, geç gelen eski yanıtı eler.
  const summarySeq = useRef(0);
  // Eldeki satırların süzgeçsiz ve aramasız sorgudan gelip gelmediği (dövizli cari notu için).
  const itemsUnfiltered = useRef(false);
  const fetchPage = useCallback(
    async (page: number) => {
      const unfiltered = page === 1 && !debounced && !filter && !role;
      const my = unfiltered ? ++summarySeq.current : 0;
      try {
        // Web CustomersPage.js gibi önce okuma modeli, 404'te eski /customers ucu (src/api-gider.ts).
        const res = await getPartiesCompat(token as string, { page, search: debounced || undefined, balanceStatus: filter || undefined, role: role || undefined });
        // Özet ilk sayfayla birlikte gelir; ek istek yapılmaz.
        if (unfiltered && my === summarySeq.current) setSummary(res.summary ?? null);
        if (page === 1) itemsUnfiltered.current = unfiltered;
        return res;
      } catch (e) {
        // Genel toplam yenilenemediyse eski tutarı göstermeyin.
        if (unfiltered && my === summarySeq.current) setSummary(null);
        throw e;
      }
    },
    [token, debounced, filter, role]
  );
  const list = usePagedList<PartyView>(token ? fetchPage : null);

  // Detayda tahsilat alınıp geri dönüldüğünde bakiyeler ve toplamlar tazelenir (ilk açılışı liste kendisi yükler).
  // Yüklenmiş sayfalar yerinde yenilenir; liste ilk sayfaya düşmez, kaydırma konumu korunur.
  const refreshRef = useRef(list.refreshLoaded);
  refreshRef.current = list.refreshLoaded;
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) refreshRef.current();
      focusedOnce.current = true;
    }, [])
  );

  // Özet bütün carileri kapsar, liste ise sayfa sayfa gelir. Dövizli cari yalnızca yüklü satırlardan görülebildiği için
  // not üç durumludur: görüldü (kesin), bütün cariler yüklendi ve yok (gizli), henüz bilinmiyor (koşullu not).
  const [foreign, setForeign] = useState<ForeignState>("unknown");
  const { items, hasMore, loading } = list;
  useEffect(() => {
    if (loading) return;
    const seen = items.some((p) => p.balanceAvailable && isForeign(p.currency) && Number(p.balance || 0) !== 0);
    if (itemsUnfiltered.current) setForeign(seen ? "yes" : hasMore ? "unknown" : "no");
    else if (seen) setForeign("yes");
  }, [items, hasMore, loading]);
  const hasSummary = summary != null && (summary.total_receivable != null || summary.total_payable != null);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="customers-screen">
      <StackHeader title="Cari hesaplar" subtitle={list.loading ? undefined : `${list.total} cari`} />
      {hasSummary && summary ? (
        <SafeAnimatedView entering={FadeInDown.duration(380)}>
          <SummaryHero summary={summary} foreign={foreign} />
        </SafeAnimatedView>
      ) : null}
      {mayAdd ? (
        <View style={styles.actions}>
          <Button
            testID="customers-new"
            label="Yeni cari ekle"
            size="sm"
            icon={<PlusIcon size={16} color={ON_HERO.text} />}
            onPress={() => router.push("/customers/new")}
          />
        </View>
      ) : null}
      <SearchField testID="customers-search" value={search} onChangeText={setSearch} placeholder="Cari adı, telefon veya e-posta" />
      <ChipRow>
        <Chip label="Tümü" selected={filter === ""} onPress={() => setFilter("")} />
        <Chip label="Alacak" selected={filter === "receivable"} onPress={() => setFilter("receivable")} />
        <Chip label="Borç" selected={filter === "payable"} onPress={() => setFilter("payable")} />
      </ChipRow>
      <ChipRow>
        <Chip testID="customers-role-all" label="Tüm cariler" selected={role === ""} onPress={() => setRole("")} />
        <Chip testID="customers-role-customer" label="Müşteriler" selected={role === "customer"} onPress={() => setRole("customer")} />
        <Chip testID="customers-role-supplier" label="Tedarikçiler" selected={role === "supplier"} onPress={() => setRole("supplier")} />
      </ChipRow>
      <ListBody
        state={list}
        icon={<UserIcon size={30} color={colors.emerald} />}
        emptyTitle={debounced || filter || role ? "Cari yok" : "Henüz cari yok"}
        emptyDescription={debounced || filter || role ? "Bu süzgece uyan cari hesap bulunmuyor." : "Müşteri ve tedarikçilerinizi ekleyin; fatura, tahsilat ve ekstre buradan izlenir."}
        emptyAction={mayAdd && !debounced && !filter && !role ? { label: "Cari ekle", onPress: () => router.push("/customers/new") } : null}
        renderItem={(p) => {
          const bal = p.balanceAvailable ? Number(p.balance || 0) : 0;
          const name = partyName(p);
          // Okuma modelindeki eski cari satırı bakiyesiz gelir; bakiye detayda eski ekstreden okunur (web ile aynı).
          const balanceText = !p.balanceAvailable ? "Bakiye detayda" : bal === 0 ? "Bakiye yok" : formatMoney(Math.abs(bal), p.currency);
          return (
            <RowCard
              testID={`party-${p.id}`}
              accent={bal > 0 ? colors.success : bal < 0 ? colors.error : undefined}
              leading={
                <Avatar
                  name={name}
                  bg={bal > 0 ? colors.successBg : bal < 0 ? colors.errorBg : colors.surfaceMuted}
                  fg={bal > 0 ? colors.success : bal < 0 ? colors.error : colors.textSecondary}
                />
              }
              title={name}
              subtitle={p.phone || p.email || (p.source === "orders" ? "Siparişlerden" : p.source === "obihub" ? "ObiHub defteri" : undefined)}
              amount={balanceText}
              amountColor={bal > 0 ? colors.success : bal < 0 ? colors.error : colors.textTertiary}
              meta={balanceListHint(bal)}
              onPress={() =>
                router.push({ pathname: "/customers/[id]", params: partyRouteParams(p) })
              }
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  actions: { marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  hero: { marginBottom: spacing.sm },
  heroRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  heroCol: { flex: 1, minWidth: 0 },
  heroDivider: { width: 1, alignSelf: "stretch" },
});
