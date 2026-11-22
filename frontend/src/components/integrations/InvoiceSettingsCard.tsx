// Kanal → Sipariş faturası ayarı (Faz C4 WP4): tahsilat kasası (obihub_kasa_id; boş = açık alacak) ve "Otomatik resmileştir".
// Kayıt PUT /integrations/{id}/settings: sunucu yalnız gönderilen invoice_settings alanlarını birleştirir, API anahtarlarına dokunmaz.
// auto_officialize kullanıcı dokunmadıysa gönderilmez. Sağlayıcı (GET /invoicing/officializer) yoksa anahtar pasif. Kurallar: src/order-invoice.ts.
import React, { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { canAccess, canManage } from "../../auth/permissions";
import { getPickableAccounts, request } from "../../api";
import { effectiveAutoOfficialize, invoiceSettingsPayload, kasaAccounts, kasaErrorText, kasaWarning, readInvoiceSettings, type InvoiceSettingsState } from "../../order-invoice";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, spacing, type } from "../../theme/tokens";
import { Button } from "../../ui/Button";
import { Chip, ChipRow } from "../../ui/Chip";
import { useFeedback } from "../../ui/Feedback";
import { Card, SectionTitle } from "../../ui/ListRow";

const CHANNELS = ["trendyol", "hepsiburada", "woocommerce", "amazon", "idefix", "pazarama"];

export function InvoiceSettingsCard({ integration, onSaved }: { integration: any; onSaved?: () => void }) {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const inv = integration?.credentials?.invoice_settings || {};
  const [state, setState] = useState<InvoiceSettingsState>(() => readInvoiceSettings(inv));
  const [accounts, setAccounts] = useState<{ id: string; name: string }[] | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [providerLabel, setProviderLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const channel = String(integration?.provider || "").toLowerCase();
  // Görüntüleme entegrasyon görme izniyle; kayıt yalnız integrations.manage (yetkisizde salt okuma).
  const visible = CHANNELS.includes(channel) && canAccess(user, "integrations");
  const canEdit = canManage(user, "integrations");

  useEffect(() => {
    setState(readInvoiceSettings(integration?.credentials?.invoice_settings));
    setDirty(false);
  }, [integration?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!token || !visible) return;
    getPickableAccounts(token)
      .then((rows: any[]) => setAccounts(kasaAccounts(rows).map((a: any) => ({ id: String(a.id), name: String(a.name || "Hesap") }))))
      .catch(() => setAccounts([]));
    request<any>("/invoicing/officializer", { method: "GET" }, token)
      .then((r) => (setProvider(r?.provider || null), setProviderLabel(String(r?.label || ""))))
      .catch(() => setProvider(null));
  }, [token, visible]);
  if (!visible) return null;

  const patch = (p: Partial<InvoiceSettingsState>) => {
    if (!canEdit) return;
    setState((s) => ({ ...s, ...p }));
    setDirty(true);
    setError("");
  };
  const save = async () => {
    if (!token || busy) return;
    setBusy(true);
    setError("");
    try {
      await request<any>(`/integrations/${encodeURIComponent(integration.id)}/settings`, { method: "PUT", body: JSON.stringify(invoiceSettingsPayload(state)) }, token);
      toast("Fatura ayarı kaydedildi.", "success");
      setDirty(false);
      onSaved?.();
    } catch (e: any) {
      setError(kasaErrorText(e));
    } finally {
      setBusy(false);
    }
  };
  const auto = effectiveAutoOfficialize(state, provider, inv);
  const warn = kasaWarning({ ...inv, obihub_kasa_id: state.obihub_kasa_id });
  return (
    <View testID="integration-invoice-settings">
      <SectionTitle title="Sipariş faturası" />
      <Card style={styles.block}>
        <View style={styles.body}>
          <Text style={[type.callout, { color: colors.textSecondary, fontWeight: "600" }]}>Tahsilat kasası</Text>
          <Text style={[type.caption, { color: colors.textTertiary }]}>Seçerseniz sipariş faturası "Tahsil edildi" kesilir ve tahsilat bu hesaba yazılır. Boş bırakırsanız açık alacak olur.</Text>
          {accounts === null ? null : (
            <View style={{ marginHorizontal: -spacing.md }}>
              <ChipRow>
                <Chip testID="inv-kasa-none" label="Açık alacak" selected={!state.obihub_kasa_id} onPress={() => patch({ obihub_kasa_id: "" })} />
                {accounts.map((a) => (
                  <Chip key={a.id} testID={`inv-kasa-${a.id}`} label={a.name} selected={state.obihub_kasa_id === a.id} onPress={() => patch({ obihub_kasa_id: a.id })} />
                ))}
              </ChipRow>
            </View>
          )}
          {warn ? <Text style={[type.caption, { color: colors.amber }]}>{warn}</Text> : null}
          <View style={[styles.row, { borderTopColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: provider ? colors.textPrimary : colors.textTertiary }]}>Otomatik resmileştir</Text>
              <Text style={[type.caption, { color: colors.textTertiary }]}>
                {provider ? `Otomatik kesilen faturayı ${providerLabel || "bağlı sağlayıcı"} ile resmileştirir.` : "Resmileştirme için muhasebe ya da e-belge bağlantısı yok."}
              </Text>
            </View>
            <Switch testID="inv-auto-officialize" value={auto} disabled={!provider || !canEdit} onValueChange={(v) => patch({ auto_officialize: v })} trackColor={{ true: colors.primary, false: colors.border }} />
          </View>
          {error ? (
            <View style={[styles.err, { backgroundColor: colors.errorBg }]} accessibilityRole="alert">
              <Text style={[type.footnote, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}
          {!canEdit ? <Text style={[type.caption, { color: colors.textTertiary }]}>Bu ayarı değiştirmek için entegrasyon yönetim izni gerekir.</Text> : null}
          {dirty && canEdit ? <Button testID="inv-settings-save" size="sm" label={busy ? "Kaydediliyor…" : "Kaydet"} busy={busy} disabled={busy} onPress={save} style={{ alignSelf: "flex-start" }} /> : null}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginHorizontal: spacing.lg },
  body: { padding: spacing.md, gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm, marginTop: spacing.xs },
  err: { borderRadius: radius.md, padding: spacing.sm },
});
