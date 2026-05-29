import React, { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LineChart, PieChart } from 'react-native-gifted-charts';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Defs,
  LinearGradient,
  Line,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { getRecentTripsWithSpeedSamples } from '../database/tripRepository';
import type { HeatmapCell, TripChartPoint } from '../utils/insightsAnalytics';
import {
  buildInsightsModel,
  buildSpeedTrace,
  displayDistance,
  displaySpeed,
  distanceUnitLabel,
} from '../utils/insightsAnalytics';
import type { TripWithSpeedSamples } from '../domain/trip';
import { colors, fontFamilies, motion, radii, spacing } from '../theme/paperTheme';
import type { Units } from '../utils/speedMath';

type Props = {
  units: Units;
};

type ContentProps = {
  trips: TripWithSpeedSamples[];
  units: Units;
  loading?: boolean;
};

const MAX_TRIPS = 50;
const EMPTY_TEXT = 'No trips recorded yet.';

const formatDuration = (durationMs: number): string => {
  const totalMinutes = Math.round(durationMs / 60000);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
};

const formatHour = (hour: number): string => {
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
};

const formatTripChip = (startedAt: string): string => {
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

const heatmapColor = (intensity: number): string => {
  if (intensity <= 0) return colors.surfaceSoft;
  if (intensity < 0.25) return colors.brandTealDim;
  if (intensity < 0.5) return colors.heatmapLow;
  if (intensity < 0.75) return colors.heatmapMid;
  if (intensity < 0.92) return colors.accent;
  return colors.brandGold;
};

const sanitizeGradientId = (value: string) =>
  value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);

const ResponsiveBarChart: React.FC<{
  data: TripChartPoint[];
  chartWidth: number;
  maxValue: number;
  palette: { color: string; gradientColor: string };
}> = ({ data, chartWidth, maxValue, palette }) => {
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const width = Math.max(240, measuredWidth || chartWidth);
  const yAxisWidth = 34;
  const topPadding = 20;
  const plotHeight = 126;
  const bottomPadding = 34;
  const height = topPadding + plotHeight + bottomPadding;
  const minSlotWidth = 42;
  const contentWidth = Math.max(width, yAxisWidth + data.length * minSlotWidth + 12);
  const plotWidth = contentWidth - yAxisWidth - 10;
  const slotWidth = data.length > 0 ? plotWidth / data.length : plotWidth;
  const barWidth = Math.min(26, Math.max(12, slotWidth * 0.46));
  const xAxisY = topPadding + plotHeight;
  const gradientId = `barGradient${sanitizeGradientId(palette.color)}`;
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));
  const topLabelEvery = Math.max(1, Math.ceil(data.length / 10));

  const onLayout = (event: LayoutChangeEvent) => {
    setMeasuredWidth(Math.round(event.nativeEvent.layout.width));
  };

  return (
    <View
      style={styles.responsiveChart}
      onLayout={onLayout}
      testID="responsive-bar-chart"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ width: contentWidth }}
      >
        <Svg width={contentWidth} height={height}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={palette.color} stopOpacity={0.98} />
              <Stop offset="1" stopColor={palette.gradientColor} stopOpacity={0.5} />
            </LinearGradient>
          </Defs>
          {[0, 1, 2, 3, 4].map((section) => {
            const value = (maxValue / 4) * section;
            const y = xAxisY - (value / maxValue) * plotHeight;
            return (
              <React.Fragment key={section}>
                <Line
                  x1={yAxisWidth}
                  x2={contentWidth - 4}
                  y1={y}
                  y2={y}
                  stroke={colors.border}
                  strokeOpacity={section === 0 ? 1 : 0.55}
                  strokeWidth={StyleSheet.hairlineWidth}
                />
                <SvgText
                  x={0}
                  y={y + 3}
                  fill={colors.textMuted}
                  fontFamily={fontFamilies.numeric}
                  fontSize={9}
                >
                  {Math.round(value)}
                </SvgText>
              </React.Fragment>
            );
          })}
          {data.map((point, index) => {
            const barHeight = Math.max(2, (point.value / maxValue) * plotHeight);
            const x = yAxisWidth + index * slotWidth + (slotWidth - barWidth) / 2;
            const y = xAxisY - barHeight;
            const showLabel = index % labelEvery === 0 || index === data.length - 1;
            const showTopLabel = index % topLabelEvery === 0 || data.length <= 8;
            return (
              <React.Fragment key={`${point.tripId}-${index}`}>
                <Rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={6}
                  fill={`url(#${gradientId})`}
                />
                {showTopLabel && (
                  <SvgText
                    x={x + barWidth / 2}
                    y={Math.max(9, y - 5)}
                    fill={colors.textSecondary}
                    fontFamily={fontFamilies.numeric}
                    fontSize={9}
                    textAnchor="middle"
                  >
                    {point.value}
                  </SvgText>
                )}
                {showLabel && (
                  <SvgText
                    x={x + barWidth / 2}
                    y={height - 9}
                    fill={colors.textMuted}
                    fontFamily={fontFamilies.numeric}
                    fontSize={9}
                    textAnchor="middle"
                  >
                    {point.label}
                  </SvgText>
                )}
              </React.Fragment>
            );
          })}
        </Svg>
      </ScrollView>
    </View>
  );
};

