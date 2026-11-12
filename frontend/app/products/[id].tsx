import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { FadeInDown } from "react-native-reanimated";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { isUncertainWrite } from "../../src/api-finans";
import { channelLinkFor, channelPushBadge, getProductLinks, type ChannelPush, type ProductLinks, type PushBadge } from "../../src/api-urun-stok";
import { getCatalog, setChannelPrice, setChannelStock, setProductPrice, setProductStock, SYNC_NONE } from "../../src/api";
import { recallChannels, recallProduct, rememberCatalog } from "../../src/catalogCache";
import { useTheme } from "../../src/theme/ThemeProvider";
import { palette, radius, spacing, tabular, type } from "../../src/theme/tokens";
import { formatTry } from "../../src/utils";
import { ArrowRightIcon, LinkIcon, PackageIcon, ReceiptIcon, TagIcon, ZapIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { PressableScale } from "../../src/components/KPICard";
import { PlatformLogo } from "../../src/components/PlatformLogo";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { StockMovements } from "../../src/components/StockMovements";
import { DetailHero } from "../../src/ui/DetailHero";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { ON_HERO } from "../../src/ui/HeroCard";
import { Card, IconTile, SectionTitle } from "../../src/ui/ListRow";
import type { CatalogProduct, ChannelRef } from "../../src/types";

// Koyu gradyan üzerinde okunabilen uyarı kırmızısı (koyu tema paletinden).
const HERO_BAD = palette.dark.error;

// Yenilemede ürün aranırken okunacak en çok sayfa (sayfa başına 100 ürün).
const RELOAD_MAX_PAGES = 5;
type StockMode = "in" | "out" | "adjustment";
const UNSENT_NOTE = "Pazaryerine gönderilmedi";
// Trendyol sonucu sunucuda bekleniyor (yanıt "pending" ya da kesin); Hepsiburada ve n11 isteği kuyruğa alır.
const ASYNC_STOCK_CHANNELS = new Set(["hepsiburada", "n11"]);
const CHANNEL_KEPT_NOTE = "Kanala özel fiyat korundu";

// `status: "pending"`: pazaryeri (Trendyol) isteği kuyruğa aldı, sonuç kesinleşmedi; sunucu değeri henüz kaydetmedi.
type SyncOutcome = { message?: string; status?: string; synced_providers?: string[]; skipped_providers?: Record<string, string> };

function samePrice(a: number, b: number) {
  return Math.abs(a - b) < 0.005;
}

// Özet kartındaki rakam hücresi. Düzenlenebiliyorsa hücrenin kendisi dokunulabilir olur.
function HeroStat({
  label,
  value,
  bad,
  busy,
  onPress,
  testID,
  valueTestID,
}: {
  label: string;
  value: string;
  bad?: boolean;
  busy?: boolean;
  onPress?: () => void;
  testID: string;
  valueTestID: string;
}) {
  const inner = (
    <View style={styles.statInner}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text testID={valueTestID} style={[styles.statValue, tabular, { color: bad ? HERO_BAD : ON_HERO.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {onPress ? (
        <View style={styles.statHintRow}>
          {busy ? <ActivityIndicator size="small" color={ON_HERO.soft} /> : <Text style={styles.statHint}>Düzenle</Text>}
        </View>
      ) : null}
    </View>
  );
  if (!onPress) {
    return (
      <View style={styles.statCell} accessible accessibilityLabel={`${label}: ${value}`}>
        {inner}
      </View>
    );
  }
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}, Düzenle`}
      accessibilityState={{ busy: Boolean(busy), disabled: Boolean(busy) }}
      style={styles.statCell}
    >
      {inner}
    </PressableScale>
  );
}

// Kanal satırı: solda pazaryeri logosu, sağda değer; eşleşme yoksa soluk, ana stoktan farklıysa uyarı notu.
function ChannelRow({
  channel,
  value,
  matched,
  note,
  push,
  divider,
  busy,
  editable,
  onPress,
  testID,
}: {
  channel: ChannelRef;
  value: string;
  matched: boolean;
  note?: string;
  // Son kanal gönderiminin sonucu (channel_push).
  push?: PushBadge | null;
  divider: boolean;
  busy: boolean;
  editable: boolean;
  onPress?: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  const content = (
    <View style={[styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <View style={!matched && styles.dim}>
        <PlatformLogo provider={channel.platform} size="sm" />
      </View>
      <View style={styles.rowBody}>
        <Text style={[type.bodyStrong, { color: matched ? colors.textPrimary : colors.textSecondary }]} numberOfLines={1}>
          {channel.name}
        </Text>
        {!matched ? (
          <Text style={[type.caption, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
            Eşleştirilmemiş
          </Text>
        ) : note ? (
          <View style={[styles.notePill, { backgroundColor: colors.amberSoft }]}>
            <View style={[styles.noteDot, { backgroundColor: colors.amber }]} />
            <Text style={[type.caption, { color: colors.amber }]} numberOfLines={1}>
              {note}
            </Text>
          </View>
        ) : null}
        {matched && push ? (
          <View
            testID={`${testID}-push`}
            style={[
              styles.notePill,
              { backgroundColor: push.tone === "good" ? colors.successBg : push.tone === "bad" ? colors.errorBg : colors.backgroundElevated },
            ]}
          >
            <View
              style={[
                styles.noteDot,
                { backgroundColor: push.tone === "good" ? colors.success : push.tone === "bad" ? colors.error : colors.textTertiary },
              ]}
            />
            <Text
              style={[type.caption, { color: push.tone === "good" ? colors.success : push.tone === "bad" ? colors.error : colors.textSecondary, flexShrink: 1 }]}
              numberOfLines={3}
            >
              {push.label}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={[type.bodyStrong, tabular, styles.rowValue, { color: matched ? colors.textPrimary : colors.textTertiary }]} numberOfLines={1}>
        {value}
      </Text>
      {busy ? (
        <ActivityIndicator size="small" color={colors.textTertiary} />
      ) : editable ? (
        <ArrowRightIcon size={16} color={colors.textTertiary} />
      ) : null}
    </View>
  );
  if (!onPress) return <View testID={testID}>{content}</View>;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[channel.name, value, note, push?.label, "Düzenle"].filter(Boolean).join(", ")}
    >
      {content}
    </PressableScale>
  );
}

export default function ProductDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id || "");
  const { token, user, accountingProgram, accountingLoaded, reloadAccounting } = useAuth();
  const { colors } = useTheme();
  const { toast, promptNumber, promptEntry } = useFeedback();
  const [product, setProduct] = useState<CatalogProduct | null>(() => recallProduct(id));
  const [channels, setChannels] = useState<ChannelRef[]>(() => recallChannels());
  const [refreshing, setRefreshing] = useState(false);
  // Kanal başına son gönderim sonucu; liste uçları taşımadığı için ürün ucundan ayrıca okunur.
  const [pushMap, setPushMap] = useState<Record<string, ChannelPush>>({});
  const [pushKey, setPushKey] = useState(0);
  // Ürün belgesindeki eşleşmeler (channel_links / channel_details / Paraşüt); "Eşleştirmeler" bölümü bunu gösterir.
  const [links, setLinks] = useState<ProductLinks | null>(null);
  useEffect(() => {
    if (!token || !id) return;
    let alive = true;
    getProductLinks(token, id)
      .then((l) => {
        if (!alive) return;
        setLinks(l);
        setPushMap(l.push as Record<string, ChannelPush>);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token, id, pushKey]);
  const pushOf = (ch: ChannelRef) => channelPushBadge(pushMap[ch.id] || pushMap[ch.platform.toLowerCase()]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Bu ekranda ana değer değiştiği hâlde pazaryerine gönderilmemiş kanal satırları (kanal kimlikleri).
  const [unsent, setUnsent] = useState<{ stock: string[]; price: string[] }>({ stock: [], price: [] });
  // Toplu gönderimde kanala özel fiyatı olduğu için ana fiyat yerine kendi fiyatı gönderilen satırlar (kanal kimlikleri).
  const [keptChannel, setKeptChannel] = useState<string[]>([]);
  const canEdit = canManage(user, "inventory");
  // Ad / SKU / barkod ürün kartı bilgisidir: katalog yönetme izni ister.
  const canEditInfo = canManage(user, "catalog");
  // Değişince "Stok hareketleri" bölümü yeniden okunur.
  const [movementsKey, setMovementsKey] = useState(0);

  // Eşleştirme ekranından dönüldüğünde kanal satırları ve eşleşmeler sunucudan yeniden okunur.
  const backFromMatch = useRef(false);
  const reloadRef = useRef<((notify: boolean) => Promise<unknown>) | null>(null);
  const openMatch = (target: string) => {
    if (!product) return;
    backFromMatch.current = true;
    router.push({ pathname: "/products/match", params: { id: product.id, target } } as any);
  };

  // Bilgi düzenleme ekranından dönüldüğünde yeni ad ve kodlar önbellekten alınır.
  useFocusEffect(
    useCallback(() => {
      if (backFromMatch.current) {
        backFromMatch.current = false;
        setPushKey((k) => k + 1);
        reloadRef.current?.(false);
      }
      const cached = recallProduct(id);
      if (!cached) return;
      setProduct((prev) =>
        prev && (prev.name !== cached.name || prev.sku !== cached.sku || prev.barcode !== cached.barcode)
          ? { ...prev, name: cached.name, sku: cached.sku, barcode: cached.barcode }
          : prev
      );
    }, [id])
  );

  // Ürünü sunucudan yeniden okur. Tek ürün ucu olmadığı için listede aranır: en ayırt edici kodla (barkod, SKU, ad)
  // ve ürün bulunana ya da sonuçlar bitene kadar sayfa sayfa. Okunamazsa `notify` ile kullanıcıya bildirilir.
  const reload = useCallback(
    async (notify: boolean): Promise<CatalogProduct | null> => {
      if (!token || !product) return null;
      let fresh: CatalogProduct | null = null;
      try {
        const search = product.barcode || product.sku || product.name;
        for (let page = 1; page <= RELOAD_MAX_PAGES && !fresh; page += 1) {
          const res = await getCatalog(token, { search, page, perPage: 100 });
          rememberCatalog(res.products, res.channels);
          if (res.channels.length > 0) setChannels(res.channels);
          fresh = res.products.find((p) => p.id === product.id) || null;
          if (res.products.length === 0 || page * 100 >= res.total) break;
        }
      } catch {
        fresh = null;
      } finally {
        setRefreshing(false);
      }
      if (fresh) setProduct(fresh);
      else if (notify) toast("Güncel değerler okunamadı. Ekrandaki değerler eski olabilir.", "error");
      return fresh;
    },
    [token, product, toast]
  );

  // Değişikliği sunucuya yazar. Başarılıysa yazılan değer ekrana hemen uygulanır; ardından liste yeniden okunur.
  // Sonuç: başarılıysa sunucu yanıtı ve yeniden okunan ürün, değilse null.
  const run = async <R extends SyncOutcome>(
    key: string,
    action: () => Promise<R>,
    apply: (p: CatalogProduct) => CatalogProduct,
    done: string | ((res: R) => { message: string; kind: "success" | "error" })
  ): Promise<{ res: R; fresh: CatalogProduct | null } | null> => {
    setBusyKey(key);
    try {
      const res = await action();
      if (res?.status === "pending") {
        // Web gibi: değer ekrana uygulanmaz, sunucu sonucu kesinleşince kaydeder.
        toast(res.message || "Pazaryeri işlemi sürüyor; birkaç dakika içinde kesinleşir.", "info");
        await reload(false);
        return null;
      }
      setProduct((prev) => {
        if (!prev) return prev;
        const next = apply(prev);
        rememberCatalog([next], []);
        return next;
      });
      const skipped = Object.keys(res?.skipped_providers || {});
      if (skipped.length > 0) toast(`Kaydedildi, ancak şu kanallara gönderilemedi: ${skipped.join(", ")}`, "error");
      else if (typeof done === "string") toast(done, "success");
      else {
        const d = done(res);
        toast(d.message, d.kind);
      }
      const fresh = await reload(skipped.length === 0);
      return { res, fresh };
    } catch (e: any) {
      // Bağlantı koptuysa ya da sunucu hatasıysa istek işlenmiş olabilir (Ekle/Çıkart tekrarı stoğu iki kez değiştirir).
      toast(
        isUncertainWrite(e)
          ? "İşlemin uygulanıp uygulanmadığı bilinmiyor. Güncel değer yeniden okundu; tekrar etmeden önce kontrol edin."
          : e?.message || "Güncellenemedi.",
        "error"
      );
      // Sunucu yerel değeri yazıp kanal hatası döndürmüş olabilir; güncel durumu oku (hata iletisinin üstüne yazmadan).
      await reload(false);
      return null;
    } finally {
      setBusyKey(null);
      setMovementsKey((k) => k + 1);
      setPushKey((k) => k + 1);
    }
  };

  if (!product) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Ürün" />
        <EmptyState icon={<PackageIcon size={30} color={colors.textTertiary} />} title="Ürün bulunamadı" description="Ürünü listeden yeniden açın." />
      </View>
    );
  }

  const editBaseStock = async () => {
    if (!token) return;
    // Hedef muhasebe programı bilinmeden yazılmaz: sunucu boş hedefi "tüm kanallar" sayar.
    if (!accountingLoaded) {
      await reloadAccounting();
      toast("Muhasebe ayarı okunamadı. Bağlantıyı kontrol edip tekrar deneyin.", "error");
      return;
    }
    // Web ürün detayıyla aynı: Ekle / Çıkar / Sayım ve isteğe bağlı sebep (frontend/src/pages/ProductDetailPage.js).
    const entry = await promptEntry({
      title: "Stok güncelle",
      message: `${product.name}\nSatılabilir stok: ${product.stock} adet${accountingProgram ? "\nMuhasebe programına da yansıtılır; pazaryeri stokları ayrı güncellenir." : ""}`,
      initial: 0,
      suffix: "adet",
      noteLabel: "Sebep (isteğe bağlı)",
      methods: [
        { value: "in", label: "Ekle" },
        { value: "out", label: "Çıkart" },
        { value: "adjustment", label: "Eşitle" },
      ],
    });
    if (!entry) return;
    const mode = (entry.method || "in") as StockMode;
    const qty = Math.max(0, Math.round(entry.amount));
    if (mode !== "adjustment" && qty <= 0) {
      toast("Miktar sıfırdan büyük olmalı.", "error");
      return;
    }
    if (mode === "out" && qty > product.stock) {
      toast("Çıkarılan miktar mevcut stoktan büyük olamaz.", "error");
      return;
    }
    const next = mode === "in" ? product.stock + qty : mode === "out" ? product.stock - qty : qty;
    if (next === product.stock) return;
    // Kanala özel değeri olmayan satırlar ana stoğu yansıtır; bu değişiklik pazaryerine gitmediği için işaretlenir.
    const mirrored = product.channelStocks.filter((x) => x.stock === product.stock).map((x) => x.integration_id);
    const out = await run(
      "stock",
      () =>
        setProductStock(token, product.id, {
          mode,
          quantity: qty,
          reason: entry.note || undefined,
          syncTargets: [accountingProgram || SYNC_NONE],
        }),
      (p) => ({ ...p, stock: next }),
      mirrored.length > 0 ? "Stok güncellendi. Pazaryeri stokları değişmedi." : "Stok güncellendi"
    );
    if (out) setUnsent((u) => ({ ...u, stock: Array.from(new Set([...u.stock, ...mirrored])) }));
  };

  const editBasePrice = async () => {
    if (!token) return;
    // Kapsam aynı sayfada seçilir (iOS'ta art arda iki sayfa açılamaz). Varsayılan web ile aynı: bağlı tüm kanallar.
    const entry = await promptEntry({
      title: "Ana fiyat",
      message: product.name,
      initial: product.price,
      decimal: true,
      suffix: "₺",
      methods: [
        { value: "all", label: "Bağlı tüm kanallara gönder" },
        { value: "base", label: accountingProgram ? "Yalnız muhasebe programına" : "Yalnızca ana fiyat" },
      ],
    });
    if (!entry) return;
    const v = entry.amount;
    const pushAll = entry.method !== "base";
    if (v === product.price && !pushAll) return;
    if (!pushAll) {
      // Kanala özel fiyatı olmayan satırlar ana fiyatı yansıtır; bu değişiklik pazaryerine gitmediği için işaretlenir.
      const mirrored = product.channelPrices.filter((x) => samePrice(x.price, product.price)).map((x) => x.integration_id);
      const out = await run(
        "price",
        () => setProductPrice(token, product.id, v, [accountingProgram || SYNC_NONE]),
        (p) => ({ ...p, price: v }),
        mirrored.length > 0 ? "Fiyat güncellendi. Pazaryeri fiyatları değişmedi." : "Fiyat güncellendi"
      );
      if (out) setUnsent((u) => ({ ...u, price: Array.from(new Set([...u.price, ...mirrored])) }));
      return;
    }
    // Sunucu toplu gönderimde her kanala göndermez (ör. İdefix, Pazarama); yanıttaki `synced_providers` esas alınır.
    // Kanala özel fiyatı olan kanala sunucu ana fiyatı değil o kanalın kendi fiyatını gönderir (web ile aynı).
    const sentTo = (res: SyncOutcome) => {
      const synced = new Set((res.synced_providers || []).map((x) => String(x).toLowerCase()));
      return (ch: ChannelRef) => synced.has(ch.platform.toLowerCase());
    };
    const mirroredIds = product.channelPrices.filter((x) => samePrice(x.price, product.price)).map((x) => x.integration_id);
    const ownIds = product.channelPrices.filter((x) => !samePrice(x.price, product.price)).map((x) => x.integration_id);
    const missedOf = (res: SyncOutcome) => {
      const sent = sentTo(res);
      return channels.filter((ch) => mirroredIds.includes(ch.id) && !sent(ch));
    };
    const out = await run(
      "price",
      () => setProductPrice(token, product.id, v, null),
      (p) => ({ ...p, price: v }),
      (res) => {
        const missed = missedOf(res);
        return missed.length > 0
          ? { message: `Fiyat güncellendi, ancak şu kanallara gönderilmedi: ${missed.map((ch) => ch.name).join(", ")}`, kind: "error" }
          : {
              message: ownIds.length > 0 ? "Fiyat gönderildi. Kanala özel fiyatı olan kanallarda o fiyat korundu." : "Fiyat güncellendi ve kanallara gönderildi",
              kind: "success",
            };
      }
    );
    if (!out) return;
    const sent = sentTo(out.res);
    const sentIds = channels.filter(sent).map((ch) => ch.id);
    const missedIds = missedOf(out.res).map((ch) => ch.id);
    setUnsent((u) => ({ ...u, price: Array.from(new Set([...u.price.filter((cid) => !sentIds.includes(cid)), ...missedIds])) }));
    setKeptChannel(ownIds.filter((cid) => sentIds.includes(cid)));
  };

  const editChannelStock = async (ch: ChannelRef, current: number) => {
    if (!token) return;
    const v = await promptNumber({ title: `${ch.name} stoğu`, message: product.name, initial: current, suffix: "adet" });
    if (v === null || v === current) return;
    const out = await run(
      `cs-${ch.id}`,
      () => setChannelStock(token, product.id, ch.id, v),
      (p) => ({ ...p, channelStocks: p.channelStocks.map((x) => (x.integration_id === ch.id ? { ...x, stock: v } : x)) }),
      // Hepsiburada ve n11 stok isteğini kuyruğa alır; sunucunun "başarılı" yanıtı pazaryerinin değeri işlediği
      // anlamına gelmez. Kullanıcıya "güncellendi" yerine "iletildi" denir.
      ASYNC_STOCK_CHANNELS.has(ch.platform.toLowerCase())
        ? `${ch.name} stoğu iletildi. Pazaryerinde görünmesi birkaç dakika sürebilir.`
        : `${ch.name} stoğu güncellendi`
    );
    if (out) setUnsent((u) => ({ ...u, stock: u.stock.filter((cid) => cid !== ch.id) }));
  };

  const editChannelPrice = async (ch: ChannelRef, current: number) => {
    if (!token) return;
    const v = await promptNumber({ title: `${ch.name} fiyatı`, message: product.name, initial: current, decimal: true, suffix: "₺" });
    if (v === null || v === current) return;
    const out = await run(
      `cp-${ch.id}`,
      () => setChannelPrice(token, product.id, ch.id, v),
      (p) => ({ ...p, channelPrices: p.channelPrices.map((x) => (x.integration_id === ch.id ? { ...x, price: v } : x)) }),
      `${ch.name} fiyatı güncellendi`
    );
    if (out) {
      setUnsent((u) => ({ ...u, price: u.price.filter((cid) => cid !== ch.id) }));
      setKeptChannel((prev) => prev.filter((cid) => cid !== ch.id));
    }
  };

  const hasImage = Boolean(product.image_url && /^https?:\/\//i.test(product.image_url));
  reloadRef.current = reload;
  // Eşleştirme hedefleri: her mağaza ve (Paraşüt bağlıysa) muhasebe ürünü. BizimHesap/BenimPOS eşleştirmesi web'de toplu yapılır.
  const matchTargets = [
    ...channels.map((ch) => {
      const l = channelLinkFor(links, ch);
      const matchedRow = product.channelStocks.some((x) => x.integration_id === ch.id) || product.channelPrices.some((x) => x.integration_id === ch.id);
      const linked = Boolean(l && !l.otherStore) || (!links && matchedRow);
      const state = l?.otherStore
        ? "Aynı pazaryerinin başka mağazasıyla eşleşik"
        : linked
          ? ["Eşleşik", l?.externalId ? `Kimlik ${l.externalId}` : null, l?.barcode ? `Barkod ${l.barcode}` : null].filter(Boolean).join(" · ")
          : "Eşleştirilmemiş";
      return { key: ch.id, name: ch.name, platform: ch.platform, linked, state, warn: Boolean(l?.otherStore) };
    }),
    ...(accountingProgram === "parasut"
      ? [
          {
            key: "parasut",
            name: "Paraşüt",
            platform: "parasut",
            linked: Boolean(links?.parasutProductId),
            state: links?.parasutProductId ? `Eşleşik · ${links.parasutProductName || `Kimlik ${links.parasutProductId}`}` : "Eşleştirilmemiş",
            warn: false,
          },
        ]
      : []),
  ];
  const lowStock = product.stock <= 5;
  const reserved = Number(product.reserved || 0);
  const onHand = typeof product.onHand === "number" ? product.onHand : product.stock + reserved;
  // Özet kartının başlığı iki satırla sınırlıdır; uzun adlar ve kodlar kesilmeden, seçilebilir biçimde altında gösterilir.
  const longName = product.name.length > 40;
  const codes = [
    product.sku ? { label: "SKU", value: String(product.sku) } : null,
    product.barcode ? { label: "Barkod", value: String(product.barcode) } : null,
  ].filter((c): c is { label: string; value: string } => c !== null);
  const matchedStocks = channels.filter((ch) => product.channelStocks.some((x) => x.integration_id === ch.id)).length;
  const matchedPrices = channels.filter((ch) => product.channelPrices.some((x) => x.integration_id === ch.id)).length;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="product-detail-screen">
      <StackHeader title="Ürün" />
      <ScrollView
        contentContainerStyle={{ paddingTop: spacing.xs, paddingBottom: spacing.huge }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setMovementsKey((k) => k + 1); setPushKey((k) => k + 1); reload(true); }} tintColor={colors.primary} />}
      >
        <DetailHero
          tone="blue"
          testID="product-hero"
          leading={
            <View style={styles.image}>
              {hasImage ? (
                <ExpoImage source={{ uri: product.image_url as string }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
              ) : (
                <PackageIcon size={28} color={ON_HERO.soft} />
              )}
            </View>
          }
          title={product.name}
          subtitle={codes.length === 0 ? "Kod yok" : undefined}
        >
          {longName || codes.length > 0 ? (
            <View style={styles.identity}>
              {longName ? (
                <Text testID="product-full-name" style={styles.fullName} selectable>
                  {product.name}
                </Text>
              ) : null}
              {codes.map((c) => (
                <View key={c.label} style={styles.codeRow}>
                  <Text style={styles.codeLabel}>{c.label}</Text>
                  <Text style={[styles.codeValue, tabular]} selectable>
                    {c.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.stats}>
            <HeroStat
              label="Satılabilir stok"
              value={String(product.stock)}
              bad={lowStock}
              busy={busyKey === "stock"}
              onPress={canEdit ? editBaseStock : undefined}
              testID="product-edit-stock"
              valueTestID="product-stock"
            />
            <View style={styles.statDivider} />
            <HeroStat
              label="Ana fiyat"
              value={formatTry(product.price)}
              busy={busyKey === "price"}
              onPress={canEdit ? editBasePrice : undefined}
              testID="product-edit-price"
              valueTestID="product-price"
            />
          </View>
          <View style={styles.figures} testID="product-stock-figures" accessible accessibilityLabel={`Elde ${onHand}, ayrılmış ${reserved}, satılabilir ${product.stock}`}>
            {[
              { k: "on-hand", label: "Elde", v: onHand },
              { k: "reserved", label: "Ayrılmış", v: reserved },
              { k: "sellable", label: "Satılabilir", v: product.stock },
            ].map((f) => (
              <View key={f.k} style={styles.figure} testID={`product-stock-figures-${f.k}`}>
                <Text style={styles.figureLabel}>{f.label}</Text>
                <Text style={[styles.figureValue, tabular, f.v < 0 && { color: HERO_BAD }]}>{f.v.toLocaleString("tr-TR")}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.figureHint}>Ayrılmış: stoğu düşülmüş, henüz kargoya verilmemiş siparişler.</Text>
          {lowStock ? (
            <View style={styles.lowRow}>
              <View style={[styles.lowDot, { backgroundColor: HERO_BAD }]} />
              <Text style={styles.lowText} numberOfLines={1}>
                Stok azaldı
              </Text>
            </View>
          ) : null}
          {canEditInfo ? (
            <PressableScale
              testID="product-edit-info"
              onPress={() => router.push({ pathname: "/products/edit", params: { id: product.id } } as any)}
              accessibilityRole="button"
              accessibilityLabel="Ad ve kodları düzenle"
              style={styles.editInfo}
            >
              <TagIcon size={16} color={ON_HERO.text} />
              <Text style={styles.editInfoText} numberOfLines={1}>
                Ad ve kodları düzenle
              </Text>
              <ArrowRightIcon size={16} color={ON_HERO.soft} />
            </PressableScale>
          ) : null}
        </DetailHero>

        {channels.length > 0 ? (
          <>
            <SafeAnimatedView entering={FadeInDown.delay(80).duration(380)}>
              <SectionTitle
                title="Kanal stokları"
                action={
                  <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>
                    {`${matchedStocks} / ${channels.length} eşleşti`}
                  </Text>
                }
              />
              <Card style={styles.block}>
                {channels.map((ch, i) => {
                  const row = product.channelStocks.find((x) => x.integration_id === ch.id);
                  return (
                    <ChannelRow
                      key={ch.id}
                      testID={`channel-stock-${ch.id}`}
                      channel={ch}
                      divider={i > 0}
                      matched={Boolean(row)}
                      value={row ? `${row.stock} adet` : "-"}
                      note={!row ? undefined : row.pending != null ? `İşlem sürüyor: ${row.pending} adet` : unsent.stock.includes(ch.id) ? UNSENT_NOTE : row.stock !== product.stock ? "Ana stoktan farklı" : undefined}
                      push={row ? pushOf(ch) : null}
                      busy={busyKey === `cs-${ch.id}`}
                      editable={canEdit && Boolean(row)}
                      onPress={canEdit && row && !busyKey ? () => editChannelStock(ch, row.stock) : !row && canEditInfo ? () => openMatch(ch.id) : undefined}
                    />
                  );
                })}
              </Card>
            </SafeAnimatedView>

            <SafeAnimatedView entering={FadeInDown.delay(150).duration(380)}>
              <SectionTitle
                title="Kanal fiyatları"
                action={
                  <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>
                    {`${matchedPrices} / ${channels.length} eşleşti`}
                  </Text>
                }
              />
              <Card style={styles.block}>
                {channels.map((ch, i) => {
                  const row = product.channelPrices.find((x) => x.integration_id === ch.id);
                  return (
                    <ChannelRow
                      key={ch.id}
                      testID={`channel-price-${ch.id}`}
                      channel={ch}
                      divider={i > 0}
                      matched={Boolean(row)}
                      value={row ? formatTry(row.price) : "-"}
                      note={!row ? undefined : row.pending != null ? `İşlem sürüyor: ${formatTry(row.pending)}` : unsent.price.includes(ch.id) ? UNSENT_NOTE : keptChannel.includes(ch.id) && !samePrice(row.price, product.price) ? CHANNEL_KEPT_NOTE : undefined}
                      push={row ? pushOf(ch) : null}
                      busy={busyKey === `cp-${ch.id}`}
                      editable={canEdit && Boolean(row)}
                      onPress={canEdit && row && !busyKey ? () => editChannelPrice(ch, row.price) : !row && canEditInfo ? () => openMatch(ch.id) : undefined}
                    />
                  );
                })}
              </Card>
            </SafeAnimatedView>

            <SafeAnimatedView entering={FadeInDown.delay(190).duration(380)}>
              <SectionTitle title="Eşleştirmeler" />
              <Card style={styles.block}>
                {matchTargets.map((t, i) => (
                  <PressableScale
                    key={t.key}
                    testID={`match-row-${t.key}`}
                    disabled={!canEditInfo}
                    onPress={canEditInfo ? () => openMatch(t.key) : undefined}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.name}, ${t.state}${canEditInfo ? ", eşleştirmeyi aç" : ""}`}
                    style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                  >
                    <View style={!t.linked && styles.dim}>
                      {t.platform === "parasut" ? (
                        <IconTile tint={colors.primarySoft}>
                          <ReceiptIcon size={18} color={colors.primary} />
                        </IconTile>
                      ) : (
                        <PlatformLogo provider={t.platform} size="sm" />
                      )}
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
                        {t.name}
                      </Text>
                      <Text style={[type.caption, { color: t.warn ? colors.amber : colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
                        {t.state}
                      </Text>
                    </View>
                    {canEditInfo ? (
                      <View style={[styles.matchPill, { backgroundColor: t.linked ? colors.surfaceMuted : colors.primarySoft }]}>
                        <Text style={[type.caption, { color: t.linked ? colors.textSecondary : colors.primary, fontWeight: "600" }]}>
                          {t.linked ? "Değiştir" : "Eşleştir"}
                        </Text>
                      </View>
                    ) : null}
                  </PressableScale>
                ))}
              </Card>
            </SafeAnimatedView>

            <SafeAnimatedView entering={FadeInDown.delay(220).duration(380)} style={styles.note}>
              <IconTile tint={colors.primarySoft}>
                <ZapIcon size={18} color={colors.primary} />
              </IconTile>
              <Text style={[type.caption, styles.noteText, { color: colors.textSecondary }]}>
                Kanal değeri değiştiğinde ilgili pazaryerine hemen gönderilir. Kanala özel değer girilmemişse satır ana stoğu ve ana fiyatı gösterir; ana değerde yapılan değişiklik pazaryerine kendiliğinden gönderilmez.
              </Text>
            </SafeAnimatedView>
          </>
        ) : (
          <SafeAnimatedView entering={FadeInDown.delay(80).duration(380)}>
            <Card padded style={[styles.block, styles.emptyCard]}>
              <IconTile tint={colors.primarySoft}>
                <LinkIcon size={18} color={colors.primary} />
              </IconTile>
              <Text style={[type.footnote, styles.noteText, { color: colors.textSecondary }]}>
                Kanal bilgisi henüz yüklenmedi. Yenilemek için ekranı aşağı çekin.
              </Text>
            </Card>
          </SafeAnimatedView>
        )}

        <SafeAnimatedView entering={FadeInDown.delay(260).duration(380)}>
          <StockMovements token={token} productId={product.id} refreshKey={movementsKey} />
        </SafeAnimatedView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  image: { width: 64, height: 64, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: ON_HERO.faint },
  identity: { marginTop: spacing.md, gap: 6 },
  fullName: { color: ON_HERO.soft, fontSize: 13, lineHeight: 18 },
  codeRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  codeLabel: { color: ON_HERO.soft, fontSize: 12, lineHeight: 18, fontWeight: "600", width: 52 },
  codeValue: { flex: 1, minWidth: 0, color: ON_HERO.text, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  stats: { flexDirection: "row", alignItems: "stretch", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: ON_HERO.faint },
  statCell: { flex: 1, minWidth: 0, minHeight: 64, justifyContent: "center" },
  statInner: { alignItems: "center", paddingHorizontal: 4 },
  statLabel: { color: ON_HERO.soft, fontSize: 12, fontWeight: "500" },
  statValue: { fontSize: 22, fontWeight: "800", marginTop: 2, letterSpacing: -0.4 },
  statHintRow: { height: 20, marginTop: 2, alignItems: "center", justifyContent: "center" },
  statHint: { color: ON_HERO.soft, fontSize: 12, fontWeight: "600", textDecorationLine: "underline" },
  statDivider: { width: 1, backgroundColor: ON_HERO.faint, marginVertical: 4 },
  lowRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  lowDot: { width: 6, height: 6, borderRadius: 3 },
  editInfo: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, minHeight: 44, marginTop: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: ON_HERO.faint },
  editInfoText: { color: ON_HERO.text, fontSize: 14, fontWeight: "600", flexShrink: 1 },
  lowText: { color: ON_HERO.soft, fontSize: 12, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 60, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  rowBody: { flex: 1, minWidth: 0, alignItems: "flex-start" },
  rowValue: { flexShrink: 0, maxWidth: "45%", textAlign: "right" },
  dim: { opacity: 0.45 },
  figures: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  figure: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.08)" },
  figureLabel: { color: ON_HERO.soft, fontSize: 12 },
  figureValue: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", marginTop: 2 },
  figureHint: { color: ON_HERO.soft, fontSize: 12, marginTop: spacing.xs },
  notePill: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, maxWidth: "100%" },
  noteDot: { width: 6, height: 6, borderRadius: 3 },
  note: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md },
  noteText: { flex: 1, minWidth: 0 },
  matchPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  emptyCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
});
