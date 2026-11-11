import { useCallback, useEffect, useRef, useState } from "react";

type Page<T> = { items: T[]; total: number; hasMore: boolean };

// Sayfalı listeler için ortak durum: ilk yükleme, devamını yükleme, yenileme ve hata.
// `fetchPage` bağımlılıkları değiştiğinde (arama, süzgeç) liste baştan yüklenir.
export function usePagedList<T extends { id: string }>(fetchPage: ((page: number) => Promise<Page<T>>) | null) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  // Yüklenmiş son sayfa; yerinde yenileme kaç sayfa çekeceğini buradan bilir.
  const pageRef = useRef(1);

  const run = useCallback(
    async (nextPage: number, mode: "reset" | "more" | "refresh") => {
      if (!fetchPage) return;
      const id = ++requestId.current;
      if (mode === "reset") {
        setLoading(true);
        pageRef.current = 1;
      }
      if (mode === "more") setLoadingMore(true);
      if (mode === "refresh") setRefreshing(true);
      try {
        const res = await fetchPage(nextPage);
        if (id !== requestId.current) return;
        setItems((prev) => {
          if (mode !== "more") return res.items;
          const known = new Set(prev.map((x) => x.id));
          return [...prev, ...res.items.filter((x) => !known.has(x.id))];
        });
        setTotal(res.total);
        setPage(nextPage);
        pageRef.current = nextPage;
        setHasMore(res.hasMore);
        setError(null);
      } catch (e: any) {
        if (id === requestId.current) setError(e?.message || "Liste yüklenemedi.");
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [fetchPage]
  );

  // Yerinde yenileme: yüklenmiş bütün sayfalar (1..son) yeniden çekilir; liste uzunluğu ve kaydırma konumu korunur.
  // Detaydan geri dönüşte kullanılır. Hata olursa eldeki liste olduğu gibi bırakılır.
  const refreshLoaded = useCallback(async () => {
    if (!fetchPage) return;
    const id = ++requestId.current;
    const upto = pageRef.current;
    try {
      const merged: T[] = [];
      const known = new Set<string>();
      let total = 0;
      let more = false;
      let lastPage = 1;
      for (let p = 1; p <= upto; p++) {
        const res = await fetchPage(p);
        if (id !== requestId.current) return;
        for (const x of res.items) {
          if (known.has(x.id)) continue;
          known.add(x.id);
          merged.push(x);
        }
        total = res.total;
        more = res.hasMore;
        lastPage = p;
        if (!res.hasMore) break;
      }
      setItems(merged);
      setTotal(total);
      setPage(lastPage);
      pageRef.current = lastPage;
      setHasMore(more);
      setError(null);
    } catch {
      // Sessiz: eldeki liste kalır; kullanıcı aşağı çekerek yenileyebilir.
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, [fetchPage]);

  useEffect(() => {
    run(1, "reset");
  }, [run]);

  return {
    items,
    total,
    loading,
    loadingMore,
    refreshing,
    error,
    hasMore,
    reload: () => run(1, "reset"),
    refresh: () => run(1, "refresh"),
    refreshLoaded,
    loadMore: () => {
      if (hasMore && !loadingMore && !loading) run(page + 1, "more");
    },
  };
}
