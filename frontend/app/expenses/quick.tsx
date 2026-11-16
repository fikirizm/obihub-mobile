// Dalga 3 (P3.3): Hızlı fiş/fatura (Paraşüt "Hızlı fiş/fatura"). Yalnız KDV dahil toplam + KDV oranı; tedarikçi, belge no, fiş görseli,
// harcayan isteğe bağlı. Elle alış hattı: POST /accounting/manual-purchases/preview (entry_mode=quick; toplamı SUNUCU hesaplar) → confirm.
// Listeden seçilen tedarikçi supplier:{party_id} ile gider (adla gönderim mükerrer cari açar). Sunucu toplamı kuruşla karşılaştırılır.
// Fiş görseli: POST /accounting/expense-invoices/receipts (özel dosya, 5 MB). Yanıttaki parasut_warning ayrıca gösterilir.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { getPickableAccounts, newIdempotencyKey, request } from "../../src/api";
import { confirmManualPurchase, getSupplierParties, istanbulToday, manualErrorText, previewManualPurchase, type ManualPreview } from "../../src/api-gider";
import { matchSupplier, QUICK_VAT, quickBody, totalDiffers, warningOf, type QuickForm } from "../../src/expense-kinds";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { formatMoney } from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon } from "../../src/components/Icons";
import { Button } from "../../src/ui/Button";
import { Chip } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { Card } from "../../src/ui/ListRow";

const trDay = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");
const isoOf = (t: string) => {
  const v = t.trim();
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(v);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "x";
};

