// Dalga B3 — ürün detayında görseller ve satış durumu.
// Görsel: kamera / fotoğraflardan seçilir, POST /products/{id}/images (multipart) ile yüklenir. Ana görsel ve kaldırma
// PATCH /products/{id} {images, image_url} ile (web ile aynı). Yüklenmiş görsel (uploaded_images) DELETE ile kaldırılır;
// sunucu PATCH ile listeden çıkan yüklenmiş görseli de R2'den siler.
// Satış durumu: POST /products/{id}/bulk-sales-status {open|close} — eşleşik tüm kanallarda.
import React, { useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { deleteProductImage, patchProductImages, setProductSalesStatus, uploadProductImages, type ProductLinks, type UploadFile } from "../api-urun-stok";
import { haptic } from "../haptics";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, type } from "../theme/tokens";
import { useFeedback } from "../ui/Feedback";
import { Button } from "../ui/Button";
import { Card, SectionTitle } from "../ui/ListRow";
import { AlertIcon, PlusIcon } from "./Icons";
import { PressableScale } from "./KPICard";

const MAX_FILES = 10;
const MAX_BYTES = 10 * 1024 * 1024;
// Bu oturumda yüklenen görsellerin adres → kimlik eşlemesi (silmede R2'den de kaldırmak için).
const uploadedIds = new Map<string, string>();

const mimeOf = (a: ImagePicker.ImagePickerAsset) => {
  const t = String(a.mimeType || "").toLowerCase();
  if (t === "image/png" || t === "image/webp" || t === "image/jpeg") return t;
  const n = String(a.fileName || a.uri).toLowerCase();
  return n.endsWith(".png") ? "image/png" : n.endsWith(".webp") ? "image/webp" : "image/jpeg";
};

function uploadError(e: any): string {
  const s = Number(e?.status || 0);
  if (s === 413) return "Görsel 10 MB'tan büyük; daha küçük bir görsel seçin.";
  if (s === 415) return "Yalnız JPEG, PNG ya da WebP görsel yüklenebilir.";
  if (s === 503) return "Görsel depolama şu an kullanılamıyor. Biraz sonra yeniden deneyin.";
  return e?.message || "Görsel yüklenemedi.";
}

