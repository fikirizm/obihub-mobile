import React, { useMemo, useState } from "react";
import { setAppBadge } from "../src/notifications/badge";
import { SectionList, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../src/auth/AuthProvider";
import { markSupportNotificationsRead } from "../src/api";
import { markAllNotificationsRead, markNotificationRead, useNotifications } from "../src/notifications/store";
import { groupNotifications, notificationChips, relativeTime } from "../src/notifications/view";
import { Chip, ChipRow } from "../src/ui/Chip";
import { useTheme } from "../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../src/theme/tokens";
import { FadeInDown } from "react-native-reanimated";
import { ArrowRightIcon, BellIcon, MailIcon } from "../src/components/Icons";
import { PressableScale } from "../src/components/KPICard";
import { SafeAnimatedView } from "../src/components/SafeAnimatedView";
import { EmptyState } from "../src/components/EmptyState";
import { PlatformLogo } from "../src/components/PlatformLogo";
import { Button } from "../src/ui/Button";
import { StackHeader } from "../src/ui/Header";
import { IconTile } from "../src/ui/ListRow";

// Web KABUK-1 ile aynı kısa zaman: şimdi · 12 dk · 3 sa · dün 16:20 · 12 Kas (gün sınırı İstanbul).
const timeLabel = (ts: number) => relativeTime(ts);

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const { list, unread } = useNotifications();
  const [filter, setFilter] = useState("all");
  const chips = notificationChips(list);
  // Seçili tür boşaldıysa (ör. temizlendi) Tümü'ne dönülür.
  const active = chips.some((c) => c.key === filter) ? filter : "all";
  const sections = useMemo(() => groupNotifications(list, active), [list, active]);

  const { token } = useAuth();
  const markAll = () => {
    markAllNotificationsRead();
    setAppBadge(0).catch(() => {});
    // Destek yanıtları sunucuda da okundu sayılır (web ve diğer cihazlarla eş); hata yerel işareti geri almaz.
    if (token) markSupportNotificationsRead(token).catch(() => undefined);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="notifications-screen">
      <StackHeader title="Bildirimler" subtitle={unread > 0 ? `${unread} okunmamış` : undefined} />
      {unread > 0 ? (
        <SafeAnimatedView entering={FadeInDown.duration(380)} style={styles.toolbar}>
          <View style={[styles.unreadPill, { backgroundColor: colors.primarySoft }]}>
            <BellIcon size={14} color={colors.primary} />
            <Text style={[type.caption, tabular, { color: colors.primary, fontWeight: "700" }]} numberOfLines={1}>
              {unread} okunmamış
            </Text>
          </View>
          <Button testID="notifications-mark-all" label="Tümünü okundu say" variant="ghost" size="sm" onPress={markAll} />
        </SafeAnimatedView>
      ) : null}
      {chips.length > 2 ? (
        <View style={styles.chips} testID="notification-chips">
          <ChipRow>
            {chips.map((c) => (
              <Chip key={c.key} testID={`notification-chip-${c.key}`} label={c.label} count={c.count} selected={active === c.key} onPress={() => setFilter(c.key)} />
            ))}
          </ChipRow>
        </View>
      ) : null}
      <SectionList
        sections={sections}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ListFooterComponent={
          list.length > 0 ? (
            <Text style={[type.caption, { color: colors.textTertiary, textAlign: "center", marginTop: spacing.lg }]}>Bildirim geçmişi bu cihazda saklanır.</Text>
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <Text style={[type.caption, styles.sectionTitle, { color: colors.textSecondary }]} accessibilityRole="header">
            {section.title}
          </Text>
        )}
        ListEmptyComponent={
          <EmptyState
            icon={<BellIcon size={30} color={colors.primary} />}
            title="Bildirim yok"
            description="Yeni siparişler ve destek yanıtları burada görünür."
          />
        }
        renderItem={({ item, index, section }) => {
          const unreadRow = !item.read;
          const canOpen = Boolean(item.orderId || item.ticketId);
          return (
            <View
              style={[
                styles.item,
                { backgroundColor: unreadRow ? colors.primarySoft : colors.surface, borderColor: colors.borderSubtle },
                index === 0 && styles.first,
                index === section.data.length - 1 && styles.last,
              ]}
            >
              <PressableScale
                testID={`notification-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel={[unreadRow ? "Okunmamış" : null, item.title, item.body, timeLabel(item.ts)].filter(Boolean).join(", ")}
                onPress={() => {
                  markNotificationRead(item.id);
                  if (item.kind === "support" && item.ticketId) router.push({ pathname: "/support/[id]", params: { id: item.ticketId } });
                  else if (item.orderId) router.push({ pathname: "/orders/[id]", params: { id: item.orderId, provider: item.provider || "" } });
                }}
              >
                <View style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  {item.kind === "support" ? (
                    <IconTile tint={unreadRow ? colors.surface : colors.emeraldSoft}>
                      <MailIcon size={18} color={colors.emerald} />
                    </IconTile>
                  ) : (
                    <PlatformLogo provider={item.provider || ""} size="sm" />
                  )}
                  <View style={styles.rowBody}>
                    <View style={styles.titleRow}>
                      <Text
                        style={[type.body, { color: colors.textPrimary, flex: 1, minWidth: 0, fontWeight: unreadRow ? "700" : "500" }]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      <Text style={[type.caption, { color: unreadRow ? colors.primary : colors.textTertiary }]} numberOfLines={1}>
                        {timeLabel(item.ts)}
                      </Text>
                    </View>
                    {item.body ? (
                      <Text style={[type.footnote, { color: unreadRow ? colors.textPrimary : colors.textSecondary, marginTop: 1 }]} numberOfLines={2}>
                        {item.body}
                      </Text>
                    ) : null}
                  </View>
                  {unreadRow ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
                  {canOpen ? <ArrowRightIcon size={16} color={colors.textTertiary} /> : null}
                </View>
              </PressableScale>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.huge },
  item: { borderLeftWidth: 1, borderRightWidth: 1 },
  first: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, overflow: "hidden" },
  last: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, overflow: "hidden" },
  chips: { marginBottom: spacing.xs },
  sectionTitle: { fontWeight: "700", letterSpacing: 0.3, marginTop: spacing.md, marginBottom: spacing.xs, marginLeft: 4 },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.xxs },
  unreadPill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 64, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  rowBody: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