const useReducedMotionPreference = () => {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReducedMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
};

const AnimatedSection: React.FC<{
  index: number;
  reducedMotion: boolean;
  children: React.ReactNode;
}> = ({ index, reducedMotion, children }) => {
  const progress = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    progress.value = reducedMotion
      ? 1
      : withDelay(
          index * 45,
          withTiming(1, {
            duration: motion.normalMs,
            easing: Easing.out(Easing.cubic),
          }),
        );
  }, [index, progress, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 12 }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
};

const SummaryCard: React.FC<{
  label: string;
  value: string;
  helper?: string;
  tone?: 'default' | 'gold' | 'teal';
}> = ({ label, value, helper, tone = 'default' }) => (
  <View style={styles.summaryCard}>
    <Text
      style={[
        styles.summaryValue,
        tone === 'gold' && styles.summaryValueGold,
        tone === 'teal' && styles.summaryValueTeal,
      ]}
    >
      {value}
    </Text>
    <Text style={styles.summaryLabel}>{label}</Text>
    {helper && <Text style={styles.summaryHelper}>{helper}</Text>}
  </View>
);

const ChartPanel: React.FC<{
  title: string;
  subtitle: string;
  children: React.ReactNode;
}> = ({ title, subtitle, children }) => (
  <View style={styles.panel}>
    <View style={styles.panelHeader}>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelSubtitle}>{subtitle}</Text>
    </View>
    {children}
  </View>
);

const EmptyChart: React.FC<{ message: string }> = ({ message }) => (
  <View style={styles.emptyChart}>
    <Text style={styles.emptyChartText}>{message}</Text>
  </View>
);

const TripBarChart: React.FC<{
  data: TripChartPoint[];
  chartWidth: number;
  palette?: { color: string; gradientColor: string };
}> = ({
  data,
  chartWidth,
  palette = { color: colors.accent, gradientColor: colors.accentMuted },
}) => {
  if (data.length === 0) {
    return <EmptyChart message="Record a trip to populate this chart." />;
  }

  const maxValue = Math.max(1, ...data.map((point) => point.value));
  return (
    <ResponsiveBarChart
      data={data}
      chartWidth={chartWidth}
      maxValue={Math.ceil(maxValue * 1.15)}
      palette={palette}
    />
  );
};

const SpeedTraceChart: React.FC<{
  data: TripChartPoint[];
  chartWidth: number;
  units: Units;
}> = ({ data, chartWidth, units }) => {
  if (data.length < 2) {
    return <EmptyChart message="This trip does not have enough speed samples." />;
  }

  const maxValue = Math.max(1, ...data.map((point) => point.value));
  const spacingValue = data.length > 1 ? Math.max(10, chartWidth / data.length) : 20;

  return (
    <LineChart
      data={data.map((point, index) => ({
        value: point.value,
        label: index % Math.max(1, Math.floor(data.length / 4)) === 0
          ? point.label
          : '',
      }))}
      width={chartWidth}
      height={170}
      maxValue={Math.ceil(maxValue * 1.15)}
      noOfSections={4}
      spacing={spacingValue}
      initialSpacing={8}
      endSpacing={16}
      areaChart
      curved
      color={colors.accent}
      startFillColor={colors.accent}
      endFillColor={colors.accent}
      startOpacity={0.26}
      endOpacity={0.02}
      thickness={3}
      dataPointsColor={colors.accent}
      dataPointsRadius={2}
      yAxisLabelSuffix={` ${units}`}
      yAxisTextStyle={styles.axisText}
      xAxisLabelTextStyle={styles.axisText}
      xAxisColor={colors.border}
      yAxisColor={colors.border}
      rulesColor={colors.border}
      backgroundColor="transparent"
      isAnimated
      animationDuration={motion.headingMs}
      hideRules={false}
    />
  );
};

