import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Line,
  Path,
  Polygon,
  Text as SvgText,
} from 'react-native-svg';

import { readDriveSurfaceSnapshot } from '../driveSurface/driveSurfaceStore';
import type { DriveSurfaceSnapshot } from '../driveSurface/snapshot';
import { colors, fontFamilies, radii, spacing } from '../theme/paperTheme';
import {
  getCarTripControllerStatus,
  subscribeCarTripController,
  type CarTripControllerStatus,
} from './carActions';
import {
  buildCarDisplayModel,
  numericSpeedForCarModel,
} from './carDisplayModel';

const SNAPSHOT_REFRESH_MS = 1000;
const DIAL_START_ANGLE = 135;
const DIAL_END_ANGLE = 405;
const DIAL_SWEEP = DIAL_END_ANGLE - DIAL_START_ANGLE;

const polarToXY = (angleDeg: number, radius: number, center: number) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: center + radius * Math.cos(rad),
    y: center + radius * Math.sin(rad),
  };
};

const describeArc = (
  startAngle: number,
  endAngle: number,
  radius: number,
  center: number,
): string => {
  const start = polarToXY(startAngle, radius, center);
  const end = polarToXY(endAngle, radius, center);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
};

const statUnitFor = (label: string, modelUnits: string): string => {
  if (label === 'DIST') return '';
  return modelUnits;
};

const StaticCarSpeedDial: React.FC<{
  speed: number;
  maxScale: number;
  size: number;
  units: string;
}> = ({ speed, maxScale, size, units }) => {
  const center = size / 2;
  const radius = size * 0.4;
  const strokeWidth = Math.max(6, size * 0.035);
  const clampedSpeed = Math.min(Math.max(0, speed), maxScale);
  const fraction = maxScale > 0 ? clampedSpeed / maxScale : 0;
  const speedAngle = DIAL_START_ANGLE + fraction * DIAL_SWEEP;
  const trackPath = describeArc(DIAL_START_ANGLE, DIAL_END_ANGLE, radius, center);
  const speedPath = describeArc(DIAL_START_ANGLE, speedAngle, radius, center);

  const ticks = [];
  for (let value = 0; value <= maxScale; value += 20) {
    const tickFraction = value / maxScale;
    const angle = DIAL_START_ANGLE + tickFraction * DIAL_SWEEP;
    const outer = polarToXY(angle, radius + size * 0.04, center);
    const inner = polarToXY(angle, radius - size * 0.035, center);
    ticks.push(
      <Line
        key={`dial-tick-${value}`}
        x1={outer.x}
        y1={outer.y}
        x2={inner.x}
        y2={inner.y}
        stroke={value <= clampedSpeed ? colors.accent : colors.gaugeTrack}
        strokeLinecap="round"
        strokeWidth={Math.max(2, size * 0.01)}
      />,
    );
  }

  return (
    <View style={[styles.staticDial, { height: size, width: size }]}>
      <Svg height={size} width={size} viewBox={`0 0 ${size} ${size}`}>
        <Path
          d={trackPath}
          fill="none"
          stroke={colors.gaugeTrack}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
        {fraction > 0.001 && (
          <Path
            d={speedPath}
            fill="none"
            stroke={colors.accent}
            strokeLinecap="round"
            strokeWidth={strokeWidth}
          />
        )}
        {ticks}
        <SvgText
          fill={colors.textMuted}
          fontFamily={fontFamilies.numeric}
          fontSize={Math.max(10, size * 0.042)}
          textAnchor="middle"
          x={center - radius * 0.72}
          y={center + size * 0.02}
        >
          {Math.round(maxScale / 2)}
        </SvgText>
        <SvgText
          fill={colors.textMuted}
          fontFamily={fontFamilies.numeric}
          fontSize={Math.max(10, size * 0.042)}
          textAnchor="middle"
          x={center + radius * 0.72}
          y={center - radius * 0.55}
        >
          {maxScale}
        </SvgText>
      </Svg>
      <View style={styles.dialTextOverlay}>
        <Text style={[styles.dialSpeedText, { fontSize: size * 0.26 }]}>
          {Math.round(speed)}
        </Text>
        <Text style={[styles.dialUnitText, { fontSize: size * 0.065 }]}>
          {units}
        </Text>
      </View>
    </View>
  );
};

