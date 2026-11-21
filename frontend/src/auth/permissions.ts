// Web panelindeki rol tablosunun karşılığı (frontend/src/lib/authz.js).
// D-30 (Sürüm 3): sunucu artık her isteği modül yetkisiyle denetler (403 PERMISSION_DENIED). Ekip üyesinde (role "member")
// izinler YALNIZ sunucunun /team/me `permissions` listesidir; bilinmeyen rol gibi firma sahibi sayılmaz.
import type { User } from "../types";

const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ["*"],
  admin: ["*"],
  manager: [
    "dashboard.view", "catalog.view", "catalog.manage", "orders.view", "orders.manage", "integrations.view", "integrations.manage",
    "inventory.view", "inventory.manage", "reports.view", "customers.view", "customers.manage", "settings.view", "logs.view",
  ],
  operator: ["dashboard.view", "catalog.view", "orders.view", "orders.manage", "integrations.view", "inventory.view", "inventory.manage", "customers.view"],
  accountant: ["dashboard.view", "orders.view", "reports.view", "billing.view", "billing.manage", "customers.view"],
  support: ["dashboard.view", "orders.view", "customers.view", "logs.view"],
  viewer: ["dashboard.view", "catalog.view", "orders.view", "integrations.view", "reports.view", "customers.view"],
};

export type Area = "catalog" | "inventory" | "billing" | "reports" | "customers" | "integrations" | "orders" | "settings";

// Web ile aynı (authz.js permissionSet): rol izinleri ile sunucunun gönderdiği açık izinler birleştirilir.
// Bilinmeyen roller ve super_admin web'de olduğu gibi hesap sahibi sayılır.
function permissionsOf(user: User | null | undefined): string[] {
  let role = String(user?.role || "owner").trim().toLowerCase();
  if (role === "member") return Array.isArray(user?.permissions) ? user!.permissions!.filter((x): x is string => typeof x === "string") : [];
  if (role === "super_admin" || role === "superadmin" || !ROLE_PERMISSIONS[role]) role = "owner";
  const explicit = Array.isArray(user?.permissions) ? user.permissions.filter((x): x is string => typeof x === "string") : [];
  return Array.from(new Set([...ROLE_PERMISSIONS[role], ...explicit]));
}

// Görüntüleme: alanın view veya manage izni yeterlidir.
export function canAccess(user: User | null | undefined, area: Area): boolean {
  const perms = permissionsOf(user);
  return perms.includes("*") || perms.includes(`${area}.view`) || perms.includes(`${area}.manage`);
}

// Yazma işlemleri (tahsilat, stok, fiyat, kasa kaydı) manage izni ister.
export function canManage(user: User | null | undefined, area: Area): boolean {
  const perms = permissionsOf(user);
  return perms.includes("*") || perms.includes(`${area}.manage`);
}

// Faz A (web Sidebar): "Satış Ekranı" (hızlı satış) yalnız Satışlar düzenleme (orders.manage); "Satış Fişleri" orders.view|manage.
// Sunucu /pos uçlarını Satışlar modülüyle denetler (team_access: ("pos","mod",("sales",))).
export const canSell = (user: User | null | undefined) => canManage(user, "orders");
export const canSeeReceipts = (user: User | null | undefined) => canAccess(user, "orders");

// Rota → gereken alanlardan herhangi biri. Listede olmayan rotalar herkese açıktır.
const ROUTE_AREAS: Record<string, Area[]> = {
  products: ["catalog", "inventory"],
  jobs: ["catalog"],
  integrations: ["integrations"],
  "local-invoices": ["billing"],
  invoices: ["billing"],
  offers: ["billing"],
  // Web: /panel/finans fatura izni ya da rapor görme izniyle açılır.
  cash: ["billing", "reports"],
  expenses: ["billing"],
  employees: ["billing"],
  incoming: ["billing"],
  customers: ["customers"],
  "pos-receipts": ["orders"],
  "marketplace-returns": ["orders"],
  // Netgsm SMS: GET /netgsm Ayarlar modülüyle açılır (team_access ("netgsm","mod",("settings",))).
  sms: ["settings"],
  reports: ["reports"],
  "finance-reports": ["reports"],
};

export function canOpenRoute(user: User | null | undefined, firstSegment: string): boolean {
  const areas = ROUTE_AREAS[firstSegment];
  return !areas || areas.some((a) => canAccess(user, a));
}

// Yalnız firma sahibi işleri (ekip, abonelik/ödeme, entegrasyon kimlik bilgileri, profil e-postası).
export function isOwner(user: (User & { is_owner?: boolean }) | null | undefined): boolean {
  if (String(user?.role || "").toLowerCase() === "member") return false;
  return (user as any)?.is_owner !== false;
}

// D-30 reddi: sunucunun Türkçe açıklaması olduğu gibi gösterilir.
export function permissionDeniedText(e: any): string | null {
  if (Number(e?.status) !== 403 || e?.code !== "PERMISSION_DENIED") return null;
  return typeof e?.message === "string" && e.message.trim() ? e.message.trim() : "Bu işlem için yetkiniz yok.";
}
