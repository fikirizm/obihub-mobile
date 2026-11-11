import { useCallback, useEffect, useRef, useState } from "react";

export function useLastUpdated() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, setTick] = useState(0);

  const markUpdated = useCallback(() => {
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    if (!lastUpdated) return;
    const interval = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const label = lastUpdated ? formatRelative(lastUpdated) : null;

  return { markUpdated, label };
}

function formatRelative(d: Date): string {
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 10) return "Az önce güncellendi";
  if (diffSec < 60) return `${diffSec} sn önce güncellendi`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} dk önce güncellendi`;
  return "1+ saat önce güncellendi";
}
