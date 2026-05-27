import React, { useEffect, useState } from 'react';
import {
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Divider, IconButton, List } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, motion, radii, spacing } from '../theme/paperTheme';

type DrawerItem = {
  key: string;
  title: string;
  description: string;
  icon: string;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  items: DrawerItem[];
  onDismiss: () => void;
};

const SideDrawer: React.FC<Props> = ({ visible, items, onDismiss }) => {
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const drawerWidth = Math.min(312, width * 0.82);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, {
        duration: motion.drawerMs,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }

    progress.value = withTiming(
      0,
      {
        duration: motion.normalMs,
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (finished) {
          runOnJS(setMounted)(false);
        }
      }
    );
  }, [progress, visible]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onDismiss();
        return true;
      }
    );

    return () => subscription.remove();
  }, [onDismiss, visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
  }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0, 1],
          [-drawerWidth - 16, 0]
        ),
      },
    ],
  }));

  if (!mounted) {
    return null;
  }

  return (
    <View style={styles.root} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.panel,
          {
            width: drawerWidth,
            paddingTop: insets.top + spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
          },
          panelStyle,
        ]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>Menu</Text>
            <Text style={styles.title}>V3l0city</Text>
          </View>
          <IconButton
            accessibilityLabel="Close menu"
            icon="close"
            iconColor={colors.textSecondary}
            size={22}
            onPress={onDismiss}
            style={styles.closeButton}
          />
        </View>
        <Divider style={styles.divider} />
        {items.map((item) => (
          <List.Item
            key={item.key}
            title={item.title}
            description={item.description}
            left={(props) => (
              <List.Icon {...props} color={colors.textSecondary} icon={item.icon} />
            )}
            onPress={item.onPress}
            style={styles.item}
            titleStyle={styles.itemTitle}
            descriptionStyle={styles.itemDescription}
          />
        ))}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
  },
  panel: {
    height: '100%',
    backgroundColor: colors.surfaceGlass,
    borderTopRightRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 8, height: 0 },
    elevation: 12,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  closeButton: {
    margin: 0,
  },
  kicker: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0,
    marginTop: spacing.xs,
  },
  divider: {
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  item: {
    minHeight: 64,
    paddingHorizontal: spacing.sm,
  },
  itemTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  itemDescription: {
    color: colors.textSecondary,
    fontSize: 12,
  },
});

export default SideDrawer;
