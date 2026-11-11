// Fatura ve hesap alanının ek uçları: "Davet et, kazan" (web: pages/InviteEarnPage.js).
import { request } from "./api";

export type ReferralConfig = { allowedPlans: string[]; defaultPlan: string };

export type ReferralInviteResult = { success: boolean; message?: string; invite_url?: string };

// Davet için kullanılabilen abonelik planları ve kullanıcının varsayılan planı.
export async function getReferralConfig(token: string): Promise<ReferralConfig> {
  const d = await request<any>("/referrals/config", { method: "GET" }, token);
  const allowedPlans: string[] = Array.isArray(d?.allowed_plans) ? d.allowed_plans.map((p: unknown) => String(p)).filter(Boolean) : [];
  const preferred = String(d?.default_plan || "");
  return { allowedPlans, defaultPlan: allowedPlans.includes(preferred) ? preferred : allowedPlans[0] || "" };
}

// Paylaşılabilir davet bağlantısı üretir; her çağrı sunucuda yeni bir davet kaydı açar.
export async function createReferralLink(token: string, plan: string): Promise<string> {
  const d = await request<ReferralInviteResult>("/referrals/generate-link", { method: "POST", body: JSON.stringify({ plan }) }, token);
  return String(d?.invite_url || "");
}

// Daveti e-postayla gönderir. Posta gönderilemese de kayıt açılır: success=false ve invite_url birlikte dönebilir.
export async function sendReferralEmailInvite(
  token: string,
  body: { plan: string; name: string; email: string; phone?: string | null }
): Promise<ReferralInviteResult> {
  let d: ReferralInviteResult;
  try {
    d = await request<ReferralInviteResult>(
      "/referrals/invite-email",
      { method: "POST", body: JSON.stringify({ plan: body.plan, name: body.name, email: body.email, phone: body.phone || null }) },
      token
    );
  } catch (e: any) {
    // Sunucu e-postayı istemciden daha sıkı denetler; 422 yanıtında detail bir dizi olduğu için okunur ileti çıkmaz.
    if (e?.status === 422) throw { ...e, message: "E-posta adresi geçersiz görünüyor. Lütfen kontrol edip yeniden deneyin." };
    throw e;
  }
  return { success: d?.success !== false, message: d?.message ? String(d.message) : undefined, invite_url: d?.invite_url ? String(d.invite_url) : undefined };
}
