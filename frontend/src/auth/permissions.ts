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

export type Area = "catalog" | "inventory" | "billing" | "reports" | "customers" | "integrations";

// Bilinmeyen roller web'de olduğu gibi hesap sahibi sayılır.
export function canAccess(user: User | null | undefined, area: Area): boolean {
  const perms = ROLE_PERMISSIONS[String(user?.role || "owner")] ?? ["*"];
  if (perms.includes("*")) return true;
  return perms.includes(`${area}.view`) || perms.includes(`${area}.manage`);
}
