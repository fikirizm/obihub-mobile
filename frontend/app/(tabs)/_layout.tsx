import React, { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Tabs, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, RadialGradient, Stop, Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../src/auth/AuthProvider";
import { PushPrompt } from "../../src/components/PushPrompt";
import { canAccess } from "../../src/auth/permissions";
import { useTheme } from "../../src/theme/ThemeProvider";
import type { Palette } from "../../src/theme/tokens";
import { BagIcon, HomeIcon, MenuIcon, PlugIcon, WalletIcon } from "../../src/components/Icons";
import { badgeGeometry, CENTER_BADGE, TAB_LABELS, tabSlots, type TabName } from "../../src/tab-layout";

const MARK = require("../../assets/obihub/obihub-mark.png");

// Kullanıcı kararı (13 Kas 2026): Mağaza · Sipariş · [ObiHub rozeti = Panel] · Finans · Menü (src/tab-layout.ts).
// Rozet sıradan bir sekme değil, imza öğesi: marka gradyanlı daire, beyaz ObiHub işareti, çubukta yumuşak oyuk, altında marka ışığı.
const SIDE_TABS: Record<Exclude<TabName, "dashboard">, { Icon: typeof HomeIcon; accent: (c: Palette) => string }> = {
  integrations: { Icon: PlugIcon, accent: (c) => c.info },
  orders: { Icon: BagIcon, accent: (c) => c.amber },
  finance: { Icon: WalletIcon, accent: (c) => c.emerald },
  menu: { Icon: MenuIcon, accent: (c) => c.violet },
};
// Marka gradyanı (lacivert → mavi → camgöbeği → yeşil), logodaki renklerle.
const BRAND = ["#1E3A8A", "#2563EB", "#0EA5B7", "#22C55E"];
const BADGE = CENTER_BADGE.size; // rozet çapı
const BAR_H = CENTER_BADGE.barH; // çubuk içerik yüksekliği (güvenli alan hariç)
const NOTCH_R = CENTER_BADGE.notchR; // kavis yarıçapı (rozetle eş merkezli)
const LIFT = CENTER_BADGE.lift; // rozetin çubuk üst kenarından yukarı taşma miktarı
const GEO = badgeGeometry();
const HUMP = Math.ceil(-GEO.humpTop) + 2; // kavisin çubuk üstüne yükseldiği alan (SVG bu kadar yukarıdan başlar)

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

// Vurgu rengi açıksa (koyu temadaki turuncu, sarı gibi) simge koyu çizilir.
function inkOn(bg: string) {
  return 1.05 / (luminance(bg) + 0.05) >= 3 ? "#FFFFFF" : "#0B1220";
}

function TabButton({ label, Icon, accent, active, onPress, testID }: { label: string; Icon: typeof HomeIcon; accent: string; active: boolean; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = reduce ? (active ? 1.06 : 1) : withSpring(active ? 1.06 : 1, { damping: 16, stiffness: 220 });
  }, [active, scale, reduce]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      testID={testID}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPressIn={() => !reduce && (scale.value = withTiming(0.92, { duration: 90 }))}
      onPressOut={() => !reduce && (scale.value = withSpring(active ? 1.06 : 1, { damping: 16 }))}
      onPress={onPress}
      style={styles.tabBtn}
    >
      <Animated.View
        style={[
          styles.pill,
          active && { backgroundColor: accent, shadowColor: accent, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
          animated,
        ]}
      >
        <Icon size={22} color={active ? inkOn(accent) : colors.textSecondary} strokeWidth={active ? 2.2 : 1.8} />
      </Animated.View>
      <Text numberOfLines={1} style={[styles.label, { color: active ? colors.textPrimary : colors.textTertiary, fontWeight: active ? "700" : "500" }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// Ortadaki imza rozeti: Panel'i açar. Aktifken parlayan halka; basınca yaylı ölçek ve dokunsal geri bildirim.
function CenterBadge({ active, onPress }: { active: boolean; onPress: () => void }) {
  const { colors, mode } = useTheme();
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const glow = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    glow.value = reduce ? (active ? 1 : 0) : withTiming(active ? 1 : 0, { duration: 260 });
  }, [active, glow, reduce]);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 0.92 + glow.value * 0.08 }] }));
  return (
    <View style={styles.centerSlot} pointerEvents="box-none">
      <Pressable
        testID="tab-dashboard"
        accessibilityRole="tab"
        accessibilityLabel={TAB_LABELS.dashboard}
        accessibilityHint="ObiHub panelini açar"
        accessibilityState={{ selected: active }}
        onPressIn={() => !reduce && (scale.value = withTiming(0.9, { duration: 90 }))}
        onPressOut={() => !reduce && (scale.value = withSpring(1, { damping: 12, stiffness: 260 }))}
        onPress={onPress}
        hitSlop={8}
        style={styles.centerPress}
      >
        {/* Marka ışığı: rozetin altında yumuşak radyal parıltı. */}
        <View pointerEvents="none" style={styles.glow}>
          <Svg width={BADGE * 2} height={BADGE * 2}>
            <Defs>
              <RadialGradient id="obi-glow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#2563EB" stopOpacity={active ? 0.45 : 0.28} />
                <Stop offset="0.6" stopColor="#0EA5B7" stopOpacity={active ? 0.16 : 0.08} />
                <Stop offset="1" stopColor="#0EA5B7" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Circle cx={BADGE} cy={BADGE} r={BADGE} fill="url(#obi-glow)" />
          </Svg>
        </View>
        <Animated.View style={[styles.badgeWrap, pressStyle]}>
          {/* Aktif halka. */}
          <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: mode === "dark" ? "rgba(96,165,250,0.55)" : "rgba(37,99,235,0.35)" }, ringStyle]} />
          <View style={[styles.badge, { borderColor: colors.surface }]}>
            <Svg width={BADGE} height={BADGE} style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="obi-badge" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={BRAND[0]} />
                  <Stop offset="0.38" stopColor={BRAND[1]} />
                  <Stop offset="0.72" stopColor={BRAND[2]} />
                  <Stop offset="1" stopColor={BRAND[3]} />
                </LinearGradient>
                <LinearGradient id="obi-sheen" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.28" />
                  <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Circle cx={BADGE / 2} cy={BADGE / 2} r={BADGE / 2} fill="url(#obi-badge)" />
              <Circle cx={BADGE / 2} cy={BADGE / 2} r={BADGE / 2} fill="url(#obi-sheen)" />
            </Svg>
            <Image source={MARK} style={styles.mark} resizeMode="contain" tintColor="#FFFFFF" accessible={false} />
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

