import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";

/**
 * Tab focus olduğunda veri yükleme hook'u.
 * - İlk açılışta her zaman yükler
 * - Sonraki focus'larda: veri yoksa veya staleMs geçmişse yeniden yükler
 */
export function useFocusLoad(
  load: () => Promise<void> | void,
  options: {
    hasData: boolean;
    staleMs?: number; // default: 2 dakika
  }
) {
  const lastLoadedAt = useRef<number>(0);
  const staleMs = options.staleMs ?? 2 * 60 * 1000;

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      const isStale = now - lastLoadedAt.current > staleMs;
      const isEmpty = !options.hasData;
      if (isEmpty || isStale) {
        lastLoadedAt.current = now;
        load();
      }
    }, [load, options.hasData, staleMs])
  );
}
