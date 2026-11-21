// Menü → Çalışanlar (P5.3): GET /employees?archived=0|1 — kart listesi, bakiye (çalışana borç / çalışandan alacak) ve özet.
// Çalışanlar cari ve tedarikçi listelerinde görünmez. Yazma Faturalar düzenleme yetkisinde (sunucu billing.manage). Kurallar: src/employees.ts.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { request } from "../../src/api";
import { balanceView, errorText, summaryText } from "../../src/employees";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon, UserIcon } from "../../src/components/Icons";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Button } from "../../src/ui/Button";
import { OptionChips } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { RowCard } from "../../src/ui/RowCard";

export default function EmployeesScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const [archived, setArchived] = useState("0");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);
  const mayWrite = canManage(user, "billing");

  const load = useCallback(async () => {
    if (!token) return;
    const my = ++seq.current;
    try {
      const d = await request<any>(`/employees?archived=${archived}`, { method: "GET" }, token);
      if (my !== seq.current) return;
      setData(d);
      setError("");
    } catch (e: any) {
      if (my === seq.current) setError(errorText(e));
    } finally {
      if (my === seq.current) setRefreshing(false);
    }
  }, [token, archived]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      load();
    }, [load])
  );

  const items: any[] = Array.isArray(data?.items) ? data.items : [];
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="employees-screen">
      <StackHeader
        title="Çalışanlar"
        subtitle={archived === "1" ? "Arşiv" : "Avans, maaş, prim, cebinden ödeme"}
        right={mayWrite ? <Button testID="employees-new" size="sm" label="Yeni" onPress={() => router.push("/employees/form" as any)} /> : undefined}
      />
      <View style={styles.block}>
        <OptionChips
          testIDPrefix="employees-archived"
          options={[
            { value: "0", label: "Etkin" },
            { value: "1", label: "Arşiv" },
          ]}
          value={archived}
          onChange={setArchived}
        />
        {data?.summary && archived === "0" ? (
          <Text testID="employees-summary" style={[type.caption, tabular, { color: colors.textSecondary, marginTop: spacing.xs }]}>{summaryText(data.summary)}</Text>
        ) : null}
      </View>
      {error ? (
        <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="Çalışanlar okunamadı" description={error} actionLabel="Tekrar dene" onAction={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: spacing.huge, gap: spacing.xs }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), load())} tintColor={colors.primary} />}
        >
          {!data ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} /> : null}
          {data && !items.length ? (
            <EmptyState
              icon={<UserIcon size={30} color={colors.textTertiary} />}
              title={archived === "1" ? "Arşivde çalışan yok" : "Henüz çalışan yok"}
              description={archived === "1" ? "Arşivlediğiniz çalışanlar burada görünür." : "Avans, maaş, prim ve cebinden ödenen masrafları izlemek için çalışan ekleyin."}
            />
          ) : null}
          {items.map((e) => {
            const b = balanceView(e.balance);
            return (
              <View key={e.id} style={styles.block} testID={`employee-${e.id}`}>
                <RowCard
                  onPress={() => router.push({ pathname: "/employees/[id]", params: { id: e.id } } as any)}
                  title={e.name}
                  subtitle={[e.title, e.phone].filter(Boolean).join(" · ") || "Çalışan"}
                  meta={b.text}
                  badge={b.tone !== "neutral" ? <StatusBadge label={b.tone === "error" ? "Borç" : "Alacak"} kind={b.tone} size="sm" /> : undefined}
                />
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 }, block: { marginHorizontal: spacing.lg } });
