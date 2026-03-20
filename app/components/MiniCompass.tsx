import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Text as SvgText, G } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { colors } from '../theme/paperTheme';

interface MiniCompassProps {
  heading: number | null;
}

const SIZE = 120;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 8;

function normalizeDeg(d: number) {
  return ((d % 360) + 360) % 360;
}

function shortestRotation(from: number, to: number) {
  const diff = normalizeDeg(to - from + 180) - 180;
  return from + diff;
}

const CARDINALS: { deg: number; label: string }[] = [
  { deg: 0, label: 'N' },
  { deg: 90, label: 'E' },
  { deg: 180, label: 'S' },
  { deg: 270, label: 'W' },
];

function polarToXY(angleDeg: number, r: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
}

const MiniCompass: React.FC<MiniCompassProps> = ({ heading }) => {
  const hasHeading = heading != null && !Number.isNaN(heading);
  const displayHeading = hasHeading ? heading : 0;
  const anim = useSharedValue(-displayHeading);

  useEffect(() => {
    const target = shortestRotation(anim.value, -displayHeading);
    anim.value = withSpring(target, { damping: 20, stiffness: 90, mass: 1 });
  }, [displayHeading]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${anim.value}deg` }],
  }));

  const ticks: React.ReactNode[] = [];
  for (let d = 0; d < 360; d += 15) {
    const isMajor = d % 90 === 0;
    const outerR = RADIUS;
    const innerR = isMajor ? RADIUS - 8 : RADIUS - 4;
    const outer = polarToXY(d, outerR);
    const inner = polarToXY(d, innerR);
    ticks.push(
      <Line
        key={`t-${d}`}
        x1={outer.x}
        y1={outer.y}
        x2={inner.x}
        y2={inner.y}
        stroke={colors.textMuted}
        strokeWidth={isMajor ? 1.5 : 0.7}
      />,
    );
  }

  const cardinalLabels = CARDINALS.map(({ deg, label }) => {
    const pos = polarToXY(deg, RADIUS - 15);
    return (
      <SvgText
        key={label}
        x={pos.x}
        y={pos.y + 4}
        fill={label === 'N' ? colors.north : colors.textSecondary}
        fontSize={10}
        fontWeight="700"
        textAnchor="middle"
      >
        {label}
      </SvgText>
    );
  });

  const northTip = polarToXY(0, RADIUS - 2);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.dialWrapper, animatedStyle]}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <Circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            stroke={colors.border}
            strokeWidth={1}
            fill="none"
          />
          {ticks}
          {cardinalLabels}
          <G>
            <Circle cx={northTip.x} cy={northTip.y} r={3} fill={colors.north} />
          </G>
        </Svg>
      </Animated.View>
      <View style={styles.centerDot} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialWrapper: {
    width: SIZE,
    height: SIZE,
  },
  centerDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
});

export default MiniCompass;
