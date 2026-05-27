import React, { type PropsWithChildren } from 'react';
import {
  Pressable,
  type PressableProps,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { motion } from '../theme/paperTheme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = PropsWithChildren<
  PressableProps & {
    style?: StyleProp<ViewStyle>;
    pressedScale?: number;
  }
>;

const PressableScale: React.FC<Props> = ({
  children,
  style,
  pressedScale = 0.97,
  onPressIn,
  onPressOut,
  ...props
}) => {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event) => {
        scale.value = withTiming(pressedScale, { duration: motion.fastMs });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withTiming(1, { duration: motion.fastMs });
        onPressOut?.(event);
      }}
      style={[styles.pressable, style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  pressable: {
    alignSelf: 'center',
  },
});

export default PressableScale;
