// Sipariş detayı → Yurtiçi Kargo: gönderi oluştur / iptal et / etiket (PDF paylaşılır). Yalnız Yurtiçi bağlıysa görünür
// (GET /yurtici/config). Yetki: oluştur/iptal Satış ya da Ayarlar düzenleme, etiket görüntüleme. Kurallar: src/yurtici.ts.
import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useAuth } from "../../auth/AuthProvider";
import { canAccess, canManage } from "../../auth/permissions";
import { request } from "../../api";
import { actions, cancelRequested, labelBody, labelFile, orderBody, resultText } from "../../yurtici";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, spacing, type } from "../../theme/tokens";
import { Button } from "../../ui/Button";
import { useFeedback } from "../../ui/Feedback";
import { Card, SectionTitle } from "../../ui/ListRow";
import { PrinterIcon, TruckIcon } from "../Icons";

export function YurticiCard({ order, onChanged }: { order: any; onChanged: () => void }) {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState<"" | "create" | "cancel" | "label">("");
  const [note, setNote] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const op = useRef(false);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    request<any>("/yurtici/config", { method: "GET" }, token)
      .then((r) => alive && setConnected(Boolean(r?.configured)))
      .catch(() => alive && setConnected(false));
    return () => {
      alive = false;
    };
  }, [token]);

  const canEdit = canManage(user, "orders") || canManage(user, "settings");
  const canView = canEdit || canAccess(user, "orders") || canAccess(user, "settings");
  const a = actions(order, { connected, canEdit, canView });
  // Pazaryerinin kendi kargosuyla giden siparişte hiçbir Yurtiçi eylemi yoktur; kart gösterilmez.
  if (!connected || (!a.create && !a.cancel && !a.label && !a.blockReason) || a.blockReason === "pazaryerinin kendi kargosuyla gider") return null;

  const run = async (kind: "create" | "cancel") => {
    if (!token || op.current) return;
    if (kind === "cancel") {
      const ok = await confirm({
        title: "Yurtiçi gönderisi iptal edilsin mi?",
        message: "Gönderi Yurtiçi Kargo'da iptal edilir ve takip numarası siparişten kaldırılır. Gerekirse sonra yeni gönderi oluşturabilirsiniz.",
        confirmLabel: "İptal et",
        destructive: true,
      });
      if (!ok) return;
    }
    op.current = true;
    setBusy(kind);
    setNote(null);
    try {
      const res = await request<any>(kind === "create" ? "/yurtici/shipments" : "/yurtici/shipments/cancel", { method: "POST", body: JSON.stringify(orderBody(order.id)) }, token);
      const r = resultText(res, kind === "create" ? "Yurtiçi gönderisi oluşturuldu." : "Yurtiçi gönderisi iptal edildi.");
      setNote(r);
      toast(r.text, r.kind);
      onChanged();
    } catch (e: any) {
      const text = e?.message || "İşlem tamamlanamadı. Biraz sonra yeniden deneyin.";
      setNote({ kind: "error", text });
      toast(text, "error");
    } finally {
      op.current = false;
      setBusy("");
    }
  };
  const label = async () => {
    if (!token || op.current) return;
    op.current = true;
    setBusy("label");
    try {
      const f = labelFile(await request<any>("/yurtici/labels", { method: "POST", body: JSON.stringify(labelBody(order.id, "pdf")) }, token));
      if (!f.ok) return toast(f.text, "error");
      if (f.kind !== "pdf") return;
      if (Platform.OS === "web") return toast("Etiket PDF'i telefonda paylaşılır.", "info");
      const safe = f.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
      const path = `${FileSystem.cacheDirectory}${safe.endsWith(".pdf") ? safe : `${safe}.pdf`}`;
      await FileSystem.writeAsStringAsync(path, f.base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: "application/pdf", dialogTitle: "Yurtiçi etiketi", UTI: "com.adobe.pdf" });
    } catch (e: any) {
      toast(e?.message || "Etiket üretilemedi.", "error");
    } finally {
      op.current = false;
      setBusy("");
    }
  };

  const noteBg = note ? { success: colors.successBg, error: colors.errorBg, info: colors.warningBg }[note.kind] : undefined;
  return (
    <View testID="yurtici-card">
      <SectionTitle title="Yurtiçi Kargo" />
      <Card style={styles.block}>
        <View style={styles.body}>
          {a.blockReason ? (
            <Text style={[type.footnote, { color: colors.textSecondary }]}>{`Yurtiçi gönderisi açılamaz: ${a.blockReason}.`}</Text>
          ) : cancelRequested(order) ? (
            <Text style={[type.footnote, { color: colors.textSecondary }]}>İptal istendi ancak Yurtiçi'de doğrulanamadı. İptali yeniden deneyebilirsiniz.</Text>
          ) : a.label ? (
            <Text style={[type.footnote, { color: colors.textSecondary }]}>{`Gönderi oluşturuldu · takip no ${order.cargo_tracking}`}</Text>
          ) : (
            <Text style={[type.footnote, { color: colors.textSecondary }]}>Bu sipariş için Yurtiçi Kargo gönderisi oluşturabilirsiniz.</Text>
          )}
          <View style={styles.actions}>
            {a.create ? (
              <Button testID="yurtici-create" size="sm" label="Gönderi oluştur" icon={<TruckIcon size={14} color="#FFFFFF" />} busy={busy === "create"} disabled={Boolean(busy)} onPress={() => run("create")} />
            ) : null}
            {a.label ? (
              <Button testID="yurtici-label" size="sm" variant="secondary" label="Etiket (PDF)" icon={<PrinterIcon size={14} color={colors.textPrimary} />} busy={busy === "label"} disabled={Boolean(busy)} onPress={label} />
            ) : null}
            {a.cancel ? (
              <Button testID="yurtici-cancel" size="sm" variant="ghost" label={cancelRequested(order) ? "İptali yeniden dene" : "Gönderiyi iptal et"} busy={busy === "cancel"} disabled={Boolean(busy)} onPress={() => run("cancel")} />
            ) : null}
          </View>
          {note ? (
            <View testID="yurtici-note" style={[styles.note, { backgroundColor: noteBg }]} accessibilityRole={note.kind === "error" ? "alert" : undefined}>
              <Text style={[type.footnote, { color: note.kind === "error" ? colors.error : colors.textPrimary }]}>{note.text}</Text>
            </View>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginHorizontal: spacing.lg },
  body: { padding: spacing.md, gap: spacing.sm },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  note: { borderRadius: radius.md, padding: spacing.sm },
});
