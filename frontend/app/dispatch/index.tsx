// Dalga 5a (P5.1): İrsaliyeler — GET /dispatch-notes?direction=out|in&status=&q=&cursor=. Seçim modunda aynı cariye ait faturalanmamış
// giden irsaliyeler tek satış faturasına çevrilir (POST /dispatch-notes/invoice; fatura taslak, stok ikinci kez düşmez).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { newIdempotencyKey, request } from "../../src/api";
import { dispatchErrorText, invoiceSelection, listPath, statusBadges, type Direction } from "../../src/dispatch";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, type } from "../../src/theme/tokens";
import { formatDate } from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon, PackageIcon } from "../../src/components/Icons";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Button } from "../../src/ui/Button";
import { Chip, ChipRow, SegmentedControl } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { RowCard } from "../../src/ui/RowCard";
import { SearchField } from "../../src/ui/SearchField";

const STATUS: [string, string][] = [
  ["", "Tümü"],
  ["not_invoiced", "Faturalanmamış"],
  ["invoiced", "Faturalanmış"],
];

export default function DispatchListScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const mayWrite = canManage(user, "inventory") && canManage(user, "billing");
  const [direction, setDirection] = useState<Direction>("out");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<any[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const load = useCallback(
    async (more = false) => {
      if (!token) return;
      const my = ++seq.current;
      try {
        const r = await request<any>(listPath({ direction, status, q, cursor: more ? cursor : null }), { method: "GET" }, token);
        if (my !== seq.current) return;
        const list = Array.isArray(r?.items) ? r.items : [];
        setItems((prev) => (more && prev ? [...prev, ...list] : list));
        setCursor(r?.next_cursor || null);
        setError("");
      } catch (e: any) {
        if (my === seq.current) setError(Number(e?.status) === 403 ? "İrsaliyeleri görme yetkiniz yok." : dispatchErrorText(e));
      } finally {
        setRefreshing(false);
      }
    },
    [token, direction, status, q, cursor]
  );
  useEffect(() => {
    setItems(null);
    const t = setTimeout(() => load(false), q ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, direction, status, q]);
  useFocusEffect(
    useCallback(() => {
      if (items) load(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const toInvoice = async () => {
    if (!token || busy) return;
    const sel = invoiceSelection(items || [], picked);
    if (!sel.ok) return toast(sel.error || "", "error");
    const ok = await confirm({ title: "Tek faturaya çevrilsin mi?", message: `${sel.ids.length} irsaliye taslak satış faturasına çevrilir. Stok irsaliyede düştüğü için faturada ikinci kez düşmez.`, confirmLabel: "Faturaya çevir" });
    if (!ok) return;
    setBusy(true);
    const key = newIdempotencyKey("dninv");
    try {
      const r = await request<any>("/dispatch-notes/invoice", { method: "POST", body: JSON.stringify({ note_ids: sel.ids }), headers: { "Idempotency-Key": key } }, token);
      toast("Taslak fatura oluşturuldu.", "success");
      setSelecting(false);
      setPicked([]);
      if (r?.invoice?.id) router.push({ pathname: "/local-invoices/[id]", params: { id: String(r.invoice.id) } });
      else load(false);
    } catch (e: any) {
      toast(dispatchErrorText(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="dispatch-screen">
      <StackHeader
        title="İrsaliyeler"
        subtitle={direction === "out" ? "Giden" : "Gelen"}
        right={
          mayWrite ? (
            <Button testID="dispatch-new-manual" size="sm" label="Yeni" onPress={() => router.push({ pathname: "/dispatch/form", params: { direction } } as any)} />
          ) : undefined
        }
      />
      <View>
        <SegmentedControl
          options={[
            { value: "out", label: "Giden" },
            { value: "in", label: "Gelen" },
          ]}
          value={direction}
          onChange={(v) => (setDirection(v), setSelecting(false), setPicked([]))}
        />
      </View>
      <View style={{ marginTop: spacing.sm }}>
        <SearchField value={q} onChangeText={setQ} placeholder="No, cari ya da takip no" />
      </View>
      <ChipRow>
        {STATUS.map(([k, l]) => (
          <Chip key={k || "all"} testID={`dispatch-filter-${k || "all"}`} label={l} selected={status === k} onPress={() => setStatus(k)} />
        ))}
        {mayWrite && direction === "out" ? (
          <Chip testID="dispatch-select" label={selecting ? "Seçimi kapat" : "Faturaya çevir"} selected={selecting} onPress={() => (setSelecting(!selecting), setPicked([]))} />
        ) : null}
      </ChipRow>
      {error ? (
        <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="İrsaliyeler okunamadı" description={error} actionLabel="Tekrar dene" onAction={() => load(false)} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.huge, gap: spacing.xs }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), load(false))} tintColor={colors.primary} />}
        >
          {items && !items.length ? (
            <EmptyState
              icon={<PackageIcon size={30} color={colors.textTertiary} />}
              title="İrsaliye yok"
              description={direction === "out" ? "Yeni irsaliye oluşturun; siparişten ya da faturadan da açabilirsiniz." : "Tedarikçinizden gelen ürünleri “Yeni” ile irsaliyeyle stoğa alın."}
            />
          ) : null}
          {(items || []).map((n) => {
            const on = picked.includes(n.id);
            const badges = statusBadges(n);
            return (
              <View key={n.id} style={styles.block} testID={`dispatch-${n.id}`}>
                <RowCard
                  onPress={() =>
                    selecting ? (n.can_invoice ? setPicked(on ? picked.filter((x) => x !== n.id) : [...picked, n.id]) : undefined) : router.push({ pathname: "/dispatch/[id]", params: { id: n.id } } as any)
                  }
                  accent={selecting && on ? colors.primary : undefined}
                  title={n.party_name || "Cari"}
                  subtitle={[n.number, formatDate(n.issue_date), n.cargo?.tracking_no ? `Takip ${n.cargo.tracking_no}` : null].filter(Boolean).join(" · ")}
                  meta={`${(n.lines || []).length} kalem${selecting ? (n.can_invoice ? (on ? " · seçildi" : "") : " · faturalanamaz") : ""}`}
                  badge={<StatusBadge label={badges[badges.length - 1].label} kind={badges[badges.length - 1].kind} size="sm" />}
                />
              </View>
            );
          })}
          {cursor ? (
            <View style={styles.block}>
              <Button variant="secondary" size="sm" label="Daha fazla" onPress={() => load(true)} />
            </View>
          ) : null}
        </ScrollView>
      )}
      {selecting ? (
        <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Text style={[type.callout, { color: colors.textSecondary, flex: 1 }]}>{`${picked.length} irsaliye seçildi`}</Text>
          <Button testID="dispatch-invoice" label="Faturaya çevir" busy={busy} disabled={!picked.length} onPress={toInvoice} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  bar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
});
