import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withSpring,
} from 'react-native-reanimated';
import { colors } from '../theme/paperTheme';

const AnimatedG = Animated.createAnimatedComponent(G);

interface HorizontalCompassProps {
  heading: number | null;
}

const STRIP_WIDTH = 360;
const STRIP_HEIGHT = 56;
const DEGREES_VISIBLE = 90;
const PX_PER_DEGREE = STRIP_WIDTH / DEGREES_VISIBLE;

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

function normalizeDeg(d: number) {
  return ((d % 360) + 360) % 360;
}

function shortestRotation(from: number, to: number) {
  const diff = normalizeDeg(to - from + 180) - 180;
  return from + diff;
}

const HorizontalCompass: React.FC<HorizontalCompassProps> = ({ heading }) => {
  const hasHeading = heading != null && !Number.isNaN(heading);
  const displayHeading = hasHeading ? heading : 0;
  const animatedHeading = useSharedValue(displayHeading);

  useEffect(() => {
    const target = shortestRotation(animatedHeading.value, displayHeading);
    animatedHeading.value = withSpring(target, {
      damping: 20,
      stiffness: 90,
      mass: 1,
    });
  }, [displayHeading]);

  const animatedProps = useAnimatedProps(() => {
    const offset = animatedHeading.value * PX_PER_DEGREE;
    return {
      transform: [{ translateX: -offset }] as any,
    };
  });

  const ticks: React.ReactNode[] = [];

  for (let rawDeg = -180; rawDeg <= 540; rawDeg += 5) {
    const deg = normalizeDeg(rawDeg);
    const x = rawDeg * PX_PER_DEGREE;
    const isMajor = rawDeg % 30 === 0;
    const isCardinal = CARDINALS[deg] !== undefined;
    const tickH = isMajor ? 16 : 8;

    ticks.push(
      <Line
        key={`t-${rawDeg}`}
        x1={x}
        y1={STRIP_HEIGHT}
        x2={x}
        y2={STRIP_HEIGHT - tickH}
        stroke={isCardinal ? colors.textPrimary : colors.textMuted}
        strokeWidth={isMajor ? 1.5 : 0.8}
      />,
    );

    if (isCardinal) {
      ticks.push(
        <SvgText
          key={`c-${rawDeg}`}
          x={x}
          y={STRIP_HEIGHT - tickH - 6}
          fill={deg === 0 ? colors.north : colors.textSecondary}
          fontSize={deg % 90 === 0 ? 13 : 10}
          fontWeight={deg % 90 === 0 ? '700' : '400'}
          textAnchor="middle"
        >
          {CARDINALS[deg]}
        </SvgText>,
      );
    } else if (isMajor) {
      ticks.push(
        <SvgText
          key={`d-${rawDeg}`}
          x={x}
          y={STRIP_HEIGHT - tickH - 5}
          fill={colors.textMuted}
          fontSize={9}
          textAnchor="middle"
        >
          {deg}
        </SvgText>,
      );
    }
  }

  const halfW = STRIP_WIDTH / 2;

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <Animated.Text style={styles.headingText}>
          {hasHeading ? `${Math.round(normalizeDeg(displayHeading))}°` : '--'}
        </Animated.Text>
      </View>
      <Svg
        width={STRIP_WIDTH}
        height={STRIP_HEIGHT}
        viewBox={`${-halfW} 0 ${STRIP_WIDTH} ${STRIP_HEIGHT}`}
        style={styles.strip}
      >
        <AnimatedG animatedProps={animatedProps}>{ticks}</AnimatedG>
        <Polygon
          points={`0,${STRIP_HEIGHT} -5,${STRIP_HEIGHT + 0.1} 5,${STRIP_HEIGHT + 0.1}`}
          fill={colors.accent}
        />
        <Line
          x1={0}
          y1={STRIP_HEIGHT}
          x2={0}
          y2={STRIP_HEIGHT - 20}
          stroke={colors.accent}
          strokeWidth={2}
        />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  headingRow: {
    marginBottom: 4,
  },
  headingText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  strip: {
    overflow: 'hidden',
  },
});

export default HorizontalCompass;
