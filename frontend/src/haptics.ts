// Ortak dokunsal geri bildirim. Web'de ve desteklemeyen cihazda sessizce hiçbir şey yapmaz.
// Kullanım: birincil eylem başlarken tap(), sonuç geldiğinde success()/error(), seçim çiplerinde select().
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

const on = Platform.OS === "ios" || Platform.OS === "android";

export const haptic = {
  tap: () => {
    if (on) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  select: () => {
    if (on) Haptics.selectionAsync().catch(() => {});
  },
  success: () => {
    if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warning: () => {
    if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  error: () => {
    if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};
