import React, { createContext, useCallback, useContext, useRef } from "react";
import { getInvoices } from "../api";
import type { Invoice } from "../types";

type InvoiceCache = {
  data: { invoices: Invoice[]; total: number; page: number; per_page: number };
  fetchedAt: number;
};

type DataCacheContextValue = {
  getCachedInvoices: (token: string, options?: { page?: number; perPage?: number }) => Promise<{ invoices: Invoice[]; total: number; page: number; per_page: number }>;
  invalidateInvoices: () => void;
};

const TTL_MS = 60_000;

const DataCacheContext = createContext<DataCacheContextValue | undefined>(undefined);

export function DataCacheProvider({ children }: { children: React.ReactNode }) {
  const invoiceCache = useRef<Map<string, InvoiceCache>>(new Map());

  const getCachedInvoices = useCallback(
    async (token: string, options?: { page?: number; perPage?: number }) => {
      const key = `${options?.page ?? 1}-${options?.perPage ?? 50}`;
      const cached = invoiceCache.current.get(key);
      if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
        return cached.data;
      }
      const result = await getInvoices(token, options);
      invoiceCache.current.set(key, { data: result, fetchedAt: Date.now() });
      return result;
    },
    []
  );

  const invalidateInvoices = useCallback(() => {
    invoiceCache.current.clear();
  }, []);

  return (
    <DataCacheContext.Provider value={{ getCachedInvoices, invalidateInvoices }}>
      {children}
    </DataCacheContext.Provider>
  );
}

export function useDataCache() {
  const ctx = useContext(DataCacheContext);
  if (!ctx) throw new Error("useDataCache must be used inside DataCacheProvider");
  return ctx;
}
