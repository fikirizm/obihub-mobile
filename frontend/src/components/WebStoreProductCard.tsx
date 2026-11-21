// Faz A M10: ürünün ObiHub web sitesi durumu (GET /settings/website/integration/products/{id}) ve tek ürün gönderme
// (POST /settings/website/integration/publish {product_ids:[id], all:false}; web NativeStoreProductPanel.jsx ile aynı).
// Web sitesi bağlı değilse ya da okuma yetkisi yoksa kart görünmez. Hazırlanırken 5 sn'de bir yenilenir.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { request } from "../api";
import { isBusyState, pushLabel, webStatusLabel, webStatusTone } from "../product-text";
import { useTheme } from "../theme/ThemeProvider";
import { spacing, type } from "../theme/tokens";
import { Button } from "../ui/Button";
import { useFeedback } from "../ui/Feedback";
import { Card, SectionTitle } from "../ui/ListRow";
import { PlatformLogo } from "./PlatformLogo";
import { StatusBadge } from "./StatusBadge";

export function WebStoreProductCard({ token, productId, canPush }: { token: string; productId: string; canPush: boolean }) {
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const op = useRef(false);
  const load = useCallback(async () => {
    try {
      setD(await request<any>(`/settings/website/integration/products/${encodeURIComponent(productId)}`, { method: "GET" }, token));
    } catch {
      setD(null);
    }
  }, [token, productId]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!isBusyState(d)) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [d, load]);

  if (!d || !d.connected) return null;
  const send = async () => {
    if (op.current) return;
    op.current = true;
    setBusy(true);
    try {
      await request<any>("/settings/website/integration/publish", { method: "POST", body: JSON.stringify({ product_ids: [productId], all: false }) }, token);
      toast("Ürün mağazayla eşleştirildi. Yayın durumu güncelleniyor.", "success");
      await load();
    } catch (e: any) {
      toast(e?.message && !/^Sunucu hatası/.test(e.message) ? e.message : "Ürün gönderilemedi.", "error");
    } finally {
      op.current = false;
      setBusy(false);
    }
  };
  const tone = webStatusTone(d);
  return (
    <View>
      <SectionTitle title="ObiHub Web Sitesi" />
      <Card padded style={styles.block}>
        <View style={styles.head}>
          <PlatformLogo provider="website" size="sm" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>{d.domain || "Web mağaza"}</Text>
            <Text style={[type.caption, { color: colors.textTertiary }]}>{d.matched ? "Eşleşti" : "Eşleşmedi"}</Text>
          </View>
          <StatusBadge label={webStatusLabel(d)} kind={tone === "neutral" ? "info" : tone} size="sm" />
        </View>
        {d.reason ? <Text style={[type.footnote, { color: colors.textSecondary, marginTop: spacing.sm }]}>{d.reason}</Text> : null}
        <Text style={[type.caption, { color: colors.textTertiary, marginTop: spacing.sm }]}>Fiyat, kategori ve stok ObiHub ürün kartınızdan alınır. Tekrar göndermek aynı ürünü günceller.</Text>
        <View style={[styles.actions, { marginTop: spacing.md }]}>
          {canPush ? <Button testID="web-store-push" size="sm" label={pushLabel(d)} busy={busy} disabled={busy} onPress={send} style={{ flex: 1 }} /> : null}
          {d.url ? <Button size="sm" variant="secondary" label="Mağazada gör" onPress={() => Linking.openURL(String(d.url)).catch(() => undefined)} style={{ flex: 1 }} /> : null}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginHorizontal: spacing.lg },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm },
});
