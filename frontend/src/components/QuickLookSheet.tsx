// KABUK-2 cari / ürün hızlı bakışı (web components/quicklook/CariQuickLook.jsx, UrunQuickLook.jsx): fatura formundan seçili cariye
// ya da ürün kalemine alttan açılan, yalnız okuma özet. Form durumu değişmez. Bölümler ayrı yüklenir; 403 alan bölüm gizlenir,
// diğer hatada "Yeniden dene". Alan dönüşümleri: src/quicklook.ts.
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { request } from "../api";
import { balanceRows, channelText, dayText, ledgerRow, purchaseView, saleRows, stockView } from "../quicklook";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../theme/tokens";
import { formatMoney } from "../utils";
import { Button } from "../ui/Button";

type Sec<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; msg: string } | { status: "hidden" };
const enc = encodeURIComponent;
const legacyId = (v: string) => (v.startsWith("legacy:") ? v.slice(7) : v);

function useSection<T>(fn: () => Promise<T | null>, deps: unknown[]): [Sec<T>, () => void] {
  const [s, setS] = useState<Sec<T>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setS({ status: "loading" });
    fn().then(
      (data) => live && setS(data === null ? { status: "hidden" } : { status: "ready", data }),
      (e: any) => live && setS(Number(e?.status) === 403 ? { status: "hidden" } : { status: "error", msg: e?.message || "Yüklenemedi." }),
    );
    return () => {
      live = false;
    };
  }, [...deps, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return [s, useCallback(() => setTick((t) => t + 1), [])];
}

