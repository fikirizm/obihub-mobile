import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { getParties } from "../../src/api";
import { useDebounce } from "../../src/hooks/useDebounce";
import { usePagedList } from "../../src/hooks/usePagedList";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { formatTry } from "../../src/utils";
import { UserIcon } from "../../src/components/Icons";
import { FadeInDown, SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { StackHeader } from "../../src/ui/Header";
import { HeroCard, ON_HERO } from "../../src/ui/HeroCard";
import { ListBody } from "../../src/ui/ListBody";
import { RowCard } from "../../src/ui/RowCard";
import { SearchField } from "../../src/ui/SearchField";
import type { Party } from "../../src/types";

type Filter = "" | "receivable" | "payable";

type Summary = { total_receivable?: number; total_payable?: number; total_contacts?: number };

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
function SummaryHero({ summary }: { summary: Summary }) {
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
    </HeroCard>
  );
}

export default function CustomersScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search.trim(), 350);
  const [filter, setFilter] = useState<Filter>("");

  const [summary, setSummary] = useState<Summary | null>(null);

  // Sunucu özeti arama ve bakiye süzgecinden SONRA hesaplar. "Toplam" etiketinin doğru kalması için
  // yalnızca süzgeçsiz ve aramasız ilk sayfanın özeti saklanır; sayaç, geç gelen eski yanıtı eler.
  const summarySeq = useRef(0);
  const fetchPage = useCallback(
    async (page: number) => {
      const unfiltered = page === 1 && !debounced && !filter;
      const my = unfiltered ? ++summarySeq.current : 0;
      try {
        const res = await getParties(token as string, { page, search: debounced || undefined, balanceStatus: filter || undefined });
        // Özet ilk sayfayla birlikte gelir; ek istek yapılmaz.
        if (unfiltered && my === summarySeq.current) setSummary(res.summary ?? null);
        return res;
      } catch (e) {
        // Genel toplam yenilenemediyse eski tutarı göstermeyin.
        if (unfiltered && my === summarySeq.current) setSummary(null);
        throw e;
      }
    },
    [token, debounced, filter]
  );
  const list = usePagedList<Party>(token ? fetchPage : null);

  const hasSummary = summary != null && (summary.total_receivable != null || summary.total_payable != null);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="customers-screen">
      <StackHeader title="Cari hesaplar" subtitle={list.loading ? undefined : `${list.total} cari`} />
      {hasSummary && summary ? (
        <SafeAnimatedView entering={FadeInDown.duration(380)}>
          <SummaryHero summary={summary} />
        </SafeAnimatedView>
      ) : null}
      <SearchField testID="customers-search" value={search} onChangeText={setSearch} placeholder="Cari adı, telefon veya e-posta" />
      <ChipRow>
        <Chip label="Tümü" selected={filter === ""} onPress={() => setFilter("")} />
        <Chip label="Alacak" selected={filter === "receivable"} onPress={() => setFilter("receivable")} />
        <Chip label="Borç" selected={filter === "payable"} onPress={() => setFilter("payable")} />
      </ChipRow>
      <ListBody
        state={list}
        icon={<UserIcon size={30} color={colors.emerald} />}
        emptyTitle="Cari yok"
        emptyDescription="Bu süzgece uyan cari hesap bulunmuyor."
        renderItem={(p) => {
          const bal = Number(p.balance || 0);
          const name = partyName(p);
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
              subtitle={p.phone || p.email || (p.source === "orders" ? "Siparişlerden" : undefined)}
              amount={bal === 0 ? "Bakiye yok" : formatTry(Math.abs(bal))}
              amountColor={bal > 0 ? colors.success : bal < 0 ? colors.error : colors.textTertiary}
              meta={bal > 0 ? "Alacağınız var" : bal < 0 ? "Borcunuz var" : undefined}
              onPress={() =>
                router.push({ pathname: "/customers/[id]", params: { id: p.id, name, balance: String(bal), registered: p.source === "registered" ? "1" : "0" } })
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
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  hero: { marginBottom: spacing.sm },
  heroRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  heroCol: { flex: 1, minWidth: 0 },
  heroDivider: { width: 1, alignSelf: "stretch" },
});
