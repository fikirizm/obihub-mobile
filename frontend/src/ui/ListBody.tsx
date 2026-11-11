import React from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { spacing } from "../theme/tokens";
import { InboxIcon } from "../components/Icons";
import { EmptyState } from "../components/EmptyState";
import { OrderCardSkeleton } from "../components/Skeleton";

type ListState<T> = {
  items: T[];
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  error: string | null;
  reload: () => void;
  refresh: () => void;
  loadMore: () => void;
};

// Sayfalı listelerin ortak gövdesi: iskelet, boş durum, hata, yenileme ve devamını yükleme.
export function ListBody<T extends { id: string }>({
  state,
  renderItem,
  emptyTitle,
  emptyDescription,
  header,
  icon,
}: {
  state: ListState<T>;
  renderItem: (item: T, index: number) => React.ReactElement;
  emptyTitle: string;
  emptyDescription: string;
  header?: React.ReactElement | null;
  icon?: React.ReactNode;
}) {
  const { colors } = useTheme();
  if (state.loading) {
    return (
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <OrderCardSkeleton key={i} />
        ))}
      </View>
    );
  }
  return (
    <FlatList
      data={state.items}
      keyExtractor={(x) => x.id}
      contentContainerStyle={styles.list}
      keyboardDismissMode="on-drag"
      onEndReachedThreshold={0.4}
      onEndReached={state.loadMore}
      ListHeaderComponent={header}
      ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
      refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={state.refresh} tintColor={colors.primary} />}
      renderItem={({ item, index }) => renderItem(item, index)}
      ListEmptyComponent={
        <EmptyState
          icon={icon || <InboxIcon size={30} color={colors.textTertiary} />}
          title={state.error ? "Yüklenemedi" : emptyTitle}
          description={state.error || emptyDescription}
          actionLabel={state.error ? "Tekrar dene" : undefined}
          onAction={state.error ? state.reload : undefined}
        />
      }
      ListFooterComponent={state.loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : null}
    />
  );
}

const styles = StyleSheet.create({ list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxl } });
