import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as Storage from "../storage";
import { getMe, login as apiLogin } from "../api";
import type { User } from "../types";

type AuthContextValue = {
  token: string | null;
  user: User | null;
  bootLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = "obihub_token";
const USER_KEY = "obihub_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [bootLoading, setBootLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Hard timeout to avoid infinite boot loading on any platform edge case
    const safety = setTimeout(() => {
      if (!cancelled) setBootLoading(false);
    }, 4000);

    (async () => {
      try {
        const savedToken = await Storage.getItemAsync(TOKEN_KEY);
        const savedUserRaw = await Storage.getItemAsync(USER_KEY);
        if (cancelled) return;
        if (savedToken) {
          setToken(savedToken);
          if (savedUserRaw) {
            try {
              setUser(JSON.parse(savedUserRaw));
            } catch {}
          }
          try {
            const me = await getMe(savedToken);
            if (cancelled) return;
            setUser(me);
            await Storage.setItemAsync(USER_KEY, JSON.stringify(me));
          } catch {
            // Network-only failure (offline / temporary) shouldn't kick the user out.
            // Keep the saved session; subsequent authenticated calls will surface 401s
            // and the app can re-authenticate then.
          }
        }
      } catch {
      } finally {
        if (!cancelled) setBootLoading(false);
        clearTimeout(safety);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(safety);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email.trim(), password);
    setToken(data.access_token);
    setUser(data.user);
    await Storage.setItemAsync(TOKEN_KEY, data.access_token);
    await Storage.setItemAsync(USER_KEY, JSON.stringify(data.user));
    try {
      const me = await getMe(data.access_token);
      setUser(me);
      await Storage.setItemAsync(USER_KEY, JSON.stringify(me));
    } catch {}
  }, []);

  const logout = useCallback(async () => {
    await Storage.deleteItemAsync(TOKEN_KEY);
    await Storage.deleteItemAsync(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!token) return;
    try {
      const me = await getMe(token);
      setUser(me);
      await Storage.setItemAsync(USER_KEY, JSON.stringify(me));
    } catch {}
  }, [token]);

  const value = useMemo(
    () => ({ token, user, bootLoading, login, logout, refreshMe }),
    [token, user, bootLoading, login, logout, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
