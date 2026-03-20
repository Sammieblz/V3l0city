import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { colors } from '../theme/paperTheme';

interface SpeedDialProps {
  speed: number;
  maxScale: number;
  units: string;
  isPoorSignal?: boolean;
}

const SIZE = 260;
const STROKE_WIDTH = 3;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 20;

const START_ANGLE = 135;
const END_ANGLE = 405;
const SWEEP = END_ANGLE - START_ANGLE;

function polarToCartesian(angle: number, r: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
}

function describeArc(startAngle: number, endAngle: number, r: number) {
  const start = polarToCartesian(startAngle, r);
  const mid = polarToCartesian((startAngle + endAngle) / 2, r);
  const stop = polarToCartesian(endAngle, r);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  if (endAngle - startAngle >= 360) {
    return `M ${start.x} ${start.y} A ${r} ${r} 0 1 1 ${mid.x} ${mid.y} A ${r} ${r} 0 1 1 ${start.x} ${start.y}`;
  }

  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${stop.x} ${stop.y}`;
}

const MAJOR_INTERVAL = 20;
const MINOR_INTERVAL = 10;

const SpeedDial: React.FC<SpeedDialProps> = ({
  speed,
  maxScale,
  units,
  isPoorSignal = false,
}) => {
  const clampedSpeed = Math.min(Math.max(0, speed), maxScale);
  const speedFraction = clampedSpeed / maxScale;
  const speedAngle = START_ANGLE + speedFraction * SWEEP;

  const ticks: React.ReactNode[] = [];
  for (let v = 0; v <= maxScale; v += MINOR_INTERVAL) {
    const fraction = v / maxScale;
    const angle = START_ANGLE + fraction * SWEEP;
    const isMajor = v % MAJOR_INTERVAL === 0;
    const outerR = RADIUS + 8;
    const innerR = isMajor ? RADIUS - 10 : RADIUS - 4;
    const outer = polarToCartesian(angle, outerR);
    const inner = polarToCartesian(angle, innerR);
    const isLit = angle <= speedAngle;

    ticks.push(
      <Line
        key={`tick-${v}`}
        x1={outer.x}
        y1={outer.y}
        x2={inner.x}
        y2={inner.y}
        stroke={isLit ? colors.gaugeFill : colors.gaugeTrack}
        strokeWidth={isMajor ? 2.5 : 1.2}
        strokeLinecap="round"
      />,
    );

    if (isMajor) {
      const labelPos = polarToCartesian(angle, RADIUS - 22);
      ticks.push(
        <Svg key={`label-${v}`}>
          <Circle cx={0} cy={0} r={0} />
          {/* Workaround: text via RN overlay below */}
        </Svg>,
      );
      void labelPos;
    }
  }

  const trackPath = describeArc(START_ANGLE, END_ANGLE, RADIUS);
  const fillPath =
    speedFraction > 0.005
      ? describeArc(START_ANGLE, speedAngle, RADIUS)
      : '';

  return (
    <View style={styles.container}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Path
          d={trackPath}
          stroke={colors.gaugeTrack}
          strokeWidth={STROKE_WIDTH}
          fill="none"
          strokeLinecap="round"
        />
        {fillPath ? (
          <Path
            d={fillPath}
            stroke={colors.gaugeFill}
            strokeWidth={STROKE_WIDTH + 1}
            fill="none"
            strokeLinecap="round"
          />
        ) : null}
        {ticks}
      </Svg>
      <View style={styles.centerOverlay}>
        <Text
          style={[
            styles.speedText,
            isPoorSignal && styles.speedTextDegraded,
          ]}
        >
          {Math.round(speed)}
        </Text>
        <Text style={styles.unitsText}>{units}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: SIZE,
    height: SIZE,
  },
  centerOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedText: {
    fontSize: 72,
    fontWeight: '200',
    color: colors.textPrimary,
    letterSpacing: -2,
  },
  speedTextDegraded: {
    color: colors.warning,
  },
  unitsText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: -4,
  },
});

export default SpeedDial;
