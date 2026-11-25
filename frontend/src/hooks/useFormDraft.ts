// KABUK-2: yarım kalan YENİ kayıt formunun taslağı (web lib/formDraft.js useFormDraft ile aynı davranış).
// enabled=false (düzenleme kipi / kullanıcı yok): okumaz, yazmaz. Açılışta taslak varsa `pending` dolar; yanıtlanana kadar
// (restore / discard) yazılmaz. dirty iken 800 ms gecikmeyle yazar; ekrandan çıkarken bekleyen yazım hemen yapılır; form yeniden
// temizse bu oturumda yazılan taslak silinir. clear(): kayıt başarılı / Vazgeç — taslak silinir, bu ekranda yeniden yazılmaz.
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { draftKey, envelope, parseDraft, sanitize } from "../form-draft";
import { draftEpoch, readDraftText, removeDraft, writeDraftText } from "../draft-store";

const WRITE_DELAY = 800;

export function useFormDraft<F extends object>({ kind, form, dirty, enabled = true, omit = [] }: { kind: string; form: F; dirty: boolean; enabled?: boolean; omit?: string[] }) {
  const { user } = useAuth();
  const key = enabled ? draftKey(user as any, kind) : null;
  const [pending, setPending] = useState<{ at: number; form: Partial<F> } | null>(null);
  const [checked, setChecked] = useState(!key);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waiting = useRef(false);
  const wrote = useRef(false);
  const stopped = useRef(false);
  const latest = useRef({ key, form, omit, pending, checked });
  latest.current = { key, form, omit, pending, checked };

  useEffect(() => {
    let live = true;
    setChecked(!key);
    setPending(null);
    if (!key) return;
    readDraftText(key).then((raw) => {
      if (!live) return;
      const d = parseDraft(raw);
      if (!d && raw) removeDraft(key);
      setPending(d ? { at: d.at, form: d.form } : null);
      setChecked(true);
    });
    return () => {
      live = false;
    };
  }, [key]);

  const write = (k: string, f: F, o: string[], at: number) => {
    if (at !== draftEpoch()) return;
    const text = envelope(sanitize(f, o));
    if (text) writeDraftText(k, text).then((ok) => ok && (wrote.current = true));
  };

  useEffect(() => {
    if (!key || !checked || pending) return;
    if (!dirty) {
      stopped.current = false;
      if (timer.current) clearTimeout(timer.current);
      waiting.current = false;
      if (wrote.current) {
        removeDraft(key);
        wrote.current = false;
      }
      return;
    }
    if (stopped.current) return;
    waiting.current = true;
    if (timer.current) clearTimeout(timer.current);
    const at = draftEpoch();
    timer.current = setTimeout(() => {
      waiting.current = false;
      write(key, form, omit, at);
    }, WRITE_DELAY);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, checked, pending, dirty, form]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      const l = latest.current;
      if (waiting.current && l.key && l.checked && !l.pending && !stopped.current) write(l.key, l.form, l.omit, draftEpoch());
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const restore = useCallback(() => {
    const f = latest.current.pending?.form || null;
    setPending(null);
    return f;
  }, []);
  const discard = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    waiting.current = false;
    wrote.current = false;
    if (latest.current.key) removeDraft(latest.current.key);
    setPending(null);
  }, []);
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    waiting.current = false;
    wrote.current = false;
    stopped.current = true;
    if (latest.current.key) removeDraft(latest.current.key);
    setPending(null);
  }, []);
  return { pending: pending ? { at: pending.at } : null, restore, discard, clear };
}