function Section<T>({
  title,
  sec,
  onRetry,
  empty,
  isEmpty,
  children,
}: {
  title: string;
  sec: Sec<T>;
  onRetry: () => void;
  empty?: string;
  isEmpty?: boolean;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  if (sec.status === "hidden") return null;
  return (
    <View style={styles.sec}>
      <Text style={[type.caption, styles.secTitle, { color: colors.textSecondary }]} accessibilityRole="header">
        {title}
      </Text>
      {sec.status === "loading" ? <ActivityIndicator color={colors.primary} style={{ alignSelf: "flex-start" }} /> : null}
      {sec.status === "error" ? (
        <View style={styles.rowBetween}>
          <Text style={[type.footnote, { color: colors.error, flex: 1 }]}>{sec.msg}</Text>
          <Button size="sm" variant="ghost" label="Yeniden dene" onPress={onRetry} />
        </View>
      ) : null}
      {sec.status === "ready" ? isEmpty ? <Text style={[type.footnote, { color: colors.textTertiary }]}>{empty}</Text> : children : null}
    </View>
  );
}

function Line({ left, sub, right, rightSub, tone }: { left: string; sub?: string; right?: string; rightSub?: string; tone?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.line}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.callout, { color: colors.textPrimary }]} numberOfLines={1}>
          {left}
        </Text>
        {sub ? (
          <Text style={[type.caption, { color: colors.textTertiary }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right !== undefined ? (
        <View style={{ alignItems: "flex-end", maxWidth: "55%" }}>
          <Text style={[type.callout, tabular, { color: tone || colors.textPrimary, fontWeight: "600" }]} numberOfLines={1}>
            {right}
          </Text>
          {rightSub ? <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{rightSub}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function CariBody({ token, id }: { token: string; id: string }) {
  const { colors } = useTheme();
  // Web kuralı: önce eski kart, 404 ise okuma modeli. Mod (legacy | rm) hareket ve sipariş bölümlerinin kaynağını belirler.
  const [mode, setMode] = useState<{
    kind: "legacy" | "rm";
    party: any;
  } | null>(null);
  const [party, retryParty] = useSection(async () => {
    try {
      const p = await request<any>(`/customers/${enc(legacyId(id))}`, { method: "GET" }, token);
      setMode({ kind: "legacy", party: p });
      return p;
    } catch (e: any) {
      if (Number(e?.status) !== 404) throw e;
      const p = await request<any>(`/accounting/read-model/parties/${enc(id)}`, { method: "GET" }, token);
      setMode({ kind: "rm", party: p });
      return p;
    }
  }, [id, token]);
  const [ledger, retryLedger] = useSection(async () => {
    if (!mode) return new Promise<never>(() => {});
    const a = mode.party?.actions || {};
    if (mode.kind === "rm" ? a.view_ledger !== true : a.view_ledger === false) return null;
    const r =
      mode.kind === "rm"
        ? await request<any>(`/accounting/read-model/parties/${enc(id)}/ledger?per_page=5&page=1`, { method: "GET" }, token)
        : await request<any>(`/customers/${enc(legacyId(id))}/ledger?page=1&per_page=5`, { method: "GET" }, token);
    return (Array.isArray(r?.items) ? r.items : []).slice(0, 5).map(ledgerRow);
  }, [mode]);
  const [orders, retryOrders] = useSection(async () => {
    if (!mode) return new Promise<never>(() => {});
    if (mode.kind !== "legacy" || mode.party?.actions?.view_orders === false) return null;
    const r = await request<any>(`/customers/${enc(legacyId(id))}/orders?limit=3`, { method: "GET" }, token);
    return (Array.isArray(r?.items) ? r.items : []).slice(0, 3);
  }, [mode]);
  const p: any = party.status === "ready" ? party.data : null;
  const rows = balanceRows(p);
  const contact = [
    ["Telefon", p?.phone],
    ["E-posta", p?.email],
    ["Adres", p?.address_full || p?.address],
  ].filter(([, v]) => v) as [string, string][];
  return (
    <>
      <Section
        title="Bakiye"
        sec={party}
        onRetry={retryParty}
        isEmpty={rows.length === 0}
        empty={p?.balance_available === false ? "Bakiye bu cari için hesaplanamadı." : "Açık bakiye yok."}
      >
        {rows.map((r) => (
          <Line
            key={r.currency}
            left={r.balance > 0 ? "Borçlu" : "Alacaklı"}
            right={formatMoney(Math.abs(r.balance), r.currency)}
            tone={r.balance > 0 ? colors.error : colors.success}
          />
        ))}
      </Section>
      {/* Hareket ve siparişler cari kaynağı belli olunca (kart okununca) sorulur; kart okunamazsa hiç gösterilmez. */}
      {mode ? (
        <Section
          title="Son hareketler"
          sec={ledger}
          onRetry={retryLedger}
          isEmpty={ledger.status === "ready" && !ledger.data.length}
          empty="Henüz hareket yok."
        >
          {ledger.status === "ready"
            ? ledger.data.map((it: any) => (
                <Line
                  key={String(it.id)}
                  left={it.label}
                  sub={[dayText(it.date), it.reference].filter(Boolean).join(" · ")}
                  right={it.debit || it.credit ? formatMoney(it.debit || it.credit, it.currency) : "—"}
                  rightSub={it.debit ? "Borç" : it.credit ? "Alacak" : undefined}
                />
              ))
            : null}
        </Section>
      ) : null}
      {mode ? (
        <Section
          title="Son siparişler"
          sec={orders}
          onRetry={retryOrders}
          isEmpty={orders.status === "ready" && !orders.data.length}
          empty="Henüz sipariş yok."
        >
          {orders.status === "ready"
            ? orders.data.map((o: any, i: number) => (
                <Line
                  key={String(o.id || i)}
                  left={o.channel_order_id ? `#${o.channel_order_id}` : "Sipariş"}
                  sub={channelText(o.channel)}
                  right={o.total_amount != null ? formatMoney(o.total_amount, o.currency || "TRY") : "—"}
                />
              ))
            : null}
        </Section>
      ) : null}
      {party.status === "ready" && contact.length ? (
        <View style={styles.sec}>
          <Text style={[type.caption, styles.secTitle, { color: colors.textSecondary }]}>İletişim</Text>
          {contact.map(([k, v]) => (
            <Line key={k} left={k} sub={v} />
          ))}
        </View>
      ) : null}
    </>
  );
}

function UrunBody({ token, id }: { token: string; id: string }) {
  const [product, retryP] = useSection(() => request<any>(`/products/${enc(id)}`, { method: "GET" }, token), [id, token]);
  const [stock, retryS] = useSection(async () => stockView(await request<any>(`/products/${enc(id)}/warehouse-stock`, { method: "GET" }, token)), [id, token]);
  const [purchase, retryPu] = useSection(
    async () => purchaseView(await request<any>(`/products/${enc(id)}/price-history?side=purchase&limit=1`, { method: "GET" }, token)),
    [id, token],
  );
  const [sales, retrySa] = useSection(
    async () => saleRows(await request<any>(`/products/${enc(id)}/sales?page=1&per_page=5`, { method: "GET" }, token)),
    [id, token],
  );
  const p: any = product.status === "ready" ? product.data : null;
  const cur = p?.currency || "TRY";
  return (
    <>
      <Section title="Fiyat" sec={product} onRetry={retryP}>
        <Line left="Satış fiyatı (KDV dahil)" right={formatMoney(p?.price ?? 0, cur)} />
        <Line left="KDV" right={p?.vat_rate === null || p?.vat_rate === undefined || p?.vat_rate === "" ? "—" : `%${p.vat_rate}`} />
        {p?.purchase_price !== null && p?.purchase_price !== undefined && p?.purchase_price !== "" ? (
          <Line left="Alış fiyatı (KDV hariç)" right={formatMoney(p.purchase_price, p.purchase_currency || cur)} />
        ) : null}
      </Section>
      <Section title="Stok" sec={stock} onRetry={retryS} isEmpty={stock.status === "ready" && !stock.data.tracks} empty="Bu ürün için stok takibi yapılmaz.">
        {stock.status === "ready" ? (
          <>
            {stock.data.rows.map((w) => (
              <Line key={w.key} left={w.name} right={w.qty} />
            ))}
            <Line left="Satılabilir toplam" right={stock.data.total ?? "—"} />
          </>
        ) : null}
      </Section>
      <Section title="Son alış" sec={purchase} onRetry={retryPu} isEmpty={purchase.status === "ready" && !purchase.data} empty="Henüz alış kaydı yok.">
        {purchase.status === "ready" && purchase.data ? (
          <Line
            left="Birim fiyat (KDV hariç)"
            sub={[dayText(purchase.data.date), purchase.data.party].filter(Boolean).join(" · ")}
            right={formatMoney(purchase.data.price, purchase.data.currency)}
          />
        ) : null}
      </Section>
      <Section title="Son satışlar" sec={sales} onRetry={retrySa} isEmpty={sales.status === "ready" && !sales.data.length} empty="Bu ürün henüz satılmadı.">
        {sales.status === "ready"
          ? sales.data.map((s) => (
              <Line
                key={s.key}
                left={s.party}
                sub={[dayText(s.date), s.number].filter(Boolean).join(" · ")}
                right={s.qty}
                rightSub={`${formatMoney(s.price, s.currency)} (KDV hariç)`}
              />
            ))
          : null}
      </Section>
    </>
  );
}

export function QuickLookSheet({
  token,
  target,
  onClose,
}: {
  token: string | null;
  target: {
    kind: "cari" | "urun";
    id: string;
    name: string;
    sub?: string;
  } | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  if (!target || !token) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={styles.end} pointerEvents="box-none">
        <View
          testID={`quicklook-${target.kind}`}
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              paddingBottom: insets.bottom + spacing.md,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <View>
            <Text accessibilityRole="header" style={[type.title, { color: colors.textPrimary }]} numberOfLines={2}>
              {target.name || (target.kind === "cari" ? "Cari" : "Ürün")}
            </Text>
            {target.sub ? <Text style={[type.caption, { color: colors.textTertiary }]}>{target.sub}</Text> : null}
          </View>
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: spacing.md }}>
            {target.kind === "cari" ? <CariBody token={token} id={target.id} /> : <UrunBody token={token} id={target.id} />}
          </ScrollView>
          <View style={styles.actions}>
            {target.kind === "cari" ? (
              <Button
                testID="quicklook-open-card"
                variant="secondary"
                label="Cari kartını aç"
                onPress={() => {
                  onClose();
                  router.push({
                    pathname: "/customers/[id]",
                    params: { id: target.id, name: target.name },
                  } as any);
                }}
                style={{ flex: 1 }}
              />
            ) : null}
            <Button testID="quicklook-close" label="Kapat" onPress={onClose} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  end: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginTop: -spacing.xs,
  },
  sec: { gap: 6 },
  secTitle: { fontWeight: "700", letterSpacing: 0.3 },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 36,
  },
  rowBetween: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm },
});