export default function QuickReceiptScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, choose } = useFeedback();
  const today = istanbulToday();
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [spenders, setSpenders] = useState<{ id: string; name: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [f, setF] = useState<QuickForm>({
    documentName: "", supplierName: "", supplierPartyId: "", documentNumber: "", issueDate: today, total: "", vatRate: "20", dueDate: "",
    categoryId: "", spenderId: "", receiptId: "", paymentState: "payable", paymentAccountId: "", paymentDate: today,
  });
  const [issueText, setIssueText] = useState(trDay(today));
  const [receiptName, setReceiptName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pv, setPv] = useState<{ status: "idle" | "loading" | "ready" | "error"; data: ManualPreview | null; message: string; key: string }>({ status: "idle", data: null, message: "", key: "" });
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<{ tone: "info" | "warn" | "bad"; text: string; final?: boolean } | null>(null);
  const draftRef = useRef<string | null>(null);
  const keyRef = useRef(newIdempotencyKey("qrc"));
  const seq = useRef(0);
  const set = (patch: Partial<QuickForm>) => setF((p) => ({ ...p, ...patch }));

  useEffect(() => {
    if (!token) return;
    getSupplierParties(token).then(setSuppliers);
    getPickableAccounts(token)
      .then((rows) => setAccounts(rows.filter((a) => ["TRY", "TL", "TRL", ""].includes(String(a.currency || "TRY").toUpperCase())).map((a) => ({ id: a.id, name: a.name }))))
      .catch(() => setAccounts([]));
    request<any>("/accounting/expense-invoices/kinds", { method: "GET" }, token)
      .then((c) => setSpenders((Array.isArray(c?.spenders) ? c.spenders : []).filter((s: any) => s?.id).map((s: any) => ({ id: String(s.id), name: String(s.name || "Kullanıcı") }))))
      .catch(() => setSpenders([]));
  }, [token]);
  useEffect(() => set({ issueDate: isoOf(issueText) }), [issueText]);

  // Tedarikçi kimliği her seferinde güncel listeden (liste ad yazıldıktan sonra gelse de doğru cari).
  const match = matchSupplier(suppliers, f.supplierName);
  const built = useMemo(() => quickBody({ ...f, supplierPartyId: match.id }), [f, match.id]);
  const bodyKey = built.body ? JSON.stringify(built.body) : "";
  useEffect(() => {
    if (!token || !built.body) {
      seq.current += 1;
      setPv({ status: "idle", data: null, message: "", key: "" });
      return;
    }
    setPv((p) => ({ ...p, status: "loading", key: bodyKey }));
    const my = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const data = await previewManualPurchase(token, built.body as Record<string, unknown>, draftRef.current);
        if (my !== seq.current) return;
        draftRef.current = data.draftId || draftRef.current;
        setPv({ status: "ready", data, message: "", key: bodyKey });
      } catch (e: any) {
        if (my !== seq.current) return;
        if (e?.code === "DRAFT_NOT_FOUND" || e?.code === "DRAFT_ALREADY_CONFIRMED") {
          draftRef.current = null;
          keyRef.current = newIdempotencyKey("qrc");
        }
        setPv({ status: "error", data: null, message: manualErrorText(e, "Toplam şu anda hesaplanamadı."), key: bodyKey });
      }
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyKey, token]);

  const fresh = pv.status === "ready" && pv.key === bodyKey;
  const canConfirm = fresh && pv.data?.canConfirm === true && !saving && !outcome?.final && !built.paymentIncomplete;
  const differs = Boolean(fresh && pv.data?.totals && built.body && totalDiffers(pv.data.totals.payable, built.body.total));

  const pickReceipt = async () => {
    if (!token || uploading) return;
    const source =
      Platform.OS === "web"
        ? "library"
        : await choose<"camera" | "library">({ title: "Fiş görseli", options: [{ value: "camera", label: "Fotoğraf çek" }, { value: "library", label: "Fotoğraflardan seç" }] });
    if (!source) return;
    try {
      const perm = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return toast("İzin verilmedi. Ayarlar'dan izin verebilirsiniz.", "error");
      const res = source === "camera" ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      if ((a.fileSize || 0) > 5 * 1024 * 1024) return toast("Fiş görseli en çok 5 MB olabilir.", "error");
      const mt = String(a.mimeType || "").toLowerCase();
      const mime = ["image/png", "image/webp", "image/jpeg"].includes(mt) ? mt : "image/jpeg";
      const name = a.fileName || `fis-${Date.now()}.${mime.split("/")[1].replace("jpeg", "jpg")}`;
      const form = new FormData();
      form.append("file", { uri: a.uri, name, type: mime } as any);
      setUploading(true);
      const r = await request<any>("/accounting/expense-invoices/receipts", { method: "POST", body: form }, token);
      set({ receiptId: String(r?.id || "") });
      setReceiptName(String(r?.name || name));
    } catch (e: any) {
      toast(manualErrorText(e, "Fiş görseli yüklenemedi."), "error");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setTried(true);
    if (!token || !canConfirm || !pv.data) return;
    setSaving(true);
    setOutcome(null);
    try {
      const res = await confirmManualPurchase(token, pv.data.draftId, pv.data.decisionDigest, keyRef.current);
      const st = String(res?.status || "");
      if (st === "APPLIED") {
        toast("Fiş kaydedildi.", "success");
        const w = warningOf(res);
        if (w) setTimeout(() => toast(w, "info"), 600);
        router.back();
        return;
      }
      if (st === "IN_PROGRESS") setOutcome({ tone: "info", text: "Kayıt işleniyor. Birkaç saniye sonra Gider faturaları listesinden kontrol edin.", final: true });
      else setOutcome({ tone: "warn", text: res?.detail || "Kayıt tamamlanamadı. Aynı fişi yeniden girmeden önce listeyi kontrol edin.", final: st === "NEEDS_REVIEW" });
    } catch (e: any) {
      const s = Number(e?.status || 0);
      if (s >= 400 && s < 500 && s !== 429) {
        keyRef.current = newIdempotencyKey("qrc");
        setOutcome({ tone: "bad", text: manualErrorText(e, "Kayıt yapılamadı.") });
      } else if (s === 429) setOutcome({ tone: "bad", text: manualErrorText(e) });
      else setOutcome({ tone: "warn", text: "Kaydın sonucu belirsiz. Aynı fişi yeniden girmeden önce Gider faturaları listesini kontrol edin.", final: true });
    } finally {
      setSaving(false);
    }
  };

  if (!canManage(user, "billing"))
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Hızlı fiş/fatura" />
        <EmptyState icon={<AlertIcon size={30} color={colors.textTertiary} />} title="Yetkiniz yok" description="Gider kaydı için fatura yönetimi yetkisi gerekir." />
      </View>
    );
  const err = (k: string, text: string) => (tried && built.problems.includes(k) ? text : undefined);
  const supHint = match.id
    ? "Kayıtlı tedarikçi seçildi; borç bu cariye yazılır."
    : match.ambiguous
      ? "Aynı adlı birden çok tedarikçi var; doğru cari için ayrıntılı alış formunu kullanın, aksi hâlde yeni tedarikçi açılır."
      : "Kayıtlı bir tedarikçi seçin ya da yeni ad yazın.";
  const supSuggest = f.supplierName.trim().length >= 2 && !match.id ? suppliers.filter((s) => s.name.toLocaleLowerCase("tr").includes(f.supplierName.trim().toLocaleLowerCase("tr"))).slice(0, 5) : [];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="quick-receipt-screen">
      <StackHeader title="Hızlı fiş/fatura" subtitle="Kalem girmeden, toplam ve KDV oranıyla" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <FormField testID="quick-name" label="Kayıt adı (isteğe bağlı)" value={f.documentName} onChangeText={(t) => set({ documentName: t })} maxLength={140} placeholder="Ör. Kırtasiye, yemek, akaryakıt" error={err("documentName", "En çok 120 karakter.")} />
          <FormField testID="quick-supplier" label="Tedarikçi (isteğe bağlı)" value={f.supplierName} onChangeText={(t) => set({ supplierName: t })} maxLength={200} hint={supHint} />
          {supSuggest.length ? (
            <View style={styles.chips}>
              {supSuggest.map((s) => (
                <Chip key={s.id} testID={`quick-supplier-${s.id}`} label={s.name} selected={false} onPress={() => set({ supplierName: s.name })} />
              ))}
            </View>
          ) : null}
          <FormField testID="quick-date" label="Fiş/fatura tarihi" value={issueText} onChangeText={setIssueText} placeholder="GG.AA.YYYY" error={err("issueDate", "Geçerli bir tarih girin.")} />
          <FormField testID="quick-total" label="Toplam tutar (vergiler dahil)" value={f.total} onChangeText={(t) => set({ total: t })} keyboardType="decimal-pad" placeholder="0,00" error={err("total", "Toplam tutarı girin (sıfırdan büyük).")} />
          <Text style={[type.caption, { color: colors.textSecondary }]}>KDV oranı</Text>
          <View style={styles.chips}>
            {QUICK_VAT.map((v) => (
              <Chip key={v} testID={`quick-vat-${v}`} label={`%${v}`} selected={f.vatRate === v} onPress={() => set({ vatRate: v })} />
            ))}
          </View>

          <Text style={[type.caption, { color: colors.textSecondary }]}>Ödeme</Text>
          <View style={styles.chips}>
            <Chip testID="quick-pay-payable" label="Ödenecek" selected={f.paymentState === "payable"} onPress={() => set({ paymentState: "payable" })} />
            <Chip testID="quick-pay-paid" label="Ödendi" selected={f.paymentState === "paid"} onPress={() => set({ paymentState: "paid", paymentAccountId: f.paymentAccountId || accounts[0]?.id || "" })} />
          </View>
          {f.paymentState === "paid" ? (
            <View style={styles.chips}>
              {accounts.map((a) => (
                <Chip key={a.id} testID={`quick-account-${a.id}`} label={a.name} selected={f.paymentAccountId === a.id} onPress={() => set({ paymentAccountId: a.id })} />
              ))}
            </View>
          ) : null}
          {tried && built.paymentIncomplete ? <Text style={[type.footnote, { color: colors.error }]}>Ödendi için hesap seçin.</Text> : null}

          {spenders.length ? (
            <>
              <Text style={[type.caption, { color: colors.textSecondary }]}>Harcayan (isteğe bağlı)</Text>
              <View style={styles.chips}>
                {spenders.map((s) => (
                  <Chip key={s.id} testID={`quick-spender-${s.id}`} label={s.name} selected={f.spenderId === s.id} onPress={() => set({ spenderId: f.spenderId === s.id ? "" : s.id })} />
                ))}
              </View>
            </>
          ) : null}
          <View style={styles.row}>
            <Button testID="quick-receipt" size="sm" variant="secondary" label={f.receiptId ? "Fiş görselini değiştir" : "Fiş görseli ekle"} busy={uploading} onPress={pickReceipt} />
            {f.receiptId ? (
              <Pressable onPress={() => (set({ receiptId: "" }), setReceiptName(""))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fiş görselini kaldır">
                <Text style={[type.caption, { color: colors.error }]}>{`${receiptName || "Görsel"} · kaldır`}</Text>
              </Pressable>
            ) : null}
          </View>

          <Card padded style={{ gap: 4 }}>
            {pv.status === "loading" ? <Text style={[type.caption, { color: colors.textTertiary }]}>Sunucu toplamı hesaplıyor…</Text> : null}
            {pv.status === "error" ? <Text style={[type.caption, { color: colors.error }]}>{pv.message}</Text> : null}
            {fresh && pv.data?.totals ? (
              <>
                <View style={styles.line}>
                  <Text style={[type.callout, { color: colors.textSecondary }]}>Matrah</Text>
                  <Text style={[type.callout, tabular, { color: colors.textPrimary }]}>{formatMoney(Number(pv.data.totals.taxable), "TRY")}</Text>
                </View>
                <View style={styles.line}>
                  <Text style={[type.callout, { color: colors.textSecondary }]}>KDV</Text>
                  <Text style={[type.callout, tabular, { color: colors.textPrimary }]}>{formatMoney(Number(pv.data.totals.vat), "TRY")}</Text>
                </View>
                <View style={styles.line}>
                  <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>Toplam</Text>
                  <Text testID="quick-server-total" style={[type.bodyStrong, tabular, { color: colors.textPrimary }]}>{formatMoney(Number(pv.data.totals.payable), "TRY")}</Text>
                </View>
              </>
            ) : pv.status === "idle" ? (
              <Text style={[type.caption, { color: colors.textTertiary }]}>Toplamı girince matrah ve KDV'yi sunucu hesaplar.</Text>
            ) : null}
            {differs ? <Text testID="quick-differs" style={[type.caption, { color: colors.amber }]}>Sunucunun hesapladığı toplam girdiğiniz tutardan farklı; tutarı kontrol edin.</Text> : null}
            {fresh ? (pv.data?.blockers || []).map((b) => <Text key={b} style={[type.caption, { color: colors.error }]}>{b}</Text>) : null}
          </Card>
          {outcome ? <Text style={[type.footnote, { color: outcome.tone === "bad" ? colors.error : outcome.tone === "warn" ? colors.amber : colors.info }]}>{outcome.text}</Text> : null}
          <Button testID="quick-save" label="Fişi kaydet" busy={saving} disabled={!canConfirm} onPress={save} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.huge },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  line: { flexDirection: "row", justifyContent: "space-between" },
});
