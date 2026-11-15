// D-17: ticari faturaya Kabul et / Reddet onay penceresi (web IncomingWorkflow.RespondDialog). Yanıt GİB'e gider ve geri alınamaz:
// açık onay kutusu işaretlenmeden gönderilmez; reddetmede gerekçe zorunlu (en çok 500). Hata pencerede gösterilir, pencere açık kalır.
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { REASON_MAX, RESPOND_COPY, RESPOND_WARNING, respondBody } from "../inbox-ui";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, type } from "../theme/tokens";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { CheckIcon } from "./Icons";
import { PressableScale } from "./KPICard";

export function RespondSheet({
  decision,
  subtitle,
  onClose,
  onSubmit,
}: {
  decision: "accept" | "reject" | null;
  subtitle?: string;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setReason("");
    setOk(false);
    setBusy(false);
    setError("");
  }, [decision]);
  if (!decision) return null;
  const c = RESPOND_COPY[decision];
  const reject = decision === "reject";
  const check = respondBody(decision, reason, ok);
  const submit = async () => {
    if (busy || !check.body) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(check.body);
    } catch (e: any) {
      setError(e?.message || "Yanıt gönderilemedi.");
      setBusy(false);
    }
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={busy ? undefined : onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.overlay }]} onPress={busy ? undefined : onClose} accessibilityLabel="Kapat" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.end} pointerEvents="box-none">
        <View testID="respond-sheet" accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md }]}>
          <Text accessibilityRole="header" style={[type.title, { color: colors.textPrimary }]}>
            {c.title}
          </Text>
          {subtitle ? <Text style={[type.caption, { color: colors.textTertiary }]}>{subtitle}</Text> : null}
          <View style={[styles.warn, { backgroundColor: colors.warningBg }]}>
            <Text style={[type.footnote, { color: colors.textPrimary, fontWeight: "600" }]}>{RESPOND_WARNING}</Text>
          </View>
          {reject ? (
            <FormField
              testID="respond-reason"
              label="Red gerekçesi"
              value={reason}
              onChangeText={setReason}
              placeholder="Tedarikçiye iletilecek gerekçe"
              multiline
              maxLength={REASON_MAX + 50}
              hint={`${reason.trim().length}/${REASON_MAX}`}
              error={reason.trim().length > REASON_MAX ? `Gerekçe en çok ${REASON_MAX} karakter olabilir.` : undefined}
            />
          ) : null}
          <PressableScale testID="respond-check" accessibilityRole="checkbox" accessibilityState={{ checked: ok }} onPress={() => setOk(!ok)} style={styles.checkRow}>
            <View style={[styles.box, { borderColor: ok ? colors.primary : colors.border, backgroundColor: ok ? colors.primary : colors.surface }]}>{ok ? <CheckIcon size={14} color="#FFFFFF" /> : null}</View>
            <Text style={[type.callout, { color: colors.textPrimary, flex: 1 }]}>{c.check}</Text>
          </PressableScale>
          {error ? (
            <Text testID="respond-error" style={[type.footnote, { color: colors.error }]}>
              {error}
            </Text>
          ) : null}
          <Button testID="respond-confirm" label={busy ? "Gönderiliyor…" : c.confirm} variant={reject ? "destructive" : "primary"} busy={busy} disabled={!check.body} onPress={submit} />
          <Button label="Vazgeç" variant="secondary" disabled={busy} onPress={onClose} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  end: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, gap: spacing.sm },
  warn: { padding: spacing.sm, borderRadius: radius.md },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 4 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
