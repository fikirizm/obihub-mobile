// Gider faturası silme / arşivleme penceresi (Paraşüt "Kayıt silinemiyor ve arşivlenemiyor"). Web: DeleteBlockedDialog +
// ExpenseLifecycleDialog. Önce delete-check; engel varsa tüm sebepler (varsa eylem düğmesi), yoksa onay. İşlem 409 dönerse kontrol
// yeniden çağrılır ve aynı engel penceresi çizilir; kontrol yine izin verirse "hâlâ işleniyor" yazılır (onay döngüsü yok).
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { checkExpenseLifecycle, runExpenseLifecycle } from "../api-gider";
import { after409, checkErrorText, dialogModel, runErrorText, STILL_PROCESSING, type GuardAction, type ReasonTarget, type Verdict } from "../delete-guard";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, type } from "../theme/tokens";
import { Button } from "../ui/Button";
import { AlertIcon } from "./Icons";

export function DeleteGuardSheet({
  token,
  id,
  action,
  payableRef,
  onClose,
  onDone,
  onReason,
}: {
  token: string;
  id: string;
  action: GuardAction | null;
  payableRef?: string | null;
  onClose: () => void;
  onDone: (action: GuardAction) => void;
  onReason?: (target: NonNullable<ReasonTarget>) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const check = useCallback(async (): Promise<Verdict | null> => {
    if (!action) return null;
    try {
      const v = await checkExpenseLifecycle(token, id, action);
      setVerdict(v);
      setStatus("ready");
      return v;
    } catch (e: any) {
      setMessage(checkErrorText(e));
      setStatus("error");
      return null;
    }
  }, [token, id, action]);

  useEffect(() => {
    if (!action) return;
    setStatus("loading");
    setVerdict(null);
    setError("");
    setBusy(false);
    check();
  }, [action, check]);

  if (!action) return null;
  const close = () => {
    if (!busy) onClose();
  };
  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await runExpenseLifecycle(token, id, action);
      onDone(action);
    } catch (e: any) {
      setBusy(false);
      if (Number(e?.status) === 409) {
        setStatus("loading");
        const v = await check();
        if (after409(v) === "processing") setError(STILL_PROCESSING);
        return;
      }
      setError(runErrorText(e, action));
    }
  };
  const model = status === "ready" && verdict ? dialogModel(verdict, action, payableRef) : null;
  const title = model ? model.title : status === "error" ? "İşlem kontrol edilemedi" : "Kontrol ediliyor";

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.overlay }]} onPress={close} accessibilityLabel="Kapat" />
      <View style={styles.end} pointerEvents="box-none">
        <View testID="delete-guard-sheet" accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md }]}>
          <Text testID="delete-guard-title" accessibilityRole="header" style={[type.title, { color: colors.textPrimary }]}>
            {title}
          </Text>
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: spacing.sm }}>
            {status === "loading" ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primary} /> : null}
            {status === "error" ? <Text style={[type.callout, { color: colors.textSecondary }]}>{message}</Text> : null}
            {model?.mode === "blocked" ? (
              <>
                {model.detail ? <Text style={[type.callout, { color: colors.textSecondary }]}>{model.detail}</Text> : null}
                <View testID="delete-guard-reasons" style={{ gap: spacing.sm }}>
                  {model.reasons.map((r) => (
                    <View key={r.code || r.message} style={[styles.reason, { backgroundColor: colors.warningBg }]}>
                      <AlertIcon size={16} color={colors.warning} />
                      <View style={{ flex: 1, gap: spacing.xs }}>
                        <Text style={[type.callout, { color: colors.textPrimary }]}>{r.message}</Text>
                        {r.target && onReason ? (
                          <Pressable testID={`delete-guard-act-${r.code}`} accessibilityRole="link" onPress={() => onReason(r.target!)} hitSlop={8}>
                            <Text style={[type.callout, { color: colors.primary, fontWeight: "600" }]}>{r.target.label}</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
            {model?.mode === "confirm" ? (
              <>
                {model.message ? <Text style={[type.callout, { color: colors.textSecondary }]}>{model.message}</Text> : null}
                {model.warnings.map((w) => (
                  <View key={w} style={[styles.reason, { backgroundColor: colors.infoBg }]}>
                    <AlertIcon size={16} color={colors.info} />
                    <Text style={[type.callout, { color: colors.textPrimary, flex: 1 }]}>{w}</Text>
                  </View>
                ))}
              </>
            ) : null}
            {error ? (
              <Text testID="delete-guard-error" style={[type.callout, { color: colors.error }]}>
                {error}
              </Text>
            ) : null}
          </ScrollView>
          {model?.mode === "confirm" ? (
            <View style={styles.row}>
              <Button variant="ghost" label="Vazgeç" disabled={busy} onPress={close} style={{ flex: 1 }} />
              <Button testID="delete-guard-confirm" variant={model.destructive ? "destructive" : "primary"} label={model.button} busy={busy} onPress={run} style={{ flex: 1 }} />
            </View>
          ) : status === "error" ? (
            <View style={styles.row}>
              <Button variant="ghost" label="Kapat" onPress={close} style={{ flex: 1 }} />
              <Button label="Tekrar dene" onPress={() => { setStatus("loading"); check(); }} style={{ flex: 1 }} />
            </View>
          ) : (
            <Button testID="delete-guard-close" label={model ? "Tamam" : "Kapat"} variant={model ? "primary" : "ghost"} onPress={close} />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  end: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: spacing.lg, gap: spacing.md },
  reason: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md },
  row: { flexDirection: "row", gap: spacing.sm },
});
