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
  // Verilirse tutarın altında tek seçimli seçenekler gösterilir (ör. ödeme yöntemi).
  // Ayrı bir sayfa açılmaz: iOS'ta art arda iki sayfa sunulamaz.
  methods?: { value: string; label: string }[];
};

// Kullanıcının yazdığı sayıyı çözer. Virgül ondalık ayırıcıdır; virgül yoksa sondaki
// "nokta + 1-2 hane" de ondalık sayılır ("12.5" → 12,5), diğer noktalar binlik ayırıcıdır ("1.250" → 1250).
export function parseAmount(text: string, decimal: boolean): number | null {
  const raw = text.trim();
  if (!raw) return null;
  let normalized: string;
  if (raw.includes(",")) {
    if (raw.split(",").length > 2) return null;
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (decimal && /^\d+\.\d{1,2}$/.test(raw)) {
    normalized = raw;
  } else {
    normalized = raw.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return decimal ? Math.round(n * 100) / 100 : Math.round(n);
}

type ChooseOptions<T extends string> = { title: string; message?: string; options: { value: T; label: string }[] };

type FeedbackValue = {
  toast: (message: string, kind?: ToastKind) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  // Sayı ister; vazgeçilirse null döner.
  promptNumber: (options: NumberPromptOptions) => Promise<number | null>;
  // Tutar ve açıklama ister; vazgeçilirse null döner.
  promptEntry: (options: NumberPromptOptions) => Promise<{ amount: number; note: string; method: string } | null>;
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
  const freshRef = useRef(true);
  const [noteFocused, setNoteFocused] = useState(false);
  const [methodValue, setMethodValue] = useState("");
  const methodRef = useRef("");
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
      freshRef.current = true;
      setNoteFocused(false);
      const firstMethod = options.methods?.[0]?.value || "";
      setMethodValue(firstMethod);
      methodRef.current = firstMethod;
      setNumberState(options);
    });
  }, []);

  const promptEntry = useCallback(
    async (options: NumberPromptOptions) => {
      const amount = await promptNumber(options);
      if (amount === null) return null;
      return { amount, note: noteRef.current.trim(), method: methodRef.current };
    },
    [promptNumber]
  );

  const parsedNumber = numberState ? parseAmount(numberText, Boolean(numberState.decimal)) : null;

  // Gömülü tuş takımı. İlk tuş, açılışta gösterilen değerin üzerine yazar.
  const pressKey = useCallback(
    (key: string) => {
      Haptics.selectionAsync().catch(() => {});
      const decimal = Boolean(numberState?.decimal);
      setNumberText((prev) => {
        // Silme tuşu açılıştaki değeri de birer hane siler; rakam tuşları ise üzerine yazar.
        if (key === "back") {
          freshRef.current = false;
          return prev.slice(0, -1);
        }
        const base = freshRef.current ? "" : prev;
        freshRef.current = false;
        if (key === ",") {
          if (!decimal || base.includes(",")) return base;
          return base === "" ? "0," : `${base},`;
        }
        const next = base === "0" ? key : base + key;
        const [whole, frac] = next.split(",");
        if (whole.length > 9 || (frac !== undefined && frac.length > 2)) return base;
        return next;
      });
    },
    [numberState?.decimal]
  );

  // Hızlı artır/azalt (yalnızca tam sayı girişlerinde).
  const stepBy = useCallback((delta: number) => {
    Haptics.selectionAsync().catch(() => {});
    freshRef.current = false;
    setNumberText((prev) => String(Math.max(0, (parseAmount(prev, false) ?? 0) + delta)));
  }, []);

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
        {/* Sayfa akış içinde ve alta yaslıdır: klavye açılınca KeyboardAvoidingView onu klavyenin üstüne iter.
            Mutlak konumlu (bottom: 0) bir sayfa bu itmeden etkilenmez ve klavyenin altında kalır. */}
        <KeyboardAvoidingView style={styles.keyboardWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => settleNumber(null)} accessibilityLabel="Kapat" />
          {numberState ? (
            <Animated.View
              entering={SlideInDown.duration(220)}
              exiting={SlideOutDown.duration(180)}
              testID="number-sheet"
              accessibilityViewIsModal
              style={[styles.sheetInFlow, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, spacing.sm) + spacing.sm }]}
            >
              <View style={[styles.grabber, { backgroundColor: colors.border }]} />
              <Text accessibilityRole="header" style={[type.title, { color: colors.textPrimary, textAlign: "center" }]}>
                {numberState.title}
              </Text>
              {numberState.message ? (
                <Text style={[type.body, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xs }]}>{numberState.message}</Text>
              ) : null}
              <View
                testID="number-display"
                accessible
                accessibilityRole="text"
                accessibilityLabel={`${numberState.title}: ${numberText || "0"} ${numberState.suffix || ""}`}
                style={[styles.numberWrap, { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}
              >
                <Text testID="number-input" style={[styles.numberValue, { color: numberText ? colors.textPrimary : colors.textTertiary }]} numberOfLines={1} adjustsFontSizeToFit>
                  {numberText || "0"}
                </Text>
                {numberState.suffix ? <Text style={[type.headline, { color: colors.textSecondary }]}>{numberState.suffix}</Text> : null}
              </View>
              {!numberState.decimal ? (
                <View style={styles.stepRow}>
                  {[-10, -1, 1, 10].map((d) => (
                    <Pressable
                      key={d}
                      testID={`number-step-${d}`}
                      accessibilityRole="button"
                      accessibilityLabel={d > 0 ? `${d} artır` : `${Math.abs(d)} azalt`}
                      onPress={() => stepBy(d)}
                      style={({ pressed }) => [styles.stepBtn, { borderColor: colors.border, backgroundColor: pressed ? colors.backgroundElevated : colors.surface }]}
                    >
                      <Text style={[type.bodyStrong, { color: d > 0 ? colors.success : colors.error, fontVariant: ["tabular-nums"] }]}>{d > 0 ? `+${d}` : d}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {numberState.methods && numberState.methods.length > 0 ? (
                <View style={styles.methodRow} accessibilityRole="radiogroup">
                  {numberState.methods.map((m) => {
                    const active = methodValue === m.value;
                    return (
                      <Pressable
                        key={m.value}
                        testID={`method-${m.value}`}
                        accessibilityRole="radio"
                        accessibilityLabel={m.label}
                        accessibilityState={{ selected: active }}
                        hitSlop={4}
                        onPress={() => {
                          setMethodValue(m.value);
                          methodRef.current = m.value;
                        }}
                        style={[
                          styles.methodChip,
                          { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primarySoft : colors.surface },
                        ]}
                      >
                        <Text style={[type.callout, { color: active ? colors.primary : colors.textSecondary, fontWeight: "600" }]}>{m.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
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
                  onFocus={() => setNoteFocused(true)}
                  onBlur={() => setNoteFocused(false)}
                  returnKeyType="done"
                  maxLength={140}
                  style={[styles.noteInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
                />
              ) : null}
              {/* Not yazılırken sistem klavyesi açılır; yer açmak için tuş takımı gizlenir. */}
              {!noteFocused ? (
                <View style={styles.keypad}>
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", numberState.decimal ? "," : "", "0", "back"].map((k, idx) =>
                    k === "" ? (
                      <View key={`empty-${idx}`} style={styles.keyCell} />
                    ) : (
                      <View key={k} style={styles.keyCell}>
                        <Pressable
                          testID={`key-${k === "," ? "comma" : k}`}
                          accessibilityRole="button"
                          accessibilityLabel={k === "back" ? "Sil" : k === "," ? "Virgül" : k}
                          onPress={() => pressKey(k)}
                          onLongPress={k === "back" ? () => { freshRef.current = false; setNumberText(""); } : undefined}
                          style={({ pressed }) => [styles.key, { backgroundColor: pressed ? colors.border : colors.backgroundElevated }]}
                        >
                          <Text style={[styles.keyText, { color: colors.textPrimary }]}>{k === "back" ? "⌫" : k}</Text>
                        </Pressable>
                      </View>
                    )
                  )}
                </View>
              ) : null}
              {/* Düğmeler yan yana: küçük ekranlarda da sayfa sığar. */}
              <View style={styles.numberActions}>
                <Button testID="number-cancel" label="Vazgeç" variant="secondary" onPress={() => settleNumber(null)} style={{ flex: 1 }} />
                <Button
                  testID="number-accept"
                  label={numberState.confirmLabel || "Kaydet"}
                  disabled={parsedNumber === null}
                  onPress={() => settleNumber(parsedNumber)}
                  style={{ flex: 1 }}
                />
              </View>
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
  numberActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  keyboardWrap: { flex: 1, justifyContent: "flex-end" },
  sheetInFlow: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
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
    marginTop: spacing.md,
    height: 64,
  },
  numberValue: { flex: 1, fontSize: 32, fontWeight: "800", fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
  stepRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm },
  stepBtn: { flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  keypad: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.sm, marginHorizontal: -4 },
  keyCell: { width: "33.3333%", padding: 4 },
  key: { height: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  keyText: { fontSize: 24, fontWeight: "600", fontVariant: ["tabular-nums"] },
  methodRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  methodChip: { height: 40, paddingHorizontal: 14, borderRadius: 9999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  noteInput: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 48, fontSize: 15, marginTop: spacing.sm },
  grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: spacing.md },
});
