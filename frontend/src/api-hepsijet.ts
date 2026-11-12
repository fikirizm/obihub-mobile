// E1 — HepsiJet manuel gönderi: il / ilçe / mahalle listeleri ve toplu oluşturma.
// Web: pages/HepsiJetManualShipmentsPage.js (toOptions, bulk). Sunucu: backend/routers/hepsijet.py.
import { request } from "./api";
import type { HepsiJetManualShipment } from "./types";

export type LocOption = { id: string; label: string };

// Web extractRows + toOptions: yanıt dizi ya da {data|items|...: []} olabilir; kimlik/ad alan adları değişken.
function rowsOf(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  if (raw?.data && typeof raw.data === "object") for (const v of Object.values(raw.data)) if (Array.isArray(v)) return v as any[];
  if (raw && typeof raw === "object") for (const v of Object.values(raw)) if (Array.isArray(v)) return v as any[];
  return [];
}

function toOptions(raw: any): LocOption[] {
  if (raw && raw.success === false) throw { message: String(raw.message || "Konum listesi alınamadı."), status: 200 };
  return rowsOf(raw)
    .map((r: any) => ({
      id: String(r?.id ?? r?.cityId ?? r?.townId ?? r?.districtId ?? r?.code ?? ""),
      label: String(r?.name ?? r?.cityName ?? r?.townName ?? r?.districtName ?? r?.label ?? "").trim(),
    }))
    .filter((x) => x.id && x.label)
    .sort((a, b) => a.label.localeCompare(b.label, "tr-TR"));
}

export const getHjCities = async (token: string) => toOptions(await request<any>("/hepsijet/cities", { method: "GET" }, token));
export const getHjTowns = async (token: string, cityId: string) => toOptions(await request<any>(`/hepsijet/towns/${encodeURIComponent(cityId)}`, { method: "GET" }, token));
export const getHjDistricts = async (token: string, townId: string) =>
  toOptions(await request<any>(`/hepsijet/districts/${encodeURIComponent(townId)}`, { method: "GET" }, token));

export const normalizeTr = (v: string) => String(v || "").toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

// POST /hepsijet/manual/shipments/bulk {shipments:[payload…]} → {results:[{success, shipment, message}]}
export async function createHepsiJetManualShipmentsBulk(
  token: string,
  payload: { customer_id: string; total_parcels?: number; desi?: number; notes?: string },
  count: number
) {
  const res = await request<any>(
    "/hepsijet/manual/shipments/bulk",
    { method: "POST", body: JSON.stringify({ shipments: Array.from({ length: count }, () => payload) }) },
    token
  );
  const results: any[] = Array.isArray(res?.results) ? res.results : [];
  const created = results.map((x) => x?.shipment).filter((x) => x?.id) as HepsiJetManualShipment[];
  const failed = results.filter((x) => !x?.success);
  return { created, failed: failed.length, total: results.length || count, firstError: failed.length ? String(failed[0]?.message || "Bilinmeyen hata") : "" };
}