// Çubuk zemini (SVG): üst kenar ortada rozetle eş merkezli yumuşak bir kavisle yükselir ve rozeti sarar.
function BarShape({ width, height, fill, stroke }: { width: number; height: number; fill: string; stroke: string }) {
  if (!width) return null;
  const cx = width / 2;
  const r = NOTCH_R;
  const cy = GEO.centerY + HUMP; // SVG içindeki rozet merkezi (SVG, çubuğun HUMP pt üstünden başlar)
  const top = HUMP; // çubuk üst kenarının SVG içindeki y'si
  const half = Math.sqrt(Math.max(r * r - (cy - top) * (cy - top), 0)); // kavisin kenarla kesiştiği yarı genişlik
  const lift4 = top - 4;
  const inner = Math.sqrt(Math.max(r * r - (cy - lift4) * (cy - lift4), 0)); // kenarın 4 pt üstündeki yarı genişlik
  const fil = 12;
  const d = [
    `M0,${top}`,
    `L${cx - half - fil},${top}`,
    `Q${cx - half},${top} ${cx - inner},${lift4}`,
    `A${r},${r} 0 0 1 ${cx + inner},${lift4}`,
    `Q${cx + half},${top} ${cx + half + fil},${top}`,
    `L${width},${top} L${width},${height + HUMP} L0,${height + HUMP} Z`,
  ].join(" ");
  return (
    <Svg width={width} height={height + HUMP} style={{ position: "absolute", left: 0, top: -HUMP }} pointerEvents="none">
      <Path d={d} fill={fill} stroke={stroke} strokeWidth={StyleSheet.hairlineWidth * 2} />
    </Svg>
  );
}

