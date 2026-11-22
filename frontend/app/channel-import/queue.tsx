// Faz C5 eşleştirme onay kuyruğu: GET /products/channel-import/queue?integration_id&page; her satır için önerilen karta bağla / başka
// karta bağla (ürün arama) / yeni ürün aç / yoksay → POST queue/{row}/resolve. Her karar hemen yazılır; aynı satıra ikinci karar 409
// (liste yenilenir). OTHER_STORE satırda yalnız "Yoksay". Kurallar: src/channel-import.ts.
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { request } from "../../src/api";
import { queuePath, queueRowView, resolveBody, resolveError, resolvePath, resolveText } from "../../src/channel-import";
import { useDebounce } from "../../src/hooks/useDebounce";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { EmptyState } from "../../src/components/EmptyState";
import { CheckIcon } from "../../src/components/Icons";
import { PressableScale } from "../../src/components/KPICard";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { Card } from "../../src/ui/ListRow";
import { SearchField } from "../../src/ui/SearchField";

function ProductPicker({ token, onPick, onCancel }: { token: string; onPick: (id: string) => void; onCancel: () => void }) {
  const { colors } = useTheme();
  const [q, setQ] = useState("");
  const term = useDebounce(q.trim(), 250);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (term.length < 2) return setItems([]);
    let live = true;
    setLoading(true);
    request<any>(`/products?search=${encodeURIComponent(term)}&limit=20&channel_eligible=true`, { method: "GET" }, token)
      .then((r) => live && setItems(Array.isArray(r) ? r : r?.items || []))
      .catch(() => live && setItems([]))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [term, token]);
  return (
    <View style={{ gap: spacing.xs }}>
      <SearchField inset={false} testID="cq-picker-search" value={q} onChangeText={setQ} placeholder="Ürün adı, SKU ya da barkod" />
      {items.map((p) => (
        <PressableScale key={p.id} testID={`cq-pick-${p.id}`} onPress={() => onPick(String(p.id))} style={[styles.pick, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[type.body, { color: colors.textPrimary }]} numberOfLines={1}>{p.name}</Text>
          <Text style={[type.caption, { color: colors.textTertiary }]}>{[p.sku && !p.sku_auto && `SKU ${p.sku}`, p.barcode && `Barkod ${p.barcode}`].filter(Boolean).join(" · ") || "Kod yok"}</Text>
        </PressableScale>
      ))}
      {!items.length ? <Text style={[type.caption, { color: colors.textTertiary }]}>{q.trim().length < 2 ? "En az 2 harf yazın." : loading ? "Aranıyor…" : "Ürün bulunamadı."}</Text> : null}
      <Button size="sm" variant="ghost" label="Vazgeç" onPress={onCancel} style={{ alignSelf: "flex-start" }} />
    </View>
  );
}

