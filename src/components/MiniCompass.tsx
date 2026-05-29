import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { colors, fontFamilies, motion } from '../theme/paperTheme';
import {
  isUsableHeading,
  normalizeHeading,
  shortestHeadingTarget,
} from '../utils/headingAnimation';
import type { HeadingSource, SignalQuality } from '../hooks/useVelocitySensors';

interface MiniCompassProps {
  heading: number | null;
  size?: number;
  headingAvailable?: boolean;
  headingSource?: HeadingSource;
  headingQuality?: SignalQuality;
}

const CARDINALS: { deg: number; label: string }[] = [
  { deg: 0, label: 'N' },
  { deg: 90, label: 'E' },
  { deg: 180, label: 'S' },
  { deg: 270, label: 'W' },
];
const READOUT_HEIGHT = 30;

function polarToXY(angleDeg: number, r: number, center: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: center + r * Math.cos(rad), y: center + r * Math.sin(rad) };
}

const MiniCompass: React.FC<MiniCompassProps> = ({
  heading,
  size = 120,
  headingAvailable = true,
  headingSource,
  headingQuality = 'poor',
}) => {
  const center = size / 2;
  const radius = size / 2 - size * 0.1;
  const hasHeading = headingAvailable && isUsableHeading(heading);
  const displayHeading = hasHeading ? normalizeHeading(heading) : 0;
  const anim = useSharedValue(-displayHeading);
  const presence = useSharedValue(hasHeading ? 1 : 0);

  useEffect(() => {
    if (hasHeading) {
      const target = -shortestHeadingTarget(-anim.value, displayHeading);
      anim.value = withTiming(target, {
        duration: motion.headingMs,
        easing: Easing.out(Easing.cubic),
      });
    }
    presence.value = withTiming(hasHeading ? 1 : 0, {
      duration: motion.normalMs,
      easing: Easing.out(Easing.cubic),
    });
  }, [anim, displayHeading, hasHeading, presence]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${anim.value}deg` }],
    opacity: 0.38 + presence.value * 0.62,
  }));

  const ticks = useMemo(() => {
    const items: React.ReactNode[] = [];
    for (let d = 0; d < 360; d += 10) {
      const isCardinal = d % 90 === 0;
      const isMajor = d % 30 === 0;
      const outerR = radius;
      const innerR = isCardinal
        ? radius - size * 0.095
        : isMajor
          ? radius - size * 0.07
          : radius - size * 0.04;
      const outer = polarToXY(d, outerR, center);
      const inner = polarToXY(d, innerR, center);
      items.push(
        <Line
          key={`t-${d}`}
          x1={outer.x}
          y1={outer.y}
          x2={inner.x}
          y2={inner.y}
          stroke={isCardinal ? colors.textSecondary : colors.textMuted}
          strokeWidth={
            isCardinal
              ? Math.max(1.2, size * 0.012)
              : isMajor
                ? Math.max(0.9, size * 0.008)
                : Math.max(0.6, size * 0.005)
          }
          opacity={isCardinal ? 0.9 : 0.55}
        />
      );
    }
    return items;
  }, [center, radius, size]);

  const cardinalLabels = CARDINALS.map(({ deg, label }) => {
    const pos = polarToXY(deg, radius - size * 0.125, center);
    return (
      <SvgText
        key={label}
        x={pos.x}
        y={pos.y + size * 0.033}
        fill={label === 'N' ? colors.north : colors.textSecondary}
        fontFamily={fontFamilies.display}
        fontSize={Math.max(8, size * 0.083)}
        fontWeight="700"
        textAnchor="middle"
      >
        {label}
      </SvgText>
    );
  });

  const northTip = polarToXY(0, radius - 2, center);
  const northLeft = polarToXY(354, radius - size * 0.12, center);
  const northRight = polarToXY(6, radius - size * 0.12, center);
  const pointerTop = center - radius + size * 0.12;
  const pointerBase = center - radius + size * 0.26;
  const sourceText =
    headingSource === 'course'
      ? 'course'
      : headingSource === 'device'
        ? 'device'
        : '--';

  return (
    <View style={[styles.container, { width: size, height: size + READOUT_HEIGHT }]}>
      <View style={[styles.dialFrame, { width: size, height: size }]}>
        <Animated.View
          style={[styles.dialWrapper, { width: size, height: size }, animatedStyle]}
        >
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Circle
              cx={center}
              cy={center}
              r={radius}
              fill={colors.surfaceSoft}
              opacity={0.85}
            />
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={colors.border}
              strokeWidth={1}
              fill="none"
            />
            {ticks}
            {cardinalLabels}
            <Path
              d={`M ${northTip.x} ${northTip.y} L ${northLeft.x} ${northLeft.y} L ${northRight.x} ${northRight.y} Z`}
              fill={colors.north}
            />
          </Svg>
        </Animated.View>
        <Svg
          pointerEvents="none"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={StyleSheet.absoluteFill}
        >
          <Line
            x1={center}
            y1={center + size * 0.05}
            x2={center}
            y2={pointerBase}
            stroke={hasHeading ? colors.accent : colors.textMuted}
            strokeWidth={Math.max(1.8, size * 0.018)}
            strokeLinecap="round"
            opacity={0.9}
          />
          <Path
            d={`M ${center} ${pointerTop} L ${center - size * 0.045} ${pointerBase} L ${center + size * 0.045} ${pointerBase} Z`}
            fill={hasHeading ? colors.accent : colors.textMuted}
            opacity={0.95}
          />
          <Circle
            cx={center}
            cy={center}
            r={size * 0.046}
            fill={colors.background}
            stroke={hasHeading ? colors.accent : colors.textMuted}
            strokeWidth={Math.max(1.5, size * 0.014)}
          />
          <Circle
            cx={center}
            cy={center}
            r={size * 0.02}
            fill={hasHeading ? colors.accent : colors.textMuted}
          />
        </Svg>
      </View>
      <View style={styles.readout}>
        <Text
          style={[
            styles.readoutText,
            headingQuality === 'poor' && styles.readoutTextPoor,
          ]}
        >
          {hasHeading ? `${Math.round(displayHeading)}°` : '--'}
        </Text>
        <Text style={styles.sourceText}>{sourceText}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  dialFrame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  readout: {
    alignItems: 'center',
    marginTop: 2,
  },
  readoutText: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.numeric,
    fontSize: 11,
    fontWeight: '700',
  },
  readoutTextPoor: {
    color: colors.warning,
  },
  sourceText: {
    color: colors.textMuted,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
});

export default MiniCompass;
