import React, { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { StackHeader } from "../../src/ui/Header";

// Barkodu okur ve ürün aramasına geri döner.
export default function ScanScreen() {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  const onScanned = ({ data }: { data: string }) => {
    if (handled.current || !data) return;
    handled.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.dismissTo({ pathname: "/products", params: { q: data, t: String(Date.now()) } });
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="scan-screen">
      <StackHeader title="Barkod okut" />
      {!permission ? null : !permission.granted ? (
        <View style={styles.center}>
          <Text style={[type.headline, { color: colors.textPrimary, textAlign: "center" }]}>Kamera izni gerekli</Text>
          <Text style={[type.body, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xs }]}>
            {permission.canAskAgain
              ? "Barkod okutmak için kameraya erişim izni verin."
              : "Kamera izni kapalı. Cihaz ayarlarından ObiHub için kamerayı açın."}
          </Text>
          {permission.canAskAgain ? <Button label="İzin ver" onPress={requestPermission} style={{ alignSelf: "stretch", marginTop: spacing.lg }} /> : null}
        </View>
      ) : (
        <View style={styles.cameraWrap}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] }}
            onBarcodeScanned={onScanned}
          />
          <View pointerEvents="none" style={styles.frame} />
          <Text style={[type.callout, styles.hint]}>Barkodu çerçevenin içine getirin</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  cameraWrap: { flex: 1, margin: spacing.lg, borderRadius: radius.xl, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "#000000" },
  frame: { width: "78%", height: 150, borderRadius: radius.lg, borderWidth: 2, borderColor: "#FFFFFF" },
  hint: { position: "absolute", bottom: spacing.xl, color: "#FFFFFF", textAlign: "center" },
});
