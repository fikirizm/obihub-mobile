import React from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import { markAllNotificationsRead, markNotificationRead, useNotifications } from "../src/notifications/store";
import { useTheme } from "../src/theme/ThemeProvider";
import { radius, spacing, type } from "../src/theme/tokens";
import { BellIcon, MailIcon } from "../src/components/Icons";
import { EmptyState } from "../src/components/EmptyState";
import { PlatformLogo } from "../src/components/PlatformLogo";
import { Button } from "../src/ui/Button";
import { StackHeader } from "../src/ui/Header";
import { IconTile, ListRow } from "../src/ui/ListRow";

function timeLabel(ts: number) {
  const diffMin = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (diffMin < 1) return "Şimdi";
  if (diffMin < 60) return `${diffMin} dk önce`;
  if (diffMin < 24 * 60) return `${Math.round(diffMin / 60)} sa önce`;
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
}

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const { list, unread } = useNotifications();

  const markAll = () => {
    markAllNotificationsRead();
    Notifications.setBadgeCountAsync(0).catch(() => {});
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="notifications-screen">
      <StackHeader title="Bildirimler" subtitle={unread > 0 ? `${unread} okunmamış` : undefined} />
      {unread > 0 ? (
        <View style={{ paddingHorizontal: spacing.lg, alignItems: "flex-end" }}>
          <Button testID="notifications-mark-all" label="Tümünü okundu say" variant="ghost" size="sm" onPress={markAll} />
        </View>
      ) : null}
      <FlatList
        data={list}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon={<BellIcon size={30} color={colors.textTertiary} />}
            title="Bildirim yok"
            description="Yeni siparişler ve destek yanıtları burada görünür."
          />
        }
        renderItem={({ item, index }) => (
          <View
            style={[
              styles.item,
              { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
              index === 0 && styles.first,
              index === list.length - 1 && styles.last,
            ]}
          >
            <ListRow
              testID={`notification-${item.id}`}
              divider={index > 0}
              leading={
                item.kind === "support" ? (
                  <IconTile><MailIcon size={18} color={colors.primary} /></IconTile>
                ) : (
                  <PlatformLogo provider={item.provider || ""} size="sm" />
                )
              }
              title={item.title}
              subtitle={item.body}
              meta={timeLabel(item.ts)}
              trailing={!item.read ? <View style={[styles.dot, { backgroundColor: colors.primary }]} accessibilityLabel="Okunmamış" /> : undefined}
              chevron={Boolean(item.orderId || item.ticketId)}
              onPress={() => {
                markNotificationRead(item.id);
                if (item.kind === "support" && item.ticketId) router.push({ pathname: "/support/[id]", params: { id: item.ticketId } });
                else if (item.orderId) router.push({ pathname: "/orders/[id]", params: { id: item.orderId, provider: item.provider || "" } });
              }}
            />
          </View>
        )}
      />
      {list.length > 0 ? (
        <Text style={[type.caption, { color: colors.textTertiary, textAlign: "center", paddingBottom: spacing.lg }]}>
          Bildirim geçmişi bu cihazda saklanır.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.huge },
  item: { borderLeftWidth: 1, borderRightWidth: 1 },
  first: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, overflow: "hidden" },
  last: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, overflow: "hidden" },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
