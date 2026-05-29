import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, fontFamilies, motion } from '../theme/paperTheme';

interface SpeedDialProps {
  speed: number;
  maxScale: number;
  units: string;
  isPoorSignal?: boolean;
  size?: number;
}

const START_ANGLE = 135;
const END_ANGLE = 405;
const SWEEP = END_ANGLE - START_ANGLE;
const MAJOR_INTERVAL = 20;
const MINOR_INTERVAL = 10;
const AnimatedPath = Animated.createAnimatedComponent(Path);

function polarToCartesian(angle: number, r: number, center: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: center + r * Math.cos(rad), y: center + r * Math.sin(rad) };
}

function describeArc(
  startAngle: number,
  endAngle: number,
  r: number,
  center: number
) {
  const start = polarToCartesian(startAngle, r, center);
  const mid = polarToCartesian((startAngle + endAngle) / 2, r, center);
  const stop = polarToCartesian(endAngle, r, center);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  if (endAngle - startAngle >= 360) {
    return `M ${start.x} ${start.y} A ${r} ${r} 0 1 1 ${mid.x} ${mid.y} A ${r} ${r} 0 1 1 ${start.x} ${start.y}`;
  }

  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${stop.x} ${stop.y}`;
}

const SpeedDial: React.FC<SpeedDialProps> = ({
  speed,
  maxScale,
  units,
  size = 260,
}) => {
  const center = size / 2;
  const radius = size / 2 - size * 0.077;
  const strokeWidth = Math.max(2.5, size * 0.012);
  const clampedSpeed = Math.min(Math.max(0, speed), maxScale);
  const speedFraction = clampedSpeed / maxScale;
  const speedAngle = START_ANGLE + speedFraction * SWEEP;
  const progress = useSharedValue(speedFraction);

  useEffect(() => {
    progress.value = withTiming(speedFraction, {
      duration: motion.normalMs,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, speedFraction]);

  const arcLength = radius * (SWEEP * Math.PI / 180);
  const fillAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: arcLength * (1 - progress.value),
  }));

  const ticks = useMemo(() => {
    const items: React.ReactNode[] = [];
    for (let v = 0; v <= maxScale; v += MINOR_INTERVAL) {
      const fraction = v / maxScale;
      const angle = START_ANGLE + fraction * SWEEP;
      const isMajor = v % MAJOR_INTERVAL === 0;
      const outerR = radius + size * 0.031;
      const innerR = isMajor ? radius - size * 0.038 : radius - size * 0.016;
      const outer = polarToCartesian(angle, outerR, center);
      const inner = polarToCartesian(angle, innerR, center);
      const isLit = angle <= speedAngle;

      items.push(
        <Line
          key={`tick-${v}`}
          x1={outer.x}
          y1={outer.y}
          x2={inner.x}
          y2={inner.y}
          stroke={isLit ? colors.gaugeFill : colors.gaugeTrack}
          strokeWidth={isMajor ? Math.max(1.7, size * 0.01) : Math.max(0.8, size * 0.004)}
          strokeLinecap="round"
        />
      );

      if (isMajor && (v === 0 || v === maxScale / 2 || v === maxScale)) {
        const labelPos = polarToCartesian(angle, radius - size * 0.095, center);
        items.push(
          <SvgText
            key={`label-${v}`}
            x={labelPos.x}
            y={labelPos.y + size * 0.012}
            fill={colors.textMuted}
            fontFamily={fontFamilies.numeric}
            fontSize={Math.max(8, size * 0.036)}
            textAnchor="middle"
          >
            {v}
          </SvgText>
        );
      }
    }
    return items;
  }, [center, maxScale, radius, size, speedAngle]);

  const trackPath = describeArc(START_ANGLE, END_ANGLE, radius, center);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Path
          d={trackPath}
          stroke={colors.gaugeTrack}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
        />
        <AnimatedPath
          animatedProps={fillAnimatedProps}
          d={trackPath}
          stroke={colors.gaugeFill}
          strokeWidth={strokeWidth + 1}
          fill="none"
          strokeDasharray={[arcLength, arcLength]}
          strokeDashoffset={arcLength}
          strokeLinecap="round"
        />
        {ticks}
      </Svg>
      <View style={styles.centerOverlay}>
        <Text
          style={[
            styles.speedText,
            { fontSize: size * 0.277, marginBottom: -size * 0.015 },
          ]}
        >
          {Math.round(speed)}
        </Text>
        <Text style={[styles.unitsText, { fontSize: size * 0.062 }]}>
          {units}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedText: {
    fontSize: 72,
    fontFamily: fontFamilies.numeric,
    fontWeight: '200',
    color: colors.textPrimary,
    letterSpacing: 0,
  },
  unitsText: {
    fontSize: 16,
    fontFamily: fontFamilies.displayMedium,
    fontWeight: '500',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginTop: -4,
  },
});

export default SpeedDial;
