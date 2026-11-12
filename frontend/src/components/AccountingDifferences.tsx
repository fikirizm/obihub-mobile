// Aşama 3 / P5 — Muhasebe farkları (web: frontend/src/components/stock/AccountingDifferences.jsx).
// Ürünler ekranının başında, yalnız açık fark ya da son stok turu uyarısı varsa görünür; gezinme değişmez.
// Kart dokununca yerinde açılır; satır başına "Farkı al" (ObiHub stoğu programdaki sayıya, bekleyen siparişler düşülerek)
// ya da "Yoksay" (stok değişmez). 409'da (ITEM_OUTDATED / PRODUCT_NOT_SYNCED) sunucu mesajı gösterilir, liste yenilenir.
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../auth/AuthProvider";
import { canManage } from "../auth/permissions";
import { applyReconciliation, dismissReconciliation, getReconciliation, type ReconItem, type Reconciliation, type ReconLastRun } from "../api-urun-stok";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../theme/tokens";
import { useFeedback } from "../ui/Feedback";
import { Button } from "../ui/Button";
import { AlertIcon, ArrowRightIcon } from "./Icons";

const PROGRAM_LABELS: Record<string, string> = { bizimhesap: "BizimHesap", parasut: "Paraşüt", benimpos: "BenimPOS" };
const PROGRAM_IN: Record<string, string> = { bizimhesap: "BizimHesap'taki", parasut: "Paraşüt'teki", benimpos: "BenimPOS'taki" };
const fmt = (n: number) => Number(n || 0).toLocaleString("tr-TR");
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))}`;

export function roundWarning(run: ReconLastRun): string | null {
  if (!run?.aborted_reason) return null;
  const program = (run.program && PROGRAM_LABELS[run.program]) || "Muhasebe programı";
  switch (run.aborted_reason) {
    case "mass_zeroing":
      return (
        `Son ${program} stok turu hiçbir şey yazmadan durduruldu: ürünlerin yarısından fazlası sıfıra inecekti ` +
        `(${fmt(run.would_zero || 0)} / ${fmt(run.matched_stocked ?? run.stocked ?? 0)}). ` +
        `${(run.program && PROGRAM_IN[run.program]) || "Programdaki"} stok sayılarını kontrol edin.`
      );
    case "empty_inventory":
      return `Son ${program} stok turunda program boş stok döndürdü; ObiHub stoğu değiştirilmedi.`;
    case "remote_read_failed":
      return `Son ${program} stok turunda programdan stok okunamadı; ObiHub stoğu değiştirilmedi.`;
    default:
      return null;
  }
}

export function AccountingDifferences({ onChanged }: { onChanged?: () => void }) {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const [data, setData] = useState<Reconciliation | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const canAct = canManage(user, "inventory");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(await getReconciliation(token));
    } catch {
      // Uç yoksa / yetki yoksa kart hiç görünmez (web gibi).
      setData(null);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const act = async (item: ReconItem, kind: "apply" | "dismiss") => {
    if (!token || busy) return;
    setBusy(`${kind}:${item.id}`);
    try {
      if (kind === "apply") {
        const res = await applyReconciliation(token, [item.id]);
        if (res?.applied) toast("Fark alındı; stok güncellendi.", "success");
        else if (res?.stale) toast("Ürünün stoğu bu arada değişti; fark bir sonraki stok turunda yeniden hesaplanacak.", "error");
        else toast("Fark alınamadı.", "error");
        if (res?.applied) onChanged?.();
      } else {
        const res = await dismissReconciliation(token, [item.id]);
        if (res?.dismissed) toast("Fark yoksayıldı; stok değişmedi.", "success");
      }
    } catch (e: any) {
      toast(e?.message || "İşlem yapılamadı.", "error");
    } finally {
      await load();
      setBusy(null);
    }
  };

  if (!data) return null;
  const items = data.items;
  const warning = roundWarning(data.lastRun);
  if (!items.length && !warning) return null;
  const program = items[0]?.program || data.ownerProgram || "";
  const programIn = PROGRAM_IN[program] || "Muhasebe programındaki";
  const programLabel = PROGRAM_LABELS[program] || "Program";

  return (
    <View style={styles.wrap} testID="acct-diffs">
      {warning ? (
        <View style={[styles.warn, { backgroundColor: colors.amberSoft }]} testID="acct-round-warning" accessibilityRole="alert">
          <AlertIcon size={16} color={colors.amber} />
          <Text style={[type.caption, { color: colors.textPrimary, flex: 1 }]}>{warning}</Text>
        </View>
      ) : null}
      {items.length ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <Pressable
            testID="acct-diff-toggle"
            onPress={() => setOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={`Muhasebe farkları, ${data.openCount} açık fark`}
            style={styles.head}
          >
            <View style={[styles.iconTile, { backgroundColor: colors.amberSoft }]}>
              <AlertIcon size={16} color={colors.amber} />
            </View>
            <Text style={[type.bodyStrong, { color: colors.textPrimary, flex: 1 }]}>Muhasebe farkları</Text>
            <View style={[styles.badge, { backgroundColor: colors.warningBg }]} testID="acct-diff-badge">
              <Text style={[type.caption, tabular, { color: colors.amber, fontWeight: "700" }]}>{fmt(data.openCount)}</Text>
            </View>
            <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
              <ArrowRightIcon size={18} color={colors.textTertiary} />
            </View>
          </Pressable>
          {open ? (
            <View>
              <Text style={[type.caption, styles.hint, { color: colors.textSecondary }]}>
                {programIn} stok ObiHub'dan farklı. Stok sahibi ObiHub olduğu için stok kendiliğinden değişmez. "Farkı al" ObiHub
                stoğunu programdaki sayıya (bekleyen siparişler düşülerek) çeker; "Yoksay" stoğu olduğu gibi bırakır.
              </Text>
              {items.map((r) => (
                <View key={r.id} style={[styles.row, { borderTopColor: colors.border }]} testID={`acct-diff-row-${r.id}`}>
                  <View style={styles.rowTop}>
                    <Text style={[type.bodyStrong, { color: colors.textPrimary, flex: 1 }]} numberOfLines={2}>
                      {r.product_name || r.sku || "Ürün"}
                    </Text>
                    <Text style={[type.bodyStrong, tabular, { color: r.diff > 0 ? colors.success : colors.error }]}>{signed(r.diff)}</Text>
                  </View>
                  <Text style={[type.caption, tabular, { color: colors.textSecondary, marginTop: 2 }]}>
                    {[
                      r.sku,
                      `ObiHub ${fmt(r.observed_stock)}`,
                      `${PROGRAM_LABELS[r.program || ""] || programLabel} ${fmt(r.remote_qty)}`,
                      r.pending_out ? `bekleyen sipariş ${fmt(r.pending_out)}` : null,
                      `beklenen ${fmt(r.expected)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  {canAct ? (
                    <View style={styles.actions}>
                      <Button
                        size="sm"
                        label="Farkı al"
                        testID={`acct-diff-apply-${r.id}`}
                        busy={busy === `apply:${r.id}`}
                        disabled={Boolean(busy)}
                        onPress={() => act(r, "apply")}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        label="Yoksay"
                        testID={`acct-diff-dismiss-${r.id}`}
                        busy={busy === `dismiss:${r.id}`}
                        disabled={Boolean(busy)}
                        onPress={() => act(r, "dismiss")}
                      />
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.sm },
  warn: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", padding: spacing.md, borderRadius: radius.md },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md },
  iconTile: { width: 30, height: 30, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  badge: { minWidth: 26, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, alignItems: "center" },
  hint: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  row: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
});