export default function ChannelQueueScreen() {
  const p = useLocalSearchParams<{ integrationId?: string }>();
  const integrationId = String(p.integrationId || "");
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const [data, setData] = useState<{ items: any[]; total: number } | null>(null);
  const [page, setPage] = useState(1);
  const [busyRow, setBusyRow] = useState("");
  const [picking, setPicking] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r = await request<any>(queuePath(integrationId, page), { method: "GET" }, token);
      setData({ items: Array.isArray(r?.items) ? r.items : [], total: Number(r?.total || 0) });
    } catch (e: any) {
      toast(e?.message || "Onay bekleyen ürünler alınamadı.", "error");
      setData((d) => d || { items: [], total: 0 });
    } finally {
      setRefreshing(false);
    }
  }, [token, integrationId, page, toast]);
  useEffect(() => {
    load();
  }, [load]);

  const decide = async (rowId: string, action: "link" | "new" | "skip", productId?: string) => {
    if (!token || busyRow) return;
    setBusyRow(rowId);
    try {
      const res = await request<any>(resolvePath(rowId), { method: "POST", body: JSON.stringify(resolveBody(action, productId)) }, token);
      toast(resolveText(res), "success");
      setPicking("");
      await load();
    } catch (e: any) {
      const r = resolveError(e);
      toast(r.text, "error");
      if (r.reload) await load();
    } finally {
      setBusyRow("");
    }
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / 25)) : 1;
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="channel-queue">
      <StackHeader title="Onay bekleyenler" subtitle={data ? `${data.total.toLocaleString("tr-TR")} kanal ürünü` : "Kanal eşleştirmeleri"} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: spacing.huge, gap: spacing.sm, paddingTop: spacing.xs }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), load())} tintColor={colors.primary} />}
      >
        {!data ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} /> : null}
        {data && !data.total ? (
          <EmptyState icon={<CheckIcon size={30} color={colors.textTertiary} />} title="Onay bekleyen ürün yok" description="Kanaldan ürün çektiğinizde emin olunamayan eşleşmeler burada görünür." />
        ) : null}
        {data && data.total ? (
          <Text style={[type.caption, styles.block, { color: colors.textSecondary }]}>Aynı ürünse önerilen karta bağlayın; değilse yeni ürün açın. Her karar hemen kaydedilir.</Text>
        ) : null}
        {(data?.items || []).map((raw) => {
          const r = queueRowView(raw);
          const busy = Boolean(busyRow);
          return (
            <Card key={r.id} style={styles.block}>
              <View style={styles.body} testID={`cq-row-${r.id}`}>
                <Text style={[type.caption, { color: colors.primary, fontWeight: "700" }]}>{r.channel}</Text>
                <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>{r.title}</Text>
                <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{r.codes}</Text>
                {r.reason ? <Text style={[type.caption, { color: colors.amber }]}>{r.reason}</Text> : null}
                {r.onlySkip ? (
                  <View style={[styles.cand, { borderColor: colors.border }]}>
                    <Text style={[type.caption, { color: colors.textSecondary, flex: 1 }]}>Diğer mağazadaki bağ Ürün Eşleştirme'den kaldırılmadan bu ürün aktarılamaz.</Text>
                    <Button testID={`cq-skip-${r.id}`} size="sm" variant="ghost" label="Yoksay" disabled={busy} onPress={() => decide(r.id, "skip")} />
                  </View>
                ) : (
                  <>
                    {r.candidates.map((c: any) => (
                      <View key={c.id} style={[styles.cand, { borderColor: colors.border }]}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[type.body, { color: colors.textPrimary }]} numberOfLines={2}>{c.name}</Text>
                          {c.text ? <Text style={[type.caption, { color: colors.textTertiary }]}>{c.text}</Text> : null}
                        </View>
                        <Button testID={`cq-link-${r.id}-${c.id}`} size="sm" label="Bu ürüne bağla" disabled={busy} busy={busyRow === r.id} onPress={() => decide(r.id, "link", c.id)} />
                      </View>
                    ))}
                    {picking === r.id && token ? <ProductPicker token={token} onPick={(pid) => decide(r.id, "link", pid)} onCancel={() => setPicking("")} /> : null}
                    <View style={styles.actions}>
                      {picking !== r.id ? <Button testID={`cq-other-${r.id}`} size="sm" variant="secondary" label="Başka karta bağla" disabled={busy} onPress={() => setPicking(r.id)} /> : null}
                      <Button testID={`cq-new-${r.id}`} size="sm" variant="secondary" label="Yeni ürün aç" disabled={busy} onPress={() => decide(r.id, "new")} />
                      <Button testID={`cq-skip-${r.id}`} size="sm" variant="ghost" label="Yoksay" disabled={busy} onPress={() => decide(r.id, "skip")} />
                    </View>
                  </>
                )}
              </View>
            </Card>
          );
        })}
        {data && pages > 1 ? (
          <View style={[styles.block, styles.pager]}>
            <Button size="sm" variant="ghost" label="Önceki" disabled={page <= 1} onPress={() => setPage((x) => x - 1)} />
            <Text style={[type.caption, tabular, { color: colors.textSecondary }]}>{`${page} / ${pages}`}</Text>
            <Button size="sm" variant="ghost" label="Sonraki" disabled={page >= pages} onPress={() => setPage((x) => x + 1)} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  body: { padding: spacing.md, gap: spacing.xs },
  cand: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
  pick: { borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
