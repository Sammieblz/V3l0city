import React, { useEffect, useState } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
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
import BrandMark from './BrandMark';
import {
  colors,
  fontFamilies,
  motion,
  radii,
  spacing,
} from '../theme/paperTheme';

type DrawerItem = {
  key: string;
  title: string;
  description: string;
  icon: string;
  onPress: () => void;
};

type DrawerGroup = {
  key: string;
  title: string;
  description: string;
  icon: string;
  items: DrawerItem[];
};

export type DrawerAccountSummary = {
  signedIn: boolean;
  title: string;
  subtitle: string;
};

type Props = {
  visible: boolean;
  groups: DrawerGroup[];
  accountSummary?: DrawerAccountSummary;
  onDismiss: () => void;
};

const SideDrawer: React.FC<Props> = ({
  visible,
  groups,
  accountSummary,
  onDismiss,
}) => {
  const [mounted, setMounted] = useState(visible);
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
  const progress = useSharedValue(0);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const drawerWidth = Math.min(312, width * 0.82);
  const activeGroup =
    groups.find((group) => group.key === activeGroupKey) ?? null;

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
      setActiveGroupKey(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (activeGroupKey) {
          setActiveGroupKey(null);
          return true;
        }

        onDismiss();
        return true;
      }
    );

    return () => subscription.remove();
  }, [activeGroupKey, onDismiss, visible]);

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
            <BrandMark size={54} style={styles.drawerMark} />
            <Text style={styles.kicker}>Menu</Text>
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
        {accountSummary && (
          <View style={styles.accountPanel}>
            <List.Icon
              color={accountSummary.signedIn ? colors.accent : colors.textMuted}
              icon={
                accountSummary.signedIn
                  ? 'cloud-check-outline'
                  : 'cloud-off-outline'
              }
              style={styles.accountIcon}
            />
            <View style={styles.accountText}>
              <Text style={styles.accountTitle}>{accountSummary.title}</Text>
              <Text style={styles.accountSubtitle}>
                {accountSummary.subtitle}
              </Text>
            </View>
          </View>
        )}
        <Divider style={styles.divider} />
        {activeGroup ? (
          <View style={styles.submenu}>
            <List.Item
              title="Back"
              left={(props) => (
                <List.Icon
                  {...props}
                  color={colors.textSecondary}
                  icon="chevron-left"
                />
              )}
              onPress={() => setActiveGroupKey(null)}
              style={styles.backItem}
              titleStyle={styles.backItemTitle}
            />
            <Text style={styles.submenuTitle}>{activeGroup.title}</Text>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.itemsContent}
            >
              {activeGroup.items.map((item) => (
                <List.Item
                  key={item.key}
                  title={item.title}
                  description={item.description}
                  left={(props) => (
                    <List.Icon
                      {...props}
                      color={colors.textSecondary}
                      icon={item.icon}
                    />
                  )}
                  onPress={item.onPress}
                  style={styles.item}
                  titleStyle={styles.itemTitle}
                  descriptionStyle={styles.itemDescription}
                />
              ))}
            </ScrollView>
          </View>
        ) : (
          <View style={styles.rootItems}>
            {groups.map((group) => (
              <List.Item
                key={group.key}
                title={group.title}
                description={group.description}
                left={(props) => (
                  <List.Icon
                    {...props}
                    color={colors.textSecondary}
                    icon={group.icon}
                  />
                )}
                right={(props) => (
                  <List.Icon
                    {...props}
                    color={colors.textMuted}
                    icon="chevron-right"
                  />
                )}
                onPress={() => setActiveGroupKey(group.key)}
                style={styles.item}
                titleStyle={styles.itemTitle}
                descriptionStyle={styles.itemDescription}
              />
            ))}
          </View>
        )}
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
    shadowColor: colors.background,
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
  drawerMark: {
    marginBottom: spacing.xs,
  },
  closeButton: {
    margin: 0,
  },
  accountPanel: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    minHeight: 58,
    paddingRight: spacing.md,
  },
  accountIcon: {
    marginHorizontal: spacing.xs,
  },
  accountText: {
    flex: 1,
    minWidth: 0,
  },
  accountTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 14,
    fontWeight: '800',
  },
  accountSubtitle: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.body,
    fontSize: 12,
    marginTop: 2,
  },
  kicker: {
    color: colors.textMuted,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  divider: {
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  rootItems: {
    paddingBottom: spacing.md,
  },
  submenu: {
    flex: 1,
    minHeight: 0,
  },
  itemsContent: {
    paddingBottom: spacing.md,
  },
  backItem: {
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  backItemTitle: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 14,
    fontWeight: '700',
  },
  submenuTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.displayBold,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: spacing.xs,
    marginHorizontal: spacing.lg,
  },
  item: {
    minHeight: 64,
    paddingHorizontal: spacing.sm,
  },
  itemTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 15,
    fontWeight: '700',
  },
  itemDescription: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.body,
    fontSize: 12,
  },
});

export default SideDrawer;
