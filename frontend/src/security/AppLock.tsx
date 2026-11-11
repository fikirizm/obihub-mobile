// Biyometrik uygulama kilidi. Açıkken uygulama her açılışta ve arka planda bir süre kaldıktan sonra
// Face ID / parmak izi ister. Web'de desteklenmez.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, StyleSheet, Text, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { useAuth } from "../auth/AuthProvider";
import * as Storage from "../storage";
import { useTheme } from "../theme/ThemeProvider";
import { spacing, type } from "../theme/tokens";
import { Button } from "../ui/Button";

const STORAGE_KEY = "obihub_app_lock";
const RELOCK_AFTER_MS = 60 * 1000;

type AppLockValue = {
  supported: boolean;
  enabled: boolean;
  setEnabled: (v: boolean) => Promise<boolean>;
};

const AppLockContext = createContext<AppLockValue | undefined>(undefined);

async function authenticate(prompt: string) {
  try {
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, cancelLabel: "Vazgeç" });
    return res.success;
  } catch {
    return false;
  }
}

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { token, logout } = useAuth();
  const { colors } = useTheme();
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabledState] = useState(false);
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let ok = false;
      if (Platform.OS !== "web") {
        try {
          ok = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
        } catch {
          ok = false;
        }
      }
      const saved = await Storage.getItemAsync(STORAGE_KEY).catch(() => null);
      if (cancelled) return;
      setSupported(ok);
      const on = ok && saved === "1";
      setEnabledState(on);
      setLocked(on);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const unlock = useCallback(async () => {
    if (await authenticate("ObiHub kilidini aç")) setLocked(false);
  }, []);

  // Kilitlendiğinde doğrulamayı kendiliğinden iste.
  useEffect(() => {
    if (ready && locked && token) unlock();
  }, [ready, locked, token, unlock]);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        backgroundedAt.current = Date.now();
      } else if (state === "active" && backgroundedAt.current) {
        if (Date.now() - backgroundedAt.current > RELOCK_AFTER_MS) setLocked(true);
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, [enabled]);

  const setEnabled = useCallback(
    async (v: boolean) => {
      if (!supported) return false;
      // Açarken de kapatırken de kimlik doğrulanır.
      if (!(await authenticate(v ? "Uygulama kilidini aç" : "Uygulama kilidini kapat"))) return false;
      setEnabledState(v);
      await Storage.setItemAsync(STORAGE_KEY, v ? "1" : "0");
      return true;
    },
    [supported]
  );

  const value = useMemo(() => ({ supported, enabled, setEnabled }), [supported, enabled, setEnabled]);
  const showLock = Boolean(token) && enabled && locked;

  return (
    <AppLockContext.Provider value={value}>
      {children}
      {showLock ? (
        <View testID="app-lock" accessibilityViewIsModal style={[StyleSheet.absoluteFill, styles.wrap, { backgroundColor: colors.background }]}>
          <Text accessibilityRole="header" style={[type.title, { color: colors.textPrimary, textAlign: "center" }]}>
            ObiHub kilitli
          </Text>
          <Text style={[type.body, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xs }]}>
            Devam etmek için kimliğinizi doğrulayın.
          </Text>
          <Button label="Kilidi aç" onPress={unlock} style={{ alignSelf: "stretch", marginTop: spacing.xl }} testID="app-lock-unlock" />
          <Button label="Çıkış yap" variant="secondary" onPress={() => logout()} style={{ alignSelf: "stretch", marginTop: spacing.xs }} />
        </View>
      ) : null}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error("useAppLock must be used inside AppLockProvider");
  return ctx;
}

const styles = StyleSheet.create({ wrap: { alignItems: "center", justifyContent: "center", padding: spacing.xl } });