const StaticCarCompass: React.FC<{
  heading: number | null;
  size: number;
  available: boolean;
}> = ({ heading, size, available }) => {
  const center = size / 2;
  const radius = size * 0.42;
  const normalized =
    heading == null || !Number.isFinite(heading)
      ? 0
      : ((heading % 360) + 360) % 360;
  const dialRotation = -normalized;

  const ticks = [];
  for (let deg = 0; deg < 360; deg += 30) {
    const cardinal = deg % 90 === 0;
    const outer = polarToXY(deg + dialRotation, radius, center);
    const inner = polarToXY(
      deg + dialRotation,
      radius - (cardinal ? size * 0.08 : size * 0.045),
      center,
    );
    ticks.push(
      <Line
        key={`compass-tick-${deg}`}
        x1={outer.x}
        y1={outer.y}
        x2={inner.x}
        y2={inner.y}
        stroke={cardinal ? colors.textSecondary : colors.textMuted}
        strokeLinecap="round"
        strokeWidth={cardinal ? 1.4 : 0.8}
      />,
    );
  }

  const labels = [
    { deg: 0, label: 'N' },
    { deg: 90, label: 'E' },
    { deg: 180, label: 'S' },
    { deg: 270, label: 'W' },
  ].map(({ deg, label }) => {
    const point = polarToXY(deg + dialRotation, radius - size * 0.15, center);
    return (
      <SvgText
        fill={label === 'N' ? colors.north : colors.textSecondary}
        fontFamily={fontFamilies.displayBold}
        fontSize={size * 0.09}
        fontWeight="700"
        key={label}
        textAnchor="middle"
        x={point.x}
        y={point.y + size * 0.03}
      >
        {label}
      </SvgText>
    );
  });

  return (
    <Svg
      height={size}
      opacity={available ? 1 : 0.46}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
    >
      <Circle
        cx={center}
        cy={center}
        fill={colors.surfaceSoft}
        r={radius}
        stroke={colors.border}
      />
      {ticks}
      {labels}
      <Polygon
        fill={available ? colors.accent : colors.textMuted}
        points={`${center},${center - radius + size * 0.08} ${center - size * 0.06},${center + size * 0.11} ${center + size * 0.06},${center + size * 0.11}`}
      />
      <Circle
        cx={center}
        cy={center}
        fill={colors.background}
        r={size * 0.065}
        stroke={available ? colors.accent : colors.textMuted}
        strokeWidth={2}
      />
      <Circle
        cx={center}
        cy={center}
        fill={available ? colors.accent : colors.textMuted}
        r={size * 0.026}
      />
    </Svg>
  );
};

