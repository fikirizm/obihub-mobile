// Kısa bildirim (toast) ve onay alt sayfası. Sistem uyarı kutularının yerini alır.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from "react-native";
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

type FeedbackValue = {
  toast: (message: string, kind?: ToastKind) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackValue | undefined>(undefined);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const [toastState, setToastState] = useState<{ id: number; message: string; kind: ToastKind } | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
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

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);
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
  grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: spacing.md },
});
