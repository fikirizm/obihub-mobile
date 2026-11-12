// Web panelindeki rol tablosunun karşılığı (frontend/src/lib/authz.js).
// Backend bu izinleri uç bazında denetlemez; web gibi mobil de ekranları role göre gösterir.
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

export type Area = "catalog" | "inventory" | "billing" | "reports" | "customers" | "integrations" | "orders";

// Web ile aynı (authz.js permissionSet): rol izinleri ile sunucunun gönderdiği açık izinler birleştirilir.
// Bilinmeyen roller ve super_admin web'de olduğu gibi hesap sahibi sayılır.
function permissionsOf(user: User | null | undefined): string[] {
  let role = String(user?.role || "owner").trim().toLowerCase();
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
  incoming: ["billing"],
  customers: ["customers"],
  reports: ["reports"],
};

export function canOpenRoute(user: User | null | undefined, firstSegment: string): boolean {
  const areas = ROUTE_AREAS[firstSegment];
  return !areas || areas.some((a) => canAccess(user, a));
}
