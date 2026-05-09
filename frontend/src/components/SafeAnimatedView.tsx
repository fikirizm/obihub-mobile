// Cross-platform animation wrapper.
// On native: uses react-native-reanimated entering animations.
// On web: skips entering (which can leave visibility:hidden in SSR/hydration scenarios).

import React from "react";
import { Platform, View, ViewProps } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";

type Props = ViewProps & {
  entering?: any;
};

export const SafeAnimatedView = React.forwardRef<View, Props>(({ entering, children, ...rest }, ref) => {
  if (Platform.OS === "web") {
    // skip entering animations on web to avoid SSR visibility:hidden issue
    return (
      <View ref={ref} {...rest}>
        {children}
      </View>
    );
  }
  return (
    <Animated.View entering={entering} {...(rest as any)}>
      {children}
    </Animated.View>
  );
});

SafeAnimatedView.displayName = "SafeAnimatedView";

export { FadeIn, FadeInDown, FadeInUp };
