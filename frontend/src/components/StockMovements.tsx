import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { getProductIdentity, getStockMovements, type StockMovement } from "../api-urun-stok";
import { recallProduct } from "../catalogCache";
import { PressableScale } from "./KPICard";
import { InlineEmpty } from "./InlineEmpty";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../theme/tokens";
import { Button } from "../ui/Button";
import { Card, SectionTitle } from "../ui/ListRow";

// Sunucu saat dilimi eki olmadan döndürürse değer UTC sayılır.
function formatWhen(value: string) {
  if (!value) return "-";
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return value.slice(0, 16).replace("T", " ");
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

// Ürün detayındaki "Stok hareketleri" bölümü. `refreshKey` değişince ilk sayfa yeniden okunur.
// productId boşsa tüm ürünlerin hareketleri gösterilir (Ürünler ekranı): satırda ürün adı, dokununca ürün detayı.
export function StockMovements({
  token,
  productId,
  refreshKey,
  title = "Stok hareketleri",
  pageSize,
  onOpenProduct,
}: {
  token: string | null | undefined;
  productId: string;
  refreshKey: number;
  title?: string;
  pageSize?: number;
  onOpenProduct?: (productId: string) => void;
}) {
  const { colors } = useTheme();
  const all = !productId;
  // Hareket satırları ürün adı taşımaz: önce katalog önbelleği, yoksa ürün ucu (yalnız tüm-ürün görünümünde).
  const [names, setNames] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());
  const [items, setItems] = useState<StockMovement[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  // Eski bir isteğin yanıtı yenisinin üstüne yazmasın.
  const seq = useRef(0);

  const loadFirst = useCallback(async () => {
    if (!token || (!productId && !all)) return;
    const mine = ++seq.current;
    try {
      const res = await getStockMovements(token, productId, 0, pageSize);
      if (mine !== seq.current) return;
      setItems(res.items);
      setHasMore(res.hasMore);
      setMoreError(false);
      setState("ready");
    } catch {
      if (mine !== seq.current) return;
      // Ekranda eski satırlar varsa korunur; yoksa hata durumu gösterilir.
      setState((s) => (s === "ready" ? "ready" : "error"));
    }
  }, [token, productId, all, pageSize]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst, refreshKey]);

  const loadMore = async () => {
    if (!token || loadingMore) return;
    const mine = seq.current;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const res = await getStockMovements(token, productId, items.length, pageSize);
      if (mine !== seq.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...res.items.filter((m) => !seen.has(m.id))];
      });
      setHasMore(res.hasMore);
    } catch {
      if (mine === seq.current) setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!all || !token) return;
    // Ad sunucudan gelmeyen (eski sunucu ya da silinmiş ürün) satırlar için önbellek / ürün ucu.
    const missing = Array.from(new Set(items.filter((m) => !m.product_name).map((m) => m.product_id))).filter((pid) => pid && !names[pid] && !asked.current.has(pid));
    if (missing.length === 0) return;
    const known: Record<string, string> = {};
    const fetchIds: string[] = [];
    for (const pid of missing) {
      asked.current.add(pid);
      const cached = recallProduct(pid);
      if (cached?.name) known[pid] = cached.name;
      else fetchIds.push(pid);
    }
    if (Object.keys(known).length) setNames((prev) => ({ ...prev, ...known }));
    // Bir sayfada en çok birkaç ürün ucuna gidilir; okunamayan ürün "Ürün" olarak kalır.
    fetchIds.slice(0, 12).forEach((pid) => {
      getProductIdentity(token, pid)
        .then((p) => p.name && setNames((prev) => ({ ...prev, [pid]: p.name })))
        .catch(() => {});
    });
  }, [all, token, items, names]);

  // "sale" (POS satışı) sunucuda eksi miktarla yazılır; çıkış olarak gösterilir. "opening" yeni ürünün ilk stoğudur.
  // "accounting_sync" (muhasebe senkronu) ve "reconcile" (Muhasebe farkları'nda "Farkı al") miktarı işaretsiz değişimdir; yön yalnız `delta` gelirse bilinir,
  // gelmezse "±" ile yönsüz gösterilir. Bilinmeyen türlerde yön `delta`dan, yoksa miktarın işaretinden okunur.
  // Yalnızca "adjustment" mutlak sayımdır ("=").
  const look = (t: string, q: number, delta?: number | null) => {
    const dir = typeof delta === "number" && delta !== 0 ? delta : null;
    const incoming = { fg: colors.info, bg: colors.infoBg, sign: "+", label: "Giriş" };
    const outgoing = { fg: colors.error, bg: colors.errorBg, sign: "−", label: t === "sale" ? "Satış" : "Çıkış" };
    if (t === "in") return incoming;
    if (t === "out" || t === "sale") return outgoing;
    if (t === "adjustment") return { fg: colors.amber, bg: colors.amberSoft, sign: "=", label: "Sayım" };
    if (t === "opening") return { ...incoming, label: "Açılış stoğu" };
    if (t === "purchase_in") return { ...incoming, label: "Alış faturası" };
    if (t === "purchase_reverse") return { ...outgoing, label: "Alış faturası ters kaydı" };
    if (t === "accounting_sync" || t === "reconcile") {
      const label = t === "reconcile" ? "Fark alındı" : "Muhasebe senkronu";
      if (dir === null) return { fg: colors.violet, bg: colors.violetSoft, sign: "±", label };
      return dir < 0 ? { ...outgoing, label } : { ...incoming, label };
    }
    if (dir !== null) return dir < 0 ? outgoing : incoming;
    return q < 0 ? outgoing : incoming;
  };
  const shown = (m: StockMovement) => (m.movement_type === "adjustment" ? m.quantity : Math.abs(m.quantity));

  return (
    <View testID="stock-movements">
      <SectionTitle
        title={title}
        action={
          state === "ready" && items.length > 0 ? (
            <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{hasMore ? `Son ${items.length} hareket` : `${items.length} hareket`}</Text>
          ) : undefined
        }
      />
      <Card style={styles.block}>
        {state === "loading" ? (
          <View style={styles.center} testID="stock-movements-loading">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : state === "error" ? (
          <View style={styles.center} testID="stock-movements-error">
            <Text style={[type.footnote, { color: colors.textSecondary, textAlign: "center" }]}>Stok hareketleri okunamadı.</Text>
            <Button
              testID="stock-movements-retry"
              label="Tekrar deneyin"
              variant="ghost"
              size="sm"
              onPress={() => {
                setState("loading");
                loadFirst();
              }}
            />
          </View>
        ) : items.length === 0 ? (
          <View testID="stock-movements-empty">
            <InlineEmpty
              icon={<Text style={{ fontSize: 22, color: colors.primary, fontWeight: "800" }}>±</Text>}
              title="Henüz stok hareketi yok"
              description={all ? "Satış, alış ve sayımlar stoğa işlendikçe burada görünür." : "Bu ürünün stok girişi, çıkışı ve sayımları burada listelenir."}
            />
          </View>
        ) : (
          <>
            {items.map((m, i) => {
              const k = look(m.movement_type, m.quantity, m.delta);
              const productName = all ? m.product_name || names[m.product_id] || "Ürün" : "";
              const Row: any = all && onOpenProduct ? PressableScale : View;
              return (
                <Row
                  key={m.id}
                  testID={`stock-movement-${m.id}`}
                  accessible
                  accessibilityRole={all && onOpenProduct ? "button" : undefined}
                  onPress={all && onOpenProduct ? () => onOpenProduct(m.product_id) : undefined}
                  accessibilityLabel={`${all ? `${productName}, ` : ""}${k.label}, ${k.sign}${shown(m)} adet,${m.reason || "Açıklama yok"}, ${formatWhen(m.created_at)}`}
                  style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                >
                  <View style={[styles.stripe, { backgroundColor: k.fg }]} />
                  <View style={[styles.tile, { backgroundColor: k.bg }]}>
                    <Text style={[styles.tileSign, { color: k.fg }]}>{k.sign}</Text>
                  </View>
                  <View style={styles.body}>
                    <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={2}>
                      {all ? productName : m.reason || k.label}
                    </Text>
                    <Text style={[type.caption, tabular, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
                      {all ? [m.reason && m.reason !== k.label ? m.reason : k.label, formatWhen(m.created_at)].join(" · ") : `${k.label} · ${formatWhen(m.created_at)}`}
                    </Text>
                  </View>
                  <View style={[styles.pill, { backgroundColor: k.bg }]}>
                    <Text style={[type.callout, tabular, { color: k.fg, fontWeight: "700" }]} numberOfLines={1}>
                      {`${k.sign}${shown(m)}`}
                    </Text>
                  </View>
                </Row>
              );
            })}
            {hasMore ? (
              <View style={[styles.more, { borderTopColor: colors.border }]}>
                {moreError ? <Text style={[type.caption, { color: colors.error, textAlign: "center" }]}>Devamı okunamadı.</Text> : null}
                <Button testID="stock-movements-more" label="Daha fazla göster" variant="ghost" size="sm" busy={loadingMore} onPress={loadMore} />
              </View>
            ) : null}
          </>
        )}
      </Card>
      {state === "ready" && items.some((m) => m.movement_type === "adjustment") ? (
        <Text style={[type.caption, styles.hint, { color: colors.textTertiary }]}>
          "=" ile gösterilen satırlarda rakam, stoğun ayarlandığı yeni değerdir.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginHorizontal: spacing.lg, overflow: "hidden" },
  center: { minHeight: 96, alignItems: "center", justifyContent: "center", gap: spacing.xs, padding: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 60, paddingVertical: spacing.sm, paddingRight: spacing.md, paddingLeft: spacing.md },
  stripe: { position: "absolute", left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2 },
  tile: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  tileSign: { fontSize: 18, fontWeight: "800", lineHeight: 22 },
  body: { flex: 1, minWidth: 0 },
  pill: { flexShrink: 0, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  more: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.xs, alignItems: "center", gap: 2 },
  hint: { marginHorizontal: spacing.lg, marginTop: spacing.xs },
});
