// Kısa bildirim (toast) ve onay alt sayfası. Sistem uyarı kutularının yerini alır.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown, SlideInDown, SlideOutDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, type } from "../theme/tokens";
import { Button } from "./Button";

type ToastKind = "success" | "error" | "info";
type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type NumberPromptOptions = {
  title: string;
  message?: string;
  initial: number;
  decimal?: boolean;
  suffix?: string;
  confirmLabel?: string;
  // Verilirse tutarın altında açıklama alanı gösterilir.
  noteLabel?: string;
};

type ChooseOptions<T extends string> = { title: string; message?: string; options: { value: T; label: string }[] };

type FeedbackValue = {
  toast: (message: string, kind?: ToastKind) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  // Sayı ister; vazgeçilirse null döner.
  promptNumber: (options: NumberPromptOptions) => Promise<number | null>;
  // Tutar ve açıklama ister; vazgeçilirse null döner.
  promptEntry: (options: NumberPromptOptions) => Promise<{ amount: number; note: string } | null>;
  // Seçeneklerden birini seçtirir; vazgeçilirse null döner.
  choose: <T extends string>(options: ChooseOptions<T>) => Promise<T | null>;
};

const FeedbackContext = createContext<FeedbackValue | undefined>(undefined);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const [toastState, setToastState] = useState<{ id: number; message: string; kind: ToastKind } | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const [numberState, setNumberState] = useState<NumberPromptOptions | null>(null);
  const [numberText, setNumberText] = useState("");
  const numberResolver = useRef<((v: number | null) => void) | null>(null);
  const [noteText, setNoteText] = useState("");
  const noteRef = useRef("");
  const [chooseState, setChooseState] = useState<ChooseOptions<string> | null>(null);
  const chooseResolver = useRef<((v: string | null) => void) | null>(null);

  const choose = useCallback(<T extends string>(options: ChooseOptions<T>) => {
    return new Promise<T | null>((resolve) => {
      chooseResolver.current?.(null);
      chooseResolver.current = resolve as (v: string | null) => void;
      setChooseState(options as ChooseOptions<string>);
    });
  }, []);

  const settleChoice = useCallback((value: string | null) => {
    chooseResolver.current?.(value);
    chooseResolver.current = null;
    setChooseState(null);
  }, []);

  const promptNumber = useCallback((options: NumberPromptOptions) => {
    return new Promise<number | null>((resolve) => {
      numberResolver.current?.(null);
      numberResolver.current = resolve;
      setNumberText(options.decimal ? (options.initial ? options.initial.toFixed(2).replace(".", ",") : "") : String(Math.round(options.initial)));
      setNoteText("");
      noteRef.current = "";
      setNumberState(options);
    });
  }, []);

  const promptEntry = useCallback(
    async (options: NumberPromptOptions) => {
      const amount = await promptNumber({ ...options, noteLabel: options.noteLabel || "Açıklama" });
      if (amount === null) return null;
      return { amount, note: noteRef.current.trim() };
    },
    [promptNumber]
  );

  const parsedNumber = (() => {
    const n = Number(numberText.replace(/\./g, "").replace(",", "."));
    if (numberText.trim() === "" || !Number.isFinite(n) || n < 0) return null;
    return numberState?.decimal ? Math.round(n * 100) / 100 : Math.round(n);
  })();

  const settleNumber = useCallback((value: number | null) => {
    numberResolver.current?.(value);
    numberResolver.current = null;
    setNumberState(null);
  }, []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToastState({ id: Date.now(), message, kind });
    AccessibilityInfo.announceForAccessibility?.(message);
    if (kind === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (kind === "error") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    timer.current = setTimeout(() => setToastState(null), kind === "error" ? 4500 : 2800);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolver.current?.(false);
      resolver.current = resolve;
      setConfirmState(options);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setConfirmState(null);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const value = useMemo(
    () => ({ toast, confirm, promptNumber, promptEntry, choose }),
    [toast, confirm, promptNumber, promptEntry, choose]
  );
  const toastColor = toastState?.kind === "success" ? colors.success : toastState?.kind === "error" ? colors.error : colors.textPrimary;

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {toastState ? (
        <Animated.View
          key={toastState.id}
          entering={FadeInDown.duration(180)}
          exiting={FadeOutDown.duration(160)}
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[styles.toastWrap, { bottom: insets.bottom + 84 }]}
        >
          <View testID="toast" style={[styles.toast, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }, shadows.lg]}>
            <View style={[styles.toastDot, { backgroundColor: toastColor }]} />
            <Text style={[type.callout, { color: colors.textPrimary, flex: 1 }]}>{toastState.message}</Text>
          </View>
        </Animated.View>
      ) : null}
      <Modal visible={Boolean(confirmState)} transparent animationType="fade" onRequestClose={() => settle(false)} statusBarTranslucent>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => settle(false)} accessibilityLabel="Kapat" />
        {confirmState ? (
          <Animated.View
            entering={SlideInDown.duration(220)}
            exiting={SlideOutDown.duration(180)}
            testID="confirm-sheet"
            accessibilityViewIsModal
            style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md }]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <Text accessibilityRole="header" style={[type.title, { color: colors.textPrimary, textAlign: "center" }]}>
              {confirmState.title}
            </Text>
            {confirmState.message ? (
              <Text style={[type.body, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xs }]}>{confirmState.message}</Text>
            ) : null}
            <Button
              testID="confirm-accept"
              label={confirmState.confirmLabel || "Onayla"}
              variant={confirmState.destructive ? "destructive" : "primary"}
              onPress={() => settle(true)}
              style={{ marginTop: spacing.lg }}
            />
            <Button testID="confirm-cancel" label={confirmState.cancelLabel || "Vazgeç"} variant="secondary" onPress={() => settle(false)} style={{ marginTop: spacing.xs }} />
          </Animated.View>
        ) : null}
      </Modal>
      <Modal visible={Boolean(numberState)} transparent animationType="fade" onRequestClose={() => settleNumber(null)} statusBarTranslucent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => settleNumber(null)} accessibilityLabel="Kapat" />
          {numberState ? (
            <Animated.View
              entering={SlideInDown.duration(220)}
              exiting={SlideOutDown.duration(180)}
              testID="number-sheet"
              accessibilityViewIsModal
              style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md }]}
            >
              <View style={[styles.grabber, { backgroundColor: colors.border }]} />
              <Text accessibilityRole="header" style={[type.title, { color: colors.textPrimary, textAlign: "center" }]}>
                {numberState.title}
              </Text>
              {numberState.message ? (
                <Text style={[type.body, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xs }]}>{numberState.message}</Text>
              ) : null}
              <View style={[styles.numberWrap, { borderColor: colors.primary, backgroundColor: colors.surfaceMuted }]}>
                <TextInput
                  testID="number-input"
                  value={numberText}
                  onChangeText={(t) => setNumberText(t.replace(numberState.decimal ? /[^0-9.,]/g : /[^0-9]/g, ""))}
                  keyboardType={numberState.decimal ? "decimal-pad" : "number-pad"}
                  autoFocus
                  selectTextOnFocus
                  accessibilityLabel={numberState.title}
                  style={[styles.numberInput, { color: colors.textPrimary }]}
                />
                {numberState.suffix ? <Text style={[type.headline, { color: colors.textTertiary }]}>{numberState.suffix}</Text> : null}
              </View>
              {numberState.noteLabel ? (
                <TextInput
                  testID="number-note"
                  value={noteText}
                  onChangeText={(t) => {
                    setNoteText(t);
                    noteRef.current = t;
                  }}
                  placeholder={numberState.noteLabel}
                  placeholderTextColor={colors.textTertiary}
                  accessibilityLabel={numberState.noteLabel}
                  maxLength={140}
                  style={[styles.noteInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
                />
              ) : null}
              <Button
                testID="number-accept"
                label={numberState.confirmLabel || "Kaydet"}
                disabled={parsedNumber === null}
                onPress={() => settleNumber(parsedNumber)}
                style={{ marginTop: spacing.lg }}
              />
              <Button testID="number-cancel" label="Vazgeç" variant="secondary" onPress={() => settleNumber(null)} style={{ marginTop: spacing.xs }} />
            </Animated.View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={Boolean(chooseState)} transparent animationType="fade" onRequestClose={() => settleChoice(null)} statusBarTranslucent>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => settleChoice(null)} accessibilityLabel="Kapat" />
        {chooseState ? (
          <Animated.View
            entering={SlideInDown.duration(220)}
            exiting={SlideOutDown.duration(180)}
            testID="choose-sheet"
            accessibilityViewIsModal
            style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md }]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <Text accessibilityRole="header" style={[type.title, { color: colors.textPrimary, textAlign: "center" }]}>
              {chooseState.title}
            </Text>
            {chooseState.message ? (
              <Text style={[type.body, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xs }]}>{chooseState.message}</Text>
            ) : null}
            <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
              {chooseState.options.map((o) => (
                <Button key={o.value} testID={`choose-${o.value}`} label={o.label} variant="secondary" onPress={() => settleChoice(o.value)} />
              ))}
            </View>
            <Button testID="choose-cancel" label="Vazgeç" variant="ghost" onPress={() => settleChoice(null)} style={{ marginTop: spacing.xs }} />
          </Animated.View>
        ) : null}
      </Modal>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used inside FeedbackProvider");
  return ctx;
}

const styles = StyleSheet.create({
  toastWrap: { position: "absolute", left: spacing.lg, right: spacing.lg, alignItems: "center" },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    maxWidth: 480,
    width: "100%",
  },
  toastDot: { width: 8, height: 8, borderRadius: 4 },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  numberWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
    height: 60,
  },
  numberInput: { flex: 1, fontSize: 26, fontWeight: "700", fontVariant: ["tabular-nums"], paddingVertical: 0, height: 60 },
  noteInput: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 48, fontSize: 15, marginTop: spacing.sm },
  grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: spacing.md },
});
