// Dalga 4 (P4.1): barkodla toplu stok sayımı. Depo seçilir; ürünler okutulur (her okutma +1) ya da kodla eklenir, miktar elle
// düzeltilebilir. "Farkları göster" → POST /stock/count-bulk/preview (yazmaz); "Sayımı onayla" → /apply (yalnız farklı satırlar,
// Idempotency-Key; önizleme başına tek anahtar, belirsiz sonuçta aynı anahtar). Tek satır engelliyse hiçbir satır yazılmaz.
import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { newIdempotencyKey, request } from "../../src/api";
import { getDocumentMeta, sendKeyedMoney } from "../../src/api-finans";
import { addScan, applyBody, applyResultText, canApply, countErrorText, previewBody, removeLine, setCount, summaryText, type CountLine } from "../../src/stock-count";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon } from "../../src/components/Icons";
import { Button } from "../../src/ui/Button";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { Card, SectionTitle } from "../../src/ui/ListRow";

export default function StockCountScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const mayWrite = canManage(user, "inventory");
  const [permission, requestPermission] = useCameraPermissions();
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[] | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [lines, setLines] = useState<CountLine[]>([]);
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef<string | null>(null);
  const lastScan = useRef({ code: "", at: 0 });

  useEffect(() => {
    if (!token) return;
    getDocumentMeta(token).then((m) => {
      const list = m?.stock.warehouses || [];
      setWarehouses(list);
      setWarehouseId((w) => w || list[0]?.id || "");
    });
  }, [token]);

  // Liste ya da depo değişince önizleme geçersizleşir (yeni anahtar).
  const touch = (next: CountLine[]) => {
    setLines(next);
    setPreview(null);
    key.current = null;
  };
  const onScanned = ({ data }: { data: string }) => {
    const now = Date.now();
    // Aynı barkod kamerada art arda okunur: 1,2 sn içinde tekrar sayılmaz.
    if (!data || (lastScan.current.code === data && now - lastScan.current.at < 1200)) return;
    lastScan.current = { code: data, at: now };
    Haptics.selectionAsync().catch(() => {});
    touch(addScan(lines, data));
  };

  const runPreview = async () => {
    if (!token || !warehouseId || !lines.length || busy) return;
    setBusy(true);
    setError("");
    try {
      setPreview(await request<any>("/stock/count-bulk/preview", { method: "POST", body: JSON.stringify(previewBody(warehouseId, lines)) }, token));
      key.current = newIdempotencyKey("count");
    } catch (e: any) {
      setError(countErrorText(e));
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    if (!token || !preview || busy || !canApply(preview.lines || [])) return;
    const body = applyBody(warehouseId, preview.lines, reason);
    const ok = await confirm({ title: "Sayım onaylansın mı?", message: `${body.lines.length} üründe stok sayılan miktara ayarlanır. ${summaryText(preview.summary)}`, confirmLabel: "Onayla" });
    if (!ok) return;
    if (!key.current) key.current = newIdempotencyKey("count");
    const k = key.current;
    setBusy(true);
    setError("");
    const out = await sendKeyedMoney(
      () => request<any>("/stock/count-bulk/apply", { method: "POST", body: JSON.stringify(body), headers: { "Idempotency-Key": k } }, token),
      () => confirm({ title: "Sonuç alınamadı", message: "Sayım kaydedilmiş olabilir. Aynı sayımı yeniden gönderirseniz ikinci kez yazılmaz.", confirmLabel: "Yeniden gönder" })
    );
    setBusy(false);
    if (out.ok) {
      const partial = out.result?.status === "partial";
      toast(applyResultText(out.result), partial ? "info" : "success");
      if (!partial) {
        setLines([]);
        setPreview(null);
        key.current = null;
      }
      return;
    }
    setError(countErrorText(out.error));
    if (out.error?.code === "STOCK_CHANGED") setPreview(null);
  };

  if (!mayWrite)
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Toplu sayım" />
        <EmptyState icon={<AlertIcon size={30} color={colors.textTertiary} />} title="Yetkiniz yok" description="Stok sayımı için ürün yönetimi yetkisi gerekir." />
      </View>
    );

  const rowsByCode = new Map<string, any>((preview?.lines || []).map((r: any) => [String(r.code_input || ""), r]));
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="stock-count-screen">
      <StackHeader title="Toplu sayım" subtitle="Barkodla say, farkları onayla" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.huge, gap: spacing.sm }} keyboardShouldPersistTaps="handled">
          {warehouses && warehouses.length > 1 ? (
            <>
              <SectionTitle title="Depo" />
              <ChipRow>
                {warehouses.map((w) => (
                  <Chip key={w.id} testID={`count-wh-${w.id}`} label={w.name} selected={warehouseId === w.id} onPress={() => (setWarehouseId(w.id), setPreview(null), (key.current = null))} />
                ))}
              </ChipRow>
            </>
          ) : null}

          <View style={styles.block}>
            {camera && Platform.OS !== "web" ? (
              permission?.granted ? (
                <View style={styles.camera}>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] }}
                    onBarcodeScanned={onScanned}
                  />
                  <View pointerEvents="none" style={styles.frame} />
                </View>
              ) : (
                <Button label="Kamera izni ver" onPress={requestPermission} />
              )
            ) : null}
            <View style={[styles.row, { marginTop: spacing.sm }]}>
              {Platform.OS !== "web" ? (
                <Button testID="count-camera" size="sm" variant={camera ? "primary" : "secondary"} label={camera ? "Kamerayı kapat" : "Barkod okut"} onPress={() => setCamera(!camera)} />
              ) : null}
            </View>
            <View style={[styles.row, { marginTop: spacing.sm }]}>
              <View style={{ flex: 1 }}>
                <FormField
                  testID="count-code"
                  label="Barkod / stok kodu"
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={() => (touch(addScan(lines, code)), setCode(""))}
                />
              </View>
              <Button testID="count-add" size="sm" label="Ekle" disabled={!code.trim()} onPress={() => (touch(addScan(lines, code)), setCode(""))} />
            </View>
          </View>

          {lines.length ? (
            <>
              <SectionTitle title="Sayılanlar" action={<Text style={[type.caption, { color: colors.textTertiary }]}>{`${lines.length} ürün`}</Text>} />
              <Card style={styles.block}>
                {lines.map((l, i) => {
                  const r = rowsByCode.get(l.code);
                  const tone = !r ? colors.textTertiary : r.status === "error" ? colors.error : r.status === "change" ? colors.amber : colors.success;
                  return (
                    <View key={l.code} testID={`count-line-${i}`} style={[styles.line, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
                          {r?.name || l.code}
                        </Text>
                        <Text style={[type.caption, { color: tone }]} numberOfLines={2}>
                          {!r
                            ? l.code
                            : r.status === "error"
                              ? r.detail
                              : r.status === "change"
                                ? `Beklenen ${r.expected} → sayılan ${r.counted} (${r.diff > 0 ? "+" : ""}${r.diff})`
                                : `Beklenen ${r.expected} · fark yok`}
                        </Text>
                      </View>
                      <View style={styles.stepper}>
                        <Pressable accessibilityLabel="Azalt" onPress={() => touch(setCount(lines, l.code, String(Math.max(0, l.counted - 1))))} style={[styles.step, { borderColor: colors.border }]}>
                          <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>−</Text>
                        </Pressable>
                        <Text style={[type.bodyStrong, tabular, { color: colors.textPrimary, minWidth: 32, textAlign: "center" }]}>{l.counted}</Text>
                        <Pressable accessibilityLabel="Artır" onPress={() => touch(setCount(lines, l.code, String(l.counted + 1)))} style={[styles.step, { borderColor: colors.border }]}>
                          <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>+</Text>
                        </Pressable>
                        <Pressable accessibilityLabel="Satırı sil" onPress={() => touch(removeLine(lines, l.code))} hitSlop={8}>
                          <Text style={[type.caption, { color: colors.error }]}>Sil</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </Card>
            </>
          ) : (
            <Text style={[type.caption, styles.block, { color: colors.textTertiary }]}>Barkod okutun ya da stok kodu yazıp ekleyin. Her okutma miktarı 1 artırır.</Text>
          )}

          <View style={[styles.block, { gap: spacing.sm }]}>
            {preview ? <Text testID="count-summary" style={[type.callout, { color: colors.textSecondary }]}>{summaryText(preview.summary)}</Text> : null}
            {preview && canApply(preview.lines || []) ? (
              <FormField testID="count-reason" label="Gerekçe (isteğe bağlı)" value={reason} onChangeText={setReason} placeholder="Örn. Ay sonu sayımı" maxLength={200} />
            ) : null}
            {preview && (preview.lines || []).some((r: any) => r.status === "error") ? (
              <Text style={[type.footnote, { color: colors.error }]}>Hatalı satırları silin ya da düzeltin; tek satır bile hatalıyken sayım yazılmaz.</Text>
            ) : null}
            {error ? (
              <Text testID="count-error" style={[type.footnote, { color: colors.error }]}>
                {error}
              </Text>
            ) : null}
            {!preview ? (
              <Button testID="count-preview" label="Farkları göster" busy={busy} disabled={!lines.length || !warehouseId} onPress={runPreview} />
            ) : (
              <>
                <Button testID="count-apply" label="Sayımı onayla" busy={busy} disabled={!canApply(preview.lines || [])} onPress={apply} />
                <Button variant="ghost" label="Önizlemeyi yenile" disabled={busy} onPress={runPreview} />
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  row: { flexDirection: "row", alignItems: "flex-end", gap: spacing.xs },
  camera: { height: 220, borderRadius: radius.xl, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "#000000" },
  frame: { width: "78%", height: 110, borderRadius: radius.lg, borderWidth: 2, borderColor: "#FFFFFF" },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  step: { width: 32, height: 32, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
