// Amazon stok gönderimi (yalnız FBM) kartı — web: frontend/src/components/integrations/AmazonStockPushCard.jsx.
// GET /amazon/{id}/stock-push: yetki bloğu (24 saat sonra yeniden denenir), ilk eşitleme onayı bekleyen ve gönderilen ürün sayıları.
// POST .../approve-first-sync → {pending}: onay o an listelenen ürünlere (ürün+SKU) bağlıdır; Stok düzenleme yetkisi ister.
// Görme: Stok ya da Ayarlar görme izni (sunucu team_access). Kurallar ve metinler: src/amazon-stock-push.ts.
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { canAccess, canManage } from "../../auth/permissions";
import { request } from "../../api";
import { approveText, storePushView } from "../../amazon-stock-push";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, spacing, type } from "../../theme/tokens";
import { Button } from "../../ui/Button";
import { useFeedback } from "../../ui/Feedback";
import { Card, SectionTitle } from "../../ui/ListRow";

export function AmazonStockPushCard({ integration }: { integration: any }) {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const id = String(integration?.id || "");
  const isAmazon = String(integration?.provider || "").toLowerCase() === "amazon";
  const visible = isAmazon && Boolean(id) && (canAccess(user, "inventory") || canAccess(user, "settings"));
  const canApprove = canManage(user, "inventory");
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token || !visible) return;
    try {
      setStatus(await request<any>(`/amazon/${encodeURIComponent(id)}/stock-push`, { method: "GET" }, token));
    } catch {
      setStatus(null); // okunamazsa kart açıklama + entegrasyon kaydındaki blokla kalır
    }
  }, [token, visible, id]);
  useEffect(() => {
    load();
  }, [load]);
  if (!visible) return null;

  const v = storePushView(status, integration?.stock_push_block);
  const approve = async () => {
    if (!token || busy) return;
    const ok = await confirm({ title: "ObiHub stoğu gönderilsin mi?", message: v.confirmText, confirmLabel: "Evet, gönder" });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await request<any>(`/amazon/${encodeURIComponent(id)}/stock-push/approve-first-sync`, { method: "POST", body: "{}" }, token);
      toast(approveText(res, v.review), "success");
      await load();
    } catch (e: any) {
      toast(e?.message || "Onay kaydedilemedi.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View testID="amazon-stock-push-card">
      <SectionTitle title="Stok gönderimi" />
      <Card style={styles.block}>
        <View style={styles.body}>
          <Text style={[type.caption, { color: colors.textSecondary }]}>
            ObiHub, satılabilir stoğu yalnız satıcı gönderimli (FBM) Amazon ürünlerine gönderir. Amazon deposundaki (FBA) ürünlere ve gönderim türü belli olmayan ilanlara stok yazılmaz; fiyat Amazon'a gönderilmez.
          </Text>
          {v.block ? (
            <View testID="amazon-stock-push-block" accessibilityRole="alert" style={[styles.box, { backgroundColor: colors.warningBg }]}>
              <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>Stok gönderimi durdu</Text>
              <Text style={[type.caption, { color: colors.textPrimary }]}>{v.block.message}</Text>
              {v.block.retry ? <Text style={[type.caption, { color: colors.textSecondary }]}>{v.block.retry}</Text> : null}
            </View>
          ) : null}
          {v.review > 0 ? (
            <View testID="amazon-first-sync" style={[styles.box, { backgroundColor: colors.infoBg }]}>
              <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>{v.reviewTitle}</Text>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                Bu ürünlerde ObiHub'daki satılabilir stok 0, Amazon'da ise stok var ya da miktar okunamadı. Onaylamadan Amazon'daki stoklarına dokunulmaz.
              </Text>
              {canApprove ? (
                <Button testID="amazon-first-sync-start" size="sm" variant="secondary" label="ObiHub stoğunu gönder" busy={busy} onPress={approve} style={{ alignSelf: "flex-start", marginTop: spacing.xs }} />
              ) : (
                <Text style={[type.caption, { color: colors.textTertiary }]}>Onay için stok düzenleme yetkisi gerekir.</Text>
              )}
            </View>
          ) : null}
          {v.sendingText ? (
            <Text testID="amazon-first-sync-sending" style={[type.caption, { color: colors.textSecondary }]}>
              {v.sendingText}
            </Text>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginHorizontal: spacing.lg },
  body: { padding: spacing.md, gap: spacing.sm },
  box: { borderRadius: radius.md, padding: spacing.sm, gap: 4 },
});