export function ProductMedia({
  token,
  productId,
  links,
  canEdit,
  onChanged,
}: {
  token: string;
  productId: string;
  links: ProductLinks | null;
  canEdit: boolean;
  onChanged: (imageUrl: string | null) => void;
}) {
  const { colors } = useTheme();
  const { toast, confirm, choose } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  const images = links?.images || [];
  const main = links?.imageUrl || images[0] || "";

  const pick = async () => {
    if (busy) return;
    const source =
      Platform.OS === "web"
        ? "library"
        : await choose<"camera" | "library">({
            title: "Görsel ekle",
            options: [
              { value: "camera", label: "Fotoğraf çek" },
              { value: "library", label: "Fotoğraflardan seç" },
            ],
          });
    if (!source) return;
    try {
      const perm = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        toast(source === "camera" ? "Kamera izni verilmedi. Ayarlar'dan izin verebilirsiniz." : "Fotoğraflara erişim izni verilmedi. Ayarlar'dan izin verebilirsiniz.", "error");
        return;
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.8, allowsMultipleSelection: source === "library", selectionLimit: MAX_FILES };
      const res = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.length) return;
      const assets = res.assets.slice(0, MAX_FILES);
      if (assets.some((a) => (a.fileSize || 0) > MAX_BYTES)) {
        toast("Görsel 10 MB'tan büyük; daha küçük bir görsel seçin.", "error");
        return;
      }
      const files: UploadFile[] = assets.map((a, i) => {
        const type = mimeOf(a);
        return { uri: a.uri, type, name: a.fileName || `urun-${Date.now()}-${i}.${type.split("/")[1].replace("jpeg", "jpg")}` };
      });
      setBusy("upload");
      const out = await uploadProductImages(token, productId, files);
      out.images.forEach((im: { id: string; url: string }) => im.id && im.url && uploadedIds.set(im.url, im.id));
      toast(out.images.length > 1 ? `${out.images.length} görsel eklendi.` : "Görsel eklendi.", "success");
      onChanged(out.imageUrl || null);
    } catch (e: any) {
      toast(uploadError(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const act = async (url: string) => {
    if (busy || !canEdit) return;
    const action = await choose<"main" | "remove">({
      title: "Görsel",
      options: [...(url !== main ? [{ value: "main" as const, label: "Ana görsel yap" }] : []), { value: "remove" as const, label: "Kaldır" }],
    });
    if (!action) return;
    if (action === "remove") {
      const ok = await confirm({ title: "Görsel kaldırılsın mı?", message: "Görsel üründen kaldırılır.", confirmLabel: "Kaldır", destructive: true });
      if (!ok) return;
    }
    setBusy(url);
    try {
      if (action === "main") {
        await patchProductImages(token, productId, images, url);
        haptic.success();
        onChanged(url);
      } else {
        // Yüklenmiş görselin kimliği sunucudan (uploaded_images) ya da bu oturumdaki yüklemeden; yoksa PATCH (sunucu R2'den de siler).
        const id = uploadedIds.get(url) || links?.uploadedImages.find((u) => u.url === url)?.id;
        if (id) {
          const r = await deleteProductImage(token, productId, id);
          uploadedIds.delete(url);
          onChanged(r?.image_url ?? null);
        } else {
          const rest = images.filter((u) => u !== url);
          const nextMain = url === main ? rest[0] || null : main || null;
          await patchProductImages(token, productId, rest, nextMain);
          onChanged(nextMain);
        }
        toast("Görsel kaldırıldı.", "success");
      }
    } catch (e: any) {
      toast(e?.message || "Görsel güncellenemedi.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View testID="product-media">
      <SectionTitle title="Görseller" action={<Text style={[type.caption, { color: colors.textTertiary }]}>{images.length ? `${images.length} görsel` : ""}</Text>} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {images.map((u, i) => (
          <PressableScale
            key={u}
            testID={`media-${i}`}
            onPress={() => act(u)}
            disabled={!canEdit}
            accessibilityRole="button"
            accessibilityLabel={u === main ? "Ana görsel" : "Görsel"}
            style={[styles.thumb, { borderColor: u === main ? colors.primary : colors.borderSubtle, backgroundColor: colors.surfaceMuted }]}
          >
            <ExpoImage source={{ uri: u }} style={styles.img} contentFit="cover" transition={150} />
            {u === main ? (
              <View style={[styles.mainTag, { backgroundColor: colors.primary }]}>
                <Text style={styles.mainText}>Ana</Text>
              </View>
            ) : null}
            {busy === u ? (
              <View style={styles.busy}>
                <ActivityIndicator color="#FFFFFF" />
              </View>
            ) : null}
          </PressableScale>
        ))}
        {canEdit ? (
          <PressableScale
            testID="media-add"
            onPress={pick}
            accessibilityRole="button"
            accessibilityLabel="Görsel ekle"
            style={[styles.thumb, styles.add, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            {busy === "upload" ? <ActivityIndicator color={colors.primary} /> : <PlusIcon size={22} color={colors.primary} />}
            <Text style={[type.caption, { color: colors.primary, fontWeight: "600" }]}>{busy === "upload" ? "Yükleniyor" : "Ekle"}</Text>
          </PressableScale>
        ) : null}
        {!images.length && !canEdit ? <Text style={[type.footnote, { color: colors.textTertiary }]}>Bu üründe görsel yok.</Text> : null}
      </ScrollView>
    </View>
  );
}

// Eşleşik kanallarda satış durumu. Sunucu kanal başına active/inactive tutar; karışık durumda ikisi de sunulur.
export function ProductSalesStatus({
  token,
  productId,
  links,
  canEdit,
  onChanged,
}: {
  token: string;
  productId: string;
  links: ProductLinks | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState<"open" | "close" | null>(null);
  const linked = Object.keys(links?.channelLinks || {}).length + (links?.parasutProductId ? 1 : 0);
  if (!links || linked === 0) return null;
  const values = Object.values(links.salesStatus || {});
  const closed = values.filter((v) => v === "inactive").length;
  const state = closed === 0 ? "open" : closed >= values.length && values.length > 0 ? "closed" : "mixed";

  const run = async (action: "open" | "close") => {
    if (busy) return;
    const ok = await confirm({
      title: action === "open" ? "Tüm kanallarda satışa açılsın mı?" : "Tüm kanallarda satışa kapatılsın mı?",
      message: `Ürünün eşleşik olduğu ${linked} kanalda satış durumu ${action === "open" ? "açık" : "kapalı"} yapılır.`,
      confirmLabel: action === "open" ? "Satışa aç" : "Satışa kapat",
      destructive: action === "close",
    });
    if (!ok) return;
    setBusy(action);
    try {
      const r = await setProductSalesStatus(token, productId, action);
      toast(`${r?.affected_count ?? linked} kanalda ${action === "open" ? "satışa açıldı" : "satışa kapatıldı"}.`, "success");
      onChanged();
    } catch (e: any) {
      toast(e?.message || "Satış durumu değiştirilemedi.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View testID="product-sales-status">
      <SectionTitle title="Satış durumu" />
      <Card style={styles.salesCard}>
        <View style={styles.salesHead}>
          <View style={[styles.dot, { backgroundColor: state === "open" ? colors.success : state === "closed" ? colors.error : colors.amber }]} />
          <Text style={[type.bodyStrong, { color: colors.textPrimary, flex: 1 }]}>
            {state === "open" ? "Satışta" : state === "closed" ? "Satışa kapalı" : "Bazı kanallarda kapalı"}
          </Text>
          <Text style={[type.caption, { color: colors.textTertiary }]}>{`${linked} kanal`}</Text>
        </View>
        {state === "mixed" ? (
          <View style={styles.salesNote}>
            <AlertIcon size={14} color={colors.amber} />
            <Text style={[type.caption, { color: colors.textSecondary, flex: 1 }]}>{`${closed} kanalda satışa kapalı.`}</Text>
          </View>
        ) : null}
        {canEdit ? (
          <View style={styles.salesActions}>
            {state !== "open" ? <Button testID="sales-open" size="sm" label="Satışa aç" busy={busy === "open"} onPress={() => run("open")} style={{ flex: 1 }} /> : null}
            {state !== "closed" ? (
              <Button testID="sales-close" size="sm" variant="secondary" label="Satışa kapat" busy={busy === "close"} onPress={() => run("close")} style={{ flex: 1 }} />
            ) : null}
          </View>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center", minHeight: 96 },
  thumb: { width: 88, height: 88, borderRadius: radius.md, borderWidth: 2, overflow: "hidden" },
  img: { width: "100%", height: "100%" },
  add: { borderStyle: "dashed", borderWidth: 1.5, alignItems: "center", justifyContent: "center", gap: 2 },
  mainTag: { position: "absolute", left: 4, top: 4, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill },
  mainText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  busy: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  salesCard: { marginHorizontal: spacing.lg, padding: spacing.md, gap: spacing.sm },
  salesHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  salesNote: { flexDirection: "row", gap: spacing.xs, alignItems: "center" },
  salesActions: { flexDirection: "row", gap: spacing.sm },
});
