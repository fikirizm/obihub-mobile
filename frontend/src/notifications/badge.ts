// Uygulama simgesi rozeti. Web önizlemesinde çağrılmaz: expo-notifications web'de `badgin` ile sekme başlığını değiştirir ve
// başlık boşken (expo-router geri gezinmesi) "Cannot set properties of undefined (nodeValue)" ile çöker. iOS/Android davranışı aynı.
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

export function setAppBadge(count: number): Promise<unknown> {
  if (Platform.OS === "web") return Promise.resolve(false);
  return Notifications.setBadgeCountAsync(count);
}