const CarDashboardSurface: React.FC = () => {
  styles = createStyles();
  const { width, height } = useWindowDimensions();
  const [snapshot, setSnapshot] = useState<DriveSurfaceSnapshot | null>(null);
  const [controllerStatus, setControllerStatus] = useState<CarTripControllerStatus>(
    () => getCarTripControllerStatus(),
  );

  useEffect(() => {
    if (__DEV__) {
      console.log('[V3l0city][car] rich dashboard mounted');
    }
  }, []);

  const refreshSnapshot = useCallback(async () => {
    const nextSnapshot = await readDriveSurfaceSnapshot().catch(() => null);
    setSnapshot(nextSnapshot);
    setControllerStatus(getCarTripControllerStatus());
  }, []);

  useEffect(() => {
    void refreshSnapshot();
    const interval = setInterval(() => {
      void refreshSnapshot();
    }, SNAPSHOT_REFRESH_MS);
    const unsubscribe = subscribeCarTripController(() => {
      setControllerStatus(getCarTripControllerStatus());
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [refreshSnapshot]);

  const model = useMemo(
    () => buildCarDisplayModel(snapshot, controllerStatus),
    [controllerStatus, snapshot],
  );

  const speedValue = numericSpeedForCarModel(model);
  const compact = width < 760 || height < 390;
  const dialSize = Math.max(
    compact ? 230 : 300,
    Math.min(
      compact ? height * 0.78 : height * 0.86,
      compact ? width * 0.46 : width * 0.5,
      compact ? 330 : 430,
    ),
  );
  const compassSize = Math.max(
    compact ? 104 : 128,
    Math.min(height * 0.34, width * 0.18, compact ? 142 : 180),
  );
  const maxScale = speedValue > 160 ? 300 : speedValue > 80 ? 200 : 160;

  const stats = [
    { label: 'AVG', value: model.averageSpeedText, unit: model.units },
    { label: 'MAX', value: model.maxSpeedText, unit: model.units, highlight: true },
    { label: 'DIST', value: model.distanceText, unit: '' },
  ];

  return (
    <View
      style={[
        styles.root,
        {
          paddingHorizontal: compact ? spacing.md : spacing.lg,
          paddingVertical: compact ? spacing.sm : spacing.md,
        },
      ]}
      testID="car-dashboard-surface"
    >
      <View
        style={[
          styles.liveDot,
          model.live ? styles.liveDotGood : styles.liveDotStale,
        ]}
      />
      <View style={[styles.content, compact && styles.contentCompact]}>
        <View style={styles.dialPane}>
          <StaticCarSpeedDial
            speed={speedValue}
            maxScale={maxScale}
            units={model.units}
            size={dialSize}
          />
          <Text
            style={[
              styles.statusText,
              model.signalQuality === 'good'
                ? styles.statusGood
                : model.signalQuality === 'medium'
                  ? styles.statusMedium
                  : styles.statusPoor,
            ]}
          >
            {model.statusText}
          </Text>
        </View>

        <View style={[styles.sidePane, compact && styles.sidePaneCompact]}>
          <View style={styles.statsRow}>
            {stats.map((stat) => (
              <View key={stat.label} style={styles.statCell}>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text
                  style={[
                    styles.statValue,
                    stat.highlight && styles.statValueHighlight,
                  ]}
                  numberOfLines={1}
                >
                  {stat.value}
                </Text>
                <Text style={styles.statUnit}>
                  {statUnitFor(stat.label, stat.unit)}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.detailRow}>
            <View style={styles.compassPanel}>
              <StaticCarCompass
                heading={model.headingDegrees}
                available={model.live && model.headingDegrees != null}
                size={compassSize}
              />
              <Text style={styles.headingMeta}>
                {model.headingText} · {model.headingSourceText}
              </Text>
            </View>
            <View style={styles.timePanel}>
              <Text style={styles.detailLabel}>TIME</Text>
              <Text style={styles.elapsedText}>{model.elapsedText}</Text>
              <Text style={styles.detailLabel}>SIGNAL</Text>
              <Text style={styles.signalText}>{model.signalText}</Text>
              <Text style={styles.detailLabel}>STATE</Text>
              <Text
                style={[
                  styles.stateText,
                  model.signalQuality === 'good'
                    ? styles.statusGood
                    : model.signalQuality === 'medium'
                      ? styles.statusMedium
                      : styles.statusPoor,
                ]}
                numberOfLines={2}
              >
                {model.title}
              </Text>
            </View>
          </View>
          {model.controlMessage && (
            <Text style={styles.feedbackText} numberOfLines={2}>
              {model.controlMessage}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

const createStyles = () => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  liveDot: {
    position: 'absolute',
    right: spacing.lg,
    top: spacing.md,
    zIndex: 2,
    borderRadius: radii.pill,
    height: 9,
    width: 9,
  },
  liveDotGood: {
    backgroundColor: colors.accentBright,
  },
  liveDotStale: {
    backgroundColor: colors.textMuted,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xl,
    minHeight: 0,
  },
  contentCompact: {
    gap: spacing.md,
  },
  dialPane: {
    alignItems: 'center',
    flex: 1.18,
    justifyContent: 'center',
    minWidth: 0,
  },
  staticDial: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialTextOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  dialSpeedText: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.numeric,
    fontWeight: '500',
    letterSpacing: 0,
  },
  dialUnitText: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.displayMedium,
    fontWeight: '600',
    marginTop: -4,
    textTransform: 'uppercase',
  },
  statusText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 15,
    fontWeight: '700',
    marginTop: -spacing.sm,
    textAlign: 'center',
  },
  statusGood: {
    color: colors.accentBright,
  },
  statusMedium: {
    color: colors.brandGold,
  },
  statusPoor: {
    color: colors.textSecondary,
  },
  sidePane: {
    flex: 0.82,
    justifyContent: 'space-between',
    minWidth: 290,
    paddingVertical: spacing.xs,
  },
  sidePaneCompact: {
    minWidth: 250,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCell: {
    backgroundColor: colors.surfaceGlass,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    minHeight: 78,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  statLabel: {
    color: colors.textMuted,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 10,
    fontWeight: '700',
  },
  statValue: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.numeric,
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: 0,
  },
  statValueHighlight: {
    color: colors.brandGold,
  },
  statUnit: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  compassPanel: {
    alignItems: 'center',
    flex: 0.9,
    minWidth: 120,
  },
  headingMeta: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.numeric,
    fontSize: 13,
    fontWeight: '600',
    marginTop: -4,
    textTransform: 'uppercase',
  },
  timePanel: {
    flex: 1,
    gap: 2,
  },
  detailLabel: {
    color: colors.textMuted,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 10,
    fontWeight: '700',
  },
  elapsedText: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.numeric,
    fontSize: 28,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  signalText: {
    color: colors.accentBright,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  stateText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 14,
    fontWeight: '700',
  },
  feedbackText: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
    fontWeight: '700',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});

let styles = createStyles();

export default CarDashboardSurface;
