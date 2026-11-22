// P6.3 Finans sekmesi "Bekleyen işler": GET /finance/dashboard-counters. 403 → kart hiç görünmez; unsent null (satış yetkisi yok) →
// yalnız tekrarlayan sayacı. Hata: "Sayaçlar yüklenemedi" + yeniden dene. Kurallar: src/finance-dashboard.ts.
import React, { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { request } from "../../api";
import { counterTiles, countersFailure } from "../../finance-dashboard";
import { useTheme } from "../../theme/ThemeProvider";
import { tabular, type } from "../../theme/tokens";
import { AlertIcon, MailIcon, RefreshIcon } from "../Icons";
import { InlineEmpty } from "../InlineEmpty";
import { Card, IconTile, ListRow, SectionTitle } from "../../ui/ListRow";

export function CountersCard({ token, refreshKey, style }: { token: string | null; refreshKey: number; style?: any }) {
  const { colors } = useTheme();
  const [state, setState] = useState<"loading" | "ok" | "error" | "forbidden">("loading");
  const [data, setData] = useState<any>(null);
  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(await request<any>("/finance/dashboard-counters", { method: "GET" }, token));
      setState("ok");
    } catch (e: any) {
      setState(countersFailure(e));
    }
  }, [token]);
  useEffect(() => {
    load();
  }, [load, refreshKey]);
  if (state === "forbidden" || state === "loading") return null;
  const tiles = counterTiles(data);
  if (state === "ok" && !tiles.length) return null;
  return (
    <View testID="finance-counters">
      <SectionTitle title="Bekleyen işler" />
      <Card style={style}>
        {state === "error" ? (
          <InlineEmpty
            testID="finance-counters-error"
            icon={<AlertIcon size={22} color={colors.error} />}
            title="Sayaçlar yüklenemedi"
            description="Bekleyen işler şu an okunamadı."
            actionLabel="Yeniden dene"
            onAction={load}
          />
        ) : (
          tiles.map((t, i) => {
            const fg = t.warn ? colors.amber : colors.info;
            return (
              <ListRow
                key={t.key}
                testID={`finance-counter-${t.key}`}
                divider={i > 0}
                leading={<IconTile tint={t.warn ? colors.amberSoft : colors.infoBg}>{t.key === "unsent" ? <MailIcon size={18} color={fg} /> : <RefreshIcon size={18} color={fg} />}</IconTile>}
                title={t.label}
                subtitle={t.hint}
                accessibilityLabel={`${t.label}: ${t.value}. ${t.hint}`}
                trailing={<Text style={[type.headline, tabular, { color: t.warn ? colors.amber : colors.textPrimary, fontWeight: "800" }]}>{t.value}</Text>}
                chevron
                onPress={() => router.push(t.route)}
              />
            );
          })
        )}
      </Card>
    </View>
  );
}
