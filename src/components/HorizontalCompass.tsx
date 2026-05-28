import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polygon, Text as SvgText } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, fontFamilies, motion, spacing } from '../theme/paperTheme';
import {
  isUsableHeading,
  normalizeHeading,
  shortestHeadingTarget,
} from '../utils/headingAnimation';
import type { HeadingSource, SignalQuality } from '../hooks/useVelocitySensors';

interface HorizontalCompassProps {
  heading: number | null;
  width?: number;
  headingAvailable?: boolean;
  headingSource?: HeadingSource;
  headingQuality?: SignalQuality;
}

const STRIP_HEIGHT = 58;
const DEGREES_VISIBLE = 90;
const MIN_STRIP_DEG = -720;
const MAX_STRIP_DEG = 1080;

const CARDINALS: Record<number, string> = {
  0: 'N',
  45: 'NE',
  90: 'E',
  135: 'SE',
  180: 'S',
  225: 'SW',
  270: 'W',
  315: 'NW',
};

const sourceLabel = (source?: HeadingSource) => {
  if (source === 'course') return 'course';
  if (source === 'device') return 'device';
  return 'heading';
};

const HorizontalCompass: React.FC<HorizontalCompassProps> = ({
  heading,
  width = 360,
  headingAvailable = true,
  headingSource,
  headingQuality = 'poor',
}) => {
  const hasHeading = headingAvailable && isUsableHeading(heading);
  const displayHeading = hasHeading ? normalizeHeading(heading) : 0;
  const pxPerDegree = width / DEGREES_VISIBLE;
  const halfW = width / 2;
  const animatedHeading = useSharedValue(displayHeading);
  const presence = useSharedValue(hasHeading ? 1 : 0);

  useEffect(() => {
    if (hasHeading) {
      if (
        animatedHeading.value < MIN_STRIP_DEG + 360 ||
        animatedHeading.value > MAX_STRIP_DEG - 360
      ) {
        animatedHeading.value = normalizeHeading(animatedHeading.value);
      }

      animatedHeading.value = withTiming(
        shortestHeadingTarget(animatedHeading.value, displayHeading),
        {
          duration: motion.headingMs,
          easing: Easing.out(Easing.cubic),
        }
      );
    }
    presence.value = withTiming(hasHeading ? 1 : 0, {
      duration: motion.normalMs,
      easing: Easing.out(Easing.cubic),
    });
  }, [animatedHeading, displayHeading, hasHeading, presence]);

  const stripOpacityStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + presence.value * 0.65,
  }));

  const stripWidth = (MAX_STRIP_DEG - MIN_STRIP_DEG) * pxPerDegree;

  const stripOffsetStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          halfW - (animatedHeading.value - MIN_STRIP_DEG) * pxPerDegree,
      },
    ],
  }));

  const ticks = useMemo(() => {
    const items: React.ReactNode[] = [];
    for (let rawDeg = MIN_STRIP_DEG; rawDeg <= MAX_STRIP_DEG; rawDeg += 5) {
      const deg = normalizeHeading(rawDeg);
      const x = (rawDeg - MIN_STRIP_DEG) * pxPerDegree;
      const isMajor = rawDeg % 30 === 0;
      const isCardinal = CARDINALS[deg] !== undefined;
      const tickH = isMajor ? 16 : 8;

      items.push(
        <Line
          key={`t-${rawDeg}`}
          x1={x}
          y1={STRIP_HEIGHT}
          x2={x}
          y2={STRIP_HEIGHT - tickH}
          stroke={isCardinal ? colors.textPrimary : colors.textMuted}
          strokeWidth={isMajor ? 1.5 : 0.8}
        />
      );

      if (isCardinal) {
        items.push(
          <SvgText
            key={`c-${rawDeg}`}
            x={x}
            y={STRIP_HEIGHT - tickH - 7}
            fill={deg === 0 ? colors.north : colors.textSecondary}
            fontFamily={fontFamilies.display}
            fontSize={deg % 90 === 0 ? 13 : 10}
            fontWeight={deg % 90 === 0 ? '700' : '500'}
            textAnchor="middle"
          >
            {CARDINALS[deg]}
          </SvgText>
        );
      } else if (isMajor) {
        items.push(
          <SvgText
            key={`d-${rawDeg}`}
            x={x}
            y={STRIP_HEIGHT - tickH - 6}
            fill={colors.textMuted}
            fontFamily={fontFamilies.numeric}
            fontSize={9}
            textAnchor="middle"
          >
            {deg}
          </SvgText>
        );
      }
    }
    return items;
  }, [pxPerDegree]);

  return (
    <View style={[styles.container, { width }]}>
      <View style={styles.headingRow}>
        <Text style={styles.headingText}>
          {hasHeading ? `${Math.round(displayHeading)}°` : '--'}
        </Text>
        <Text
          style={[
            styles.headingMeta,
            headingQuality === 'poor' && styles.headingMetaPoor,
          ]}
        >
          {sourceLabel(headingSource)}
        </Text>
      </View>
      <Animated.View style={[styles.stripClip, { width }, stripOpacityStyle]}>
        <Animated.View
          style={[
            styles.stripContent,
            { width: stripWidth, height: STRIP_HEIGHT },
            stripOffsetStyle,
          ]}
        >
          <Svg
            width={stripWidth}
            height={STRIP_HEIGHT}
            viewBox={`0 0 ${stripWidth} ${STRIP_HEIGHT}`}
          >
            {ticks}
          </Svg>
        </Animated.View>
        <Svg
          pointerEvents="none"
          width={width}
          height={STRIP_HEIGHT}
          viewBox={`0 0 ${width} ${STRIP_HEIGHT}`}
          style={StyleSheet.absoluteFill}
        >
          <Polygon
            points={`${halfW},${STRIP_HEIGHT - 2} ${halfW - 6},${STRIP_HEIGHT - 0.5} ${halfW + 6},${STRIP_HEIGHT - 0.5}`}
            fill={hasHeading ? colors.accent : colors.textMuted}
          />
          <Line
            x1={halfW}
            y1={STRIP_HEIGHT}
            x2={halfW}
            y2={STRIP_HEIGHT - 24}
            stroke={hasHeading ? colors.accent : colors.textMuted}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    marginBottom: 2,
  },
  headingText: {
    fontSize: 14,
    fontFamily: fontFamilies.numeric,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0,
  },
  headingMeta: {
    color: colors.textMuted,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  headingMetaPoor: {
    color: colors.warning,
  },
  stripClip: {
    height: STRIP_HEIGHT,
    overflow: 'hidden',
  },
  stripContent: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
});

export default HorizontalCompass;
