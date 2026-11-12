// Para yazan ekranların ortak davranışı (web lib/useMoneyWrite.js karşılığı).  Bir eylem = bir işlem anahtarı:
//  • başarı → anahtar yenilenir;
//  • belirsiz sonuç (ağ / 5xx / MONEY_INCOMPLETE) ya da IDEMPOTENCY_CONFLICT → alanlar KİLİTLENİR, "Yeniden gönder" AYNI anahtarı kullanır;
//  • MONEY_PENDING / OPERATION_PENDING / MONEY_PARTIAL → yeniden gönderim yok (blocked);
//  • kesin ret (4xx) → hiçbir şey yazılmadı: kilit yok, anahtar yenilenir.
import { useCallback, useRef, useState } from "react";
import { newIdempotencyKey } from "./api";
import { collectionWriteKind, type WriteKind } from "./collection-actions";

export type MoneyRun<T> = { kind: "done"; result: T } | { kind: WriteKind | "busy"; error?: any };

export function useMoneyWrite(prefix: string, errorText: (e: any) => string) {
  const keyRef = useRef<string | null>(null);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(
    async <T,>(send: (key: string) => Promise<T>): Promise<MoneyRun<T>> => {
      if (busy.current) return { kind: "busy" };
      busy.current = true;
      setSaving(true);
      setError("");
      if (!keyRef.current) keyRef.current = newIdempotencyKey(prefix);
      try {
        const result = await send(keyRef.current);
        keyRef.current = null;
        setLocked(false);
        return { kind: "done", result };
      } catch (e: any) {
        const kind = collectionWriteKind(e);
        if (kind === "rejected") {
          keyRef.current = null;
          setLocked(false);
        } else if (kind === "uncertain" || kind === "conflict") setLocked(true);
        else setBlocked(true);
        setError(errorText(e));
        return { kind, error: e };
      } finally {
        busy.current = false;
        setSaving(false);
      }
    },
    [prefix, errorText]
  );

  const clearError = useCallback(() => setError(""), []);
  return { saving, locked, blocked, error, run, clearError };
}

export function moneySubmitLabel(w: { saving: boolean; locked: boolean }, idle: string) {
  return w.saving ? "Kaydediliyor…" : w.locked ? "Yeniden gönder" : idle;
}