const BreakdownChart: React.FC<{
  title: string;
  data: { label: string; value: number; color: string; count: number }[];
}> = ({ title, data }) => {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) {
    return <EmptyChart message={`No ${title.toLowerCase()} diagnostics yet.`} />;
  }

  return (
    <View style={styles.breakdownRow}>
      <PieChart
        data={data.map((item) => ({
          value: item.value,
          color: item.color,
          text: '',
        }))}
        donut
        radius={54}
        innerRadius={34}
        innerCircleColor={colors.surfaceVariant}
        isAnimated
        animationDuration={motion.headingMs}
      />
      <View style={styles.legend}>
        {data.map((item) => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendLabel}>{item.label}</Text>
            <Text style={styles.legendValue}>
              {Math.round((item.count / total) * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const ActivityHeatmap: React.FC<{
  cells: HeatmapCell[];
  units: Units;
}> = ({ cells, units }) => {
  const [selectedCell, setSelectedCell] = useState<HeatmapCell | null>(null);
  const rows = useMemo(
    () =>
      Array.from({ length: 7 }, (_, dayIndex) =>
        cells.filter((cell) => cell.dayIndex === dayIndex),
      ),
    [cells],
  );
  const activeCell = selectedCell ?? cells.find((cell) => cell.activityMs > 0);

  return (
    <View>
      <View style={styles.heatmapHeader}>
        {[0, 6, 12, 18, 23].map((hour) => (
          <Text key={hour} style={styles.heatmapHourLabel}>
            {formatHour(hour)}
          </Text>
        ))}
      </View>
      {rows.map((row, index) => (
        <View key={index} style={styles.heatmapRow}>
          <Text style={styles.heatmapDayLabel}>{row[0]?.dayLabel}</Text>
          <View style={styles.heatmapCells}>
            {row.map((cell) => (
              <Pressable
                key={cell.key}
                accessibilityRole="button"
                accessibilityLabel={`${cell.dayLabel} ${formatHour(cell.hour)} activity`}
                onPress={() => setSelectedCell(cell)}
                style={[
                  styles.heatmapCell,
                  { backgroundColor: heatmapColor(cell.intensity) },
                  selectedCell?.key === cell.key && styles.heatmapCellSelected,
                ]}
              />
            ))}
          </View>
        </View>
      ))}
      <View style={styles.heatmapDetail}>
        {activeCell ? (
          <>
            <Text style={styles.heatmapDetailTitle}>
              {activeCell.dayLabel} {formatHour(activeCell.hour)}
            </Text>
            <Text style={styles.heatmapDetailText}>
              {formatDuration(activeCell.activityMs)} active •{' '}
              {activeCell.tripCount} trip{activeCell.tripCount === 1 ? '' : 's'} •{' '}
              {Math.round(displaySpeed(activeCell.averageSpeedMps, units))} {units}
            </Text>
          </>
        ) : (
          <Text style={styles.heatmapDetailText}>No activity yet.</Text>
        )}
      </View>
    </View>
  );
};

export const InsightsContent: React.FC<ContentProps> = ({
  trips,
  units,
  loading = false,
}) => {
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotionPreference();
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const chartWidth = Math.max(250, Math.min(width - spacing.xl * 2, 520));
  const model = useMemo(() => buildInsightsModel(trips, units), [trips, units]);
  const defaultSelectedTrip = useMemo(
    () => trips.find((trip) => trip.speedSamples.length > 1) ?? trips[0],
    [trips],
  );

  useEffect(() => {
    if (
      defaultSelectedTrip &&
      !trips.some((trip) => trip.id === selectedTripId)
    ) {
      setSelectedTripId(defaultSelectedTrip.id);
    }
  }, [defaultSelectedTrip, selectedTripId, trips]);

  const selectedTrip = useMemo(
    () =>
      trips.find((trip) => trip.id === selectedTripId) ?? defaultSelectedTrip,
    [defaultSelectedTrip, selectedTripId, trips],
  );
  const speedTrace = useMemo(
    () =>
      selectedTrip
        ? buildSpeedTrace(selectedTrip.speedSamples, units, 110)
        : [],
    [selectedTrip, units],
  );
  const distanceUnit = distanceUnitLabel(units);

  if (loading) {
    return (
      <View style={styles.centerState} testID="insights-loading">
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (trips.length === 0) {
    return (
      <View style={styles.centerState} testID="insights-empty">
        <Text style={styles.emptyTitle}>{EMPTY_TEXT}</Text>
        <Text style={styles.emptyBody}>
          Save a trip and V3l0city will build charts, diagnostics, and activity
          patterns from your local data.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      testID="insights-content"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <AnimatedSection index={0} reducedMotion={reducedMotion}>
        <View style={styles.summaryGrid}>
          <SummaryCard
            label="Trips"
            value={String(model.summary.tripCount)}
            helper={`Recent ${Math.min(MAX_TRIPS, trips.length)}`}
          />
          <SummaryCard
            label="Distance"
            value={displayDistance(
              model.summary.totalDistanceMeters,
              units,
            ).toFixed(1)}
            helper={distanceUnit}
            tone="teal"
          />
          <SummaryCard
            label="Drive Time"
            value={formatDuration(model.summary.totalDurationMs)}
          />
          <SummaryCard
            label="Best Max"
            value={String(Math.round(displaySpeed(model.summary.bestMaxSpeedMps, units)))}
            helper={units}
            tone="gold"
          />
          <SummaryCard
            label="Overall Avg"
            value={String(
              Math.round(displaySpeed(model.summary.overallAverageSpeedMps, units)),
            )}
            helper={units}
          />
        </View>
      </AnimatedSection>

      <AnimatedSection index={1} reducedMotion={reducedMotion}>
        <ChartPanel title="Average Speed" subtitle={`Per trip • ${units}`}>
          <TripBarChart
            data={model.averageSpeedPerTrip}
            chartWidth={chartWidth}
          />
        </ChartPanel>
      </AnimatedSection>

      <AnimatedSection index={2} reducedMotion={reducedMotion}>
        <ChartPanel title="Maximum Speed" subtitle={`Peak per trip • ${units}`}>
          <TripBarChart
            data={model.maxSpeedPerTrip}
            chartWidth={chartWidth}
            palette={{ color: colors.brandGold, gradientColor: colors.brandGoldDim }}
          />
        </ChartPanel>
      </AnimatedSection>

      <AnimatedSection index={3} reducedMotion={reducedMotion}>
        <ChartPanel title="Distance" subtitle={`Per trip • ${distanceUnit}`}>
          <TripBarChart
            data={model.distancePerTrip}
            chartWidth={chartWidth}
            palette={{ color: colors.brandTeal, gradientColor: colors.accentMuted }}
          />
        </ChartPanel>
      </AnimatedSection>

      <AnimatedSection index={4} reducedMotion={reducedMotion}>
        <ChartPanel
          title="Speed Trace"
          subtitle={selectedTrip ? `${formatTripChip(selectedTrip.startedAt)} • ${units}` : units}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tripSelector}
          >
            {trips.slice(0, 12).map((trip) => {
              const selected = trip.id === selectedTrip?.id;
              return (
                <Pressable
                  key={trip.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${formatTripChip(trip.startedAt)} trip`}
                  onPress={() => setSelectedTripId(trip.id)}
                  style={[styles.tripChip, selected && styles.tripChipSelected]}
                >
                  <Text
                    style={[
                      styles.tripChipText,
                      selected && styles.tripChipTextSelected,
                    ]}
                  >
                    {formatTripChip(trip.startedAt)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <SpeedTraceChart
            data={speedTrace}
            chartWidth={chartWidth}
            units={units}
          />
        </ChartPanel>
      </AnimatedSection>

      <AnimatedSection index={5} reducedMotion={reducedMotion}>
        <ChartPanel title="Signal Quality" subtitle="Stored sample diagnostics">
          <BreakdownChart title="Quality" data={model.qualityBreakdown} />
        </ChartPanel>
      </AnimatedSection>

      <AnimatedSection index={6} reducedMotion={reducedMotion}>
        <ChartPanel title="Speed Source" subtitle="Where speed came from">
          <BreakdownChart title="Source" data={model.sourceBreakdown} />
        </ChartPanel>
      </AnimatedSection>

      <AnimatedSection index={7} reducedMotion={reducedMotion}>
        <ChartPanel title="Activity Heatmap" subtitle="Day and hour driving intensity">
          <ActivityHeatmap cells={model.heatmapCells} units={units} />
        </ChartPanel>
      </AnimatedSection>
    </ScrollView>
  );
};

const InsightsScreen: React.FC<Props> = ({ units }) => {
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<TripWithSpeedSamples[]>([]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getRecentTripsWithSpeedSamples(MAX_TRIPS)
      .then((loadedTrips) => {
        if (mounted) {
          setTrips(loadedTrips);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  return <InsightsContent trips={trips} units={units} loading={loading} />;
};

const styles = StyleSheet.create({
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.display,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyBody: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  content: {
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryCard: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 92,
    padding: spacing.md,
    width: '47.8%',
  },
  summaryValue: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.numeric,
    fontSize: 26,
    fontWeight: '800',
  },
  summaryValueGold: {
    color: colors.brandGold,
  },
  summaryValueTeal: {
    color: colors.brandTeal,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 11,
    fontWeight: '700',
    marginTop: spacing.xxs,
    textTransform: 'uppercase',
  },
  summaryHelper: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.body,
    fontSize: 12,
    marginTop: spacing.xxs,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.md,
    overflow: 'hidden',
    padding: spacing.md,
  },
  panelHeader: {
    marginBottom: spacing.md,
  },
  panelTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.display,
    fontSize: 17,
    fontWeight: '800',
  },
  panelSubtitle: {
    color: colors.textMuted,
    fontFamily: fontFamilies.body,
    fontSize: 12,
    marginTop: 2,
  },
  axisText: {
    color: colors.textMuted,
    fontFamily: fontFamilies.numeric,
    fontSize: 10,
  },
  topLabelText: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.numeric,
    fontSize: 9,
  },
  responsiveChart: {
    minHeight: 180,
    width: '100%',
  },
  emptyChart: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSoft,
    borderRadius: radii.sm,
    minHeight: 112,
    justifyContent: 'center',
    padding: spacing.md,
  },
  emptyChartText: {
    color: colors.textMuted,
    fontFamily: fontFamilies.body,
    fontSize: 13,
    textAlign: 'center',
  },
  tripSelector: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  tripChip: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  tripChipSelected: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accent,
  },
  tripChipText: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
    fontWeight: '700',
  },
  tripChipTextSelected: {
    color: colors.textPrimary,
  },
  breakdownRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  legend: {
    flex: 1,
    gap: spacing.xs,
  },
  legendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  legendDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  legendLabel: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: fontFamilies.body,
    fontSize: 13,
  },
  legendValue: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.numeric,
    fontSize: 13,
    fontWeight: '700',
  },
  heatmapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginLeft: 34,
    marginBottom: spacing.xs,
  },
  heatmapHourLabel: {
    color: colors.textMuted,
    fontFamily: fontFamilies.numeric,
    fontSize: 9,
  },
  heatmapRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 5,
  },
  heatmapDayLabel: {
    color: colors.textMuted,
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 10,
    width: 34,
  },
  heatmapCells: {
    flex: 1,
    flexDirection: 'row',
    gap: 3,
  },
  heatmapCell: {
    aspectRatio: 1,
    borderRadius: 3,
    flex: 1,
  },
  heatmapCellSelected: {
    borderColor: colors.brandGold,
    borderWidth: 1,
  },
  heatmapDetail: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radii.sm,
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  heatmapDetailTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 13,
    fontWeight: '800',
  },
  heatmapDetailText: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.body,
    fontSize: 12,
    marginTop: 2,
  },
});

export default InsightsScreen;
