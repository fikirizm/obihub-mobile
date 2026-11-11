import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { getParties } from "../../src/api";
import { useDebounce } from "../../src/hooks/useDebounce";
import { usePagedList } from "../../src/hooks/usePagedList";
import { useTheme } from "../../src/theme/ThemeProvider";
import { formatTry } from "../../src/utils";
import { UserIcon } from "../../src/components/Icons";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { StackHeader } from "../../src/ui/Header";
import { ListBody } from "../../src/ui/ListBody";
import { RowCard } from "../../src/ui/RowCard";
import { SearchField } from "../../src/ui/SearchField";
import type { Party } from "../../src/types";

type Filter = "" | "receivable" | "payable";

function partyName(p: Party) {
  return p.company_name || p.name || p.full_name || "Cari";
}

export default function CustomersScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search.trim(), 350);
  const [filter, setFilter] = useState<Filter>("");

  const fetchPage = useCallback(
    (page: number) => getParties(token as string, { page, search: debounced || undefined, balanceStatus: filter || undefined }),
    [token, debounced, filter]
  );
  const list = usePagedList<Party>(token ? fetchPage : null);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="customers-screen">
      <StackHeader title="Cari hesaplar" subtitle={list.loading ? undefined : `${list.total} cari`} />
      <SearchField testID="customers-search" value={search} onChangeText={setSearch} placeholder="Cari adı, telefon veya e-posta" />
      <ChipRow>
        <Chip label="Tümü" selected={filter === ""} onPress={() => setFilter("")} />
        <Chip label="Alacak" selected={filter === "receivable"} onPress={() => setFilter("receivable")} />
        <Chip label="Borç" selected={filter === "payable"} onPress={() => setFilter("payable")} />
      </ChipRow>
      <ListBody
        state={list}
        icon={<UserIcon size={30} color={colors.textTertiary} />}
        emptyTitle="Cari yok"
        emptyDescription="Bu süzgece uyan cari hesap bulunmuyor."
        renderItem={(p) => {
          const bal = Number(p.balance || 0);
          return (
            <RowCard
              testID={`party-${p.id}`}
              title={partyName(p)}
              subtitle={p.phone || p.email || (p.source === "orders" ? "Siparişlerden" : undefined)}
              amount={bal === 0 ? "Bakiye yok" : formatTry(Math.abs(bal))}
              amountColor={bal > 0 ? colors.success : bal < 0 ? colors.error : colors.textTertiary}
              meta={bal > 0 ? "Alacağınız var" : bal < 0 ? "Borcunuz var" : undefined}
              onPress={() =>
                router.push({ pathname: "/customers/[id]", params: { id: p.id, name: partyName(p), balance: String(bal), registered: p.source === "registered" ? "1" : "0" } })
              }
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 } });