function CustomTabBar({ state, navigation }: any) {
  const { colors, shadows } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const slots = tabSlots({ integrations: canAccess(user, "integrations") });
  const bottom = Math.max(insets.bottom, 8);
  const height = BAR_H + bottom;

  const go = (name: TabName) => {
    const idx = state.routes.findIndex((r: any) => r.name === name);
    if (idx < 0) return;
    const route = state.routes[idx];
    const active = state.index === idx;
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (!active && !event.defaultPrevented) {
      Haptics.selectionAsync().catch(() => {});
      navigation.navigate(route.name);
    }
  };
  const isActive = (name: TabName) => state.routes[state.index]?.name === name;

  const side = (name: TabName | null, i: number) =>
    name ? (
      <TabButton
        key={name}
        testID={`tab-${name}`}
        label={TAB_LABELS[name]}
        Icon={SIDE_TABS[name as Exclude<TabName, "dashboard">].Icon}
        accent={SIDE_TABS[name as Exclude<TabName, "dashboard">].accent(colors)}
        active={isActive(name)}
        onPress={() => go(name)}
      />
    ) : (
      <View key={`spacer-${i}`} style={styles.tabBtn} />
    );

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.bar, shadows.lg, { height, paddingBottom: bottom }]}
    >
      <BarShape width={width} height={height} fill={colors.surface} stroke={colors.borderSubtle} />
      {slots.left.map(side)}
      <CenterBadge
        active={isActive(slots.center)}
        onPress={() => {
          if (!isActive(slots.center)) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          go(slots.center);
        }}
      />
      {slots.right.map((n, i) => side(n, i + 10))}
    </View>
  );
}

export default function TabsLayout() {
  const { token, bootLoading } = useAuth();

  useEffect(() => {
    if (!bootLoading && !token) router.replace("/");
  }, [bootLoading, token]);

  if (bootLoading || !token) return null;

  return (
    <>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <CustomTabBar {...props} />}>
        <Tabs.Screen name="dashboard" />
        <Tabs.Screen name="integrations" />
        <Tabs.Screen name="orders" />
        <Tabs.Screen name="finance" />
        <Tabs.Screen name="menu" />
      </Tabs>
      {/* Bildirim izni: önce açıklama, sonra sistem izni (yalnız izin hiç sorulmamışsa). */}
      <PushPrompt />
    </>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 6, backgroundColor: "transparent", overflow: "visible" },
  tabBtn: { flex: 1, alignItems: "center", justifyContent: "center", height: BAR_H, gap: 4 },
  pill: { width: 48, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 12, letterSpacing: 0.1 },
  centerSlot: { width: BADGE + 28, height: BAR_H, alignItems: "center", overflow: "visible" },
  centerPress: { alignItems: "center", marginTop: -LIFT, width: BADGE + 28 },
  glow: { position: "absolute", top: -BADGE / 2 + 4, width: BADGE * 2, height: BADGE * 2, alignItems: "center", justifyContent: "center" },
  // Gölge dış katmanda: iOS, kırpma (overflow hidden) yapan katmanda gölge çizmez.
  badgeWrap: { width: BADGE, height: BADGE, borderRadius: BADGE / 2, alignItems: "center", justifyContent: "center", shadowColor: "#1D4ED8", shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  ring: { position: "absolute", width: BADGE + 12, height: BADGE + 12, borderRadius: (BADGE + 12) / 2, borderWidth: 2 },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
  },
  mark: { width: 30, height: 26 },
});
