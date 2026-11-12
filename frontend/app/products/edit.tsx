import React, { useEffect, useRef, useState } from "react";
import { FormSkeleton } from "../../src/components/Skeleton";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { getProductIdentity, updateProductIdentity } from "../../src/api-urun-stok";
import { recallProduct, rememberCatalog } from "../../src/catalogCache";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { PackageIcon, TagIcon, ZapIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { HeroCard, ON_HERO } from "../../src/ui/HeroCard";
import { IconTile } from "../../src/ui/ListRow";

const NAME_MAX = 255;
const CODE_MAX = 64;

export default function ProductEditScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id || "");
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const cached = recallProduct(id);
  const allowed = canManage(user, "catalog");

  // Kayıtlı (sunucudaki) değerler: değişiklik olup olmadığı bunlara göre anlaşılır.
  const [saved, setSaved] = useState<{ name: string; sku: string; barcode: string } | null>(
    cached ? { name: cached.name || "", sku: String(cached.sku || ""), barcode: String(cached.barcode || "") } : null
  );
  const [name, setName] = useState(saved?.name || "");
  const [sku, setSku] = useState(saved?.sku || "");
  const [barcode, setBarcode] = useState(saved?.barcode || "");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  // Kullanıcının yazdığı alanın üstüne sunucudan gelen değer yazılmaz; dokunulmamış alanlar güncel değerle tazelenir
  // (eski kopyadaki dokunulmamış SKU / barkod kaydederken sunucudaki güncel değeri ezmesin).
  const touched = useRef({ name: false, sku: false, barcode: false });
  const sending = useRef(false);

  useEffect(() => {
    let alive = true;
    if (!token || !id || !allowed) {
      setLoading(false);
      return;
    }
    getProductIdentity(token, id)
      .then((p) => {
        if (!alive) return;
        const fresh = { name: p.name || "", sku: String(p.sku || ""), barcode: String(p.barcode || "") };
        setSaved(fresh);
        if (!touched.current.name) setName(fresh.name);
        if (!touched.current.sku) setSku(fresh.sku);
        if (!touched.current.barcode) setBarcode(fresh.barcode);
      })
      .catch(() => {
        if (alive) setLoadFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token, id, allowed]);

  const edit = (field: "name" | "sku" | "barcode", setter: (v: string) => void) => (v: string) => {
    touched.current[field] = true;
    setter(v);
  };

  if (!allowed || !id) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Ürün bilgileri" />
        <EmptyState
          icon={<PackageIcon size={30} color={colors.textTertiary} />}
          title={allowed ? "Ürün bulunamadı" : "Bu işlem için yetkiniz bulunmuyor"}
          description={allowed ? "Ürünü listeden yeniden açın." : "Ürün bilgilerini düzenlemek için hesap yöneticinize başvurun."}
        />
      </View>
    );
  }

  // Sunucudaki değerler okunamadıysa ve önbellekte de yoksa form açılmaz (boş değerle üstüne yazılmasın).
  if (!saved) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="product-edit-screen">
        <StackHeader title="Ürün bilgileri" />
        {loading ? (
          <FormSkeleton fields={3} label="Ürün bilgileri yükleniyor" />
        ) : (
          <EmptyState icon={<PackageIcon size={30} color={colors.textTertiary} />} title="Ürün bilgileri okunamadı" description="Bağlantınızı kontrol edip ürünü yeniden açın." />
        )}
      </View>
    );
  }

  const next = { name: name.trim(), sku: sku.trim(), barcode: barcode.trim() };
  const anyTouched = touched.current.name || touched.current.sku || touched.current.barcode;
  const nameError = next.name.length === 0 ? "Ürün adı boş bırakılamaz." : null;
  const changed = next.name !== saved.name.trim() || next.sku !== saved.sku.trim() || next.barcode !== saved.barcode.trim();
  const codeChanged = next.sku !== saved.sku.trim() || next.barcode !== saved.barcode.trim();

  const submit = async () => {
    if (!token || nameError || !changed || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      // Yalnızca değişen alanlar yazılır (eski kopyadaki dokunulmamış alan sunucudaki güncel değeri ezmesin).
      const patch: { name?: string; sku?: string; barcode?: string } = {};
      if (next.name !== saved.name.trim()) patch.name = next.name;
      if (next.sku !== saved.sku.trim()) patch.sku = next.sku;
      if (next.barcode !== saved.barcode.trim()) patch.barcode = next.barcode;
      const res = await updateProductIdentity(token, id, patch);
      const written = { name: res.name || next.name, sku: String(res.sku ?? next.sku), barcode: String(res.barcode ?? next.barcode) };
      // Liste ve detay ekranı yeni değerleri önbellekten okur.
      const row = recallProduct(id);
      if (row) rememberCatalog([{ ...row, name: written.name, sku: written.sku, barcode: written.barcode }], []);
      toast("Ürün bilgileri güncellendi", "success");
      if (router.canGoBack()) router.back();
      else setSaved(written);
    } catch (e: any) {
      toast(e?.message || "Ürün bilgileri güncellenemedi.", "error");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const inputStyle = [styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="product-edit-screen">
      <StackHeader title="Ürün bilgileri" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <HeroCard tone="blue" style={styles.hero}>
            <View style={styles.heroRow}>
              <View style={styles.heroIcon}>
                <TagIcon size={22} color={ON_HERO.text} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.heroEyebrow}>Düzenlenen ürün</Text>
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {saved.name || "Adsız ürün"}
                </Text>
                <Text style={styles.heroSub} numberOfLines={1}>
                  {[saved.sku ? `SKU ${saved.sku}` : null, saved.barcode ? `Barkod ${saved.barcode}` : null].filter(Boolean).join(" · ") || "Kod yok"}
                </Text>
              </View>
              {loading ? <ActivityIndicator size="small" color={ON_HERO.soft} /> : null}
            </View>
          </HeroCard>

          {loadFailed ? (
            <View style={[styles.banner, { backgroundColor: colors.amberSoft }]} testID="product-edit-stale">
              <Text style={[type.footnote, { color: colors.amber }]}>Güncel değerler okunamadı. Alanlardaki bilgiler eski olabilir.</Text>
            </View>
          ) : null}

          <Text style={[type.callout, styles.label, { color: colors.textSecondary }]}>Ürün adı</Text>
          <TextInput
            testID="product-edit-name"
            value={name}
            onChangeText={edit("name", setName)}
            placeholder="Ürün adı"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Ürün adı"
            maxLength={NAME_MAX}
            multiline
            textAlignVertical="top"
            style={[inputStyle, styles.nameInput, nameError && anyTouched ? { borderColor: colors.error } : null]}
          />
          {nameError && anyTouched ? <Text style={[type.caption, { color: colors.error, marginTop: spacing.xs }]}>{nameError}</Text> : null}

          <Text style={[type.callout, styles.label, { color: colors.textSecondary }]}>SKU (stok kodu)</Text>
          <TextInput
            testID="product-edit-sku"
            value={sku}
            onChangeText={edit("sku", setSku)}
            placeholder="Stok kodu"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="SKU"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={CODE_MAX}
            returnKeyType="next"
            style={inputStyle}
          />

          <Text style={[type.callout, styles.label, { color: colors.textSecondary }]}>Barkod</Text>
          <TextInput
            testID="product-edit-barcode"
            value={barcode}
            onChangeText={edit("barcode", setBarcode)}
            placeholder="Barkod"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Barkod"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            maxLength={CODE_MAX}
            returnKeyType="done"
            onSubmitEditing={submit}
            style={inputStyle}
          />

          {codeChanged ? (
            <View style={[styles.banner, { backgroundColor: colors.amberSoft }]} testID="product-edit-code-warning">
              <Text style={[type.footnote, { color: colors.amber }]}>
                SKU ve barkod, siparişlerin ve pazaryeri ürünlerinin bu ürünle eşleştirilmesinde kullanılır. Değiştirdiğinizde pazaryerindeki kodlar kendiliğinden değişmez.
              </Text>
            </View>
          ) : null}

          <View style={styles.note}>
            <IconTile tint={colors.primarySoft}>
              <ZapIcon size={18} color={colors.primary} />
            </IconTile>
            <Text style={[type.caption, styles.noteText, { color: colors.textSecondary }]}>
              Değişiklik ObiHub ürün kaydına yazılır. Ürün ayarlarında ad eşitlemesi açıksa yeni ad WooCommerce mağazanıza da gönderilir. Stok ve fiyat ürün ekranından düzenlenir.
            </Text>
          </View>

          <Button testID="product-edit-save" label="Kaydet" busy={busy} disabled={Boolean(nameError) || !changed} onPress={submit} style={{ marginTop: spacing.lg }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: spacing.lg, paddingBottom: spacing.huge },
  hero: { marginHorizontal: 0 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  heroIcon: { width: 48, height: 48, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", backgroundColor: ON_HERO.faint },
  heroEyebrow: { color: ON_HERO.soft, fontSize: 12, fontWeight: "600" },
  heroTitle: { color: ON_HERO.text, fontSize: 17, lineHeight: 22, fontWeight: "700", marginTop: 2 },
  heroSub: { color: ON_HERO.soft, fontSize: 12, lineHeight: 16, marginTop: 4 },
  label: { marginTop: spacing.lg },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 48, fontSize: 15, marginTop: spacing.xs },
  nameInput: { minHeight: 72, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  banner: { marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md },
  note: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
  noteText: { flex: 1, minWidth: 0 },
});
