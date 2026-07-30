type SpeedometerProps = {
  speed: number;
  unit?: string;
  label?: string;
  size?: number;
  active?: boolean;
  maxScale?: number;
};

const START_ANGLE = 135;
const END_ANGLE = 405;
const SWEEP = END_ANGLE - START_ANGLE;
const MAJOR_INTERVAL = 20;
const MINOR_INTERVAL = 10;

function polarToCartesian(angle: number, radius: number, center: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return { x: center + radius * Math.cos(radians), y: center + radius * Math.sin(radians) };
}

function describeArc(startAngle: number, endAngle: number, radius: number, center: number) {
  const start = polarToCartesian(startAngle, radius, center);
  const end = polarToCartesian(endAngle, radius, center);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/**
 * Web-safe rendering of the native SpeedDial component. It deliberately keeps
 * the native app's simple hybrid readout: progress arc and calibration marks
 * around a single digital speed value, without decorative needles or rings.
 */
export function Speedometer({
  speed,
  unit = "MPH",
  label = "Live speed",
  size = 440,
  active = false,
  maxScale: requestedMaxScale,
}: SpeedometerProps) {
  const maxScale = requestedMaxScale ?? (speed > 160 ? 300 : speed > 80 ? 200 : 160);
  const clampedSpeed = Math.min(Math.max(0, speed), maxScale);
  const fraction = clampedSpeed / maxScale;
  const viewBoxSize = 260;
  const center = viewBoxSize / 2;
  const radius = viewBoxSize / 2 - viewBoxSize * 0.077;
  const strokeWidth = Math.max(2.5, viewBoxSize * 0.012);
  const arcLength = radius * ((SWEEP * Math.PI) / 180);
  const trackPath = describeArc(START_ANGLE, END_ANGLE, radius, center);
  const status = active ? "Recording" : label;

  const ticks = [];
  for (let value = 0; value <= maxScale; value += MINOR_INTERVAL) {
    const progress = value / maxScale;
    const angle = START_ANGLE + progress * SWEEP;
    const major = value % MAJOR_INTERVAL === 0;
    const outer = polarToCartesian(angle, radius + viewBoxSize * 0.031, center);
    const inner = polarToCartesian(
      angle,
      major ? radius - viewBoxSize * 0.038 : radius - viewBoxSize * 0.016,
      center,
    );
    const lit = angle <= START_ANGLE + fraction * SWEEP;

    ticks.push(
      <line
        key={`tick-${value}`}
        x1={outer.x}
        y1={outer.y}
        x2={inner.x}
        y2={inner.y}
        stroke={lit ? "var(--cyan)" : "var(--gauge-track)"}
        strokeWidth={major ? Math.max(1.7, viewBoxSize * 0.01) : Math.max(0.8, viewBoxSize * 0.004)}
        strokeLinecap="round"
      />,
    );

    if (major && (value === 0 || value === maxScale / 2 || value === maxScale)) {
      const labelPosition = polarToCartesian(angle, radius - viewBoxSize * 0.095, center);
      ticks.push(
        <text
          key={`label-${value}`}
          x={labelPosition.x}
          y={labelPosition.y + viewBoxSize * 0.012}
          fill="var(--gauge-label)"
          fontFamily="var(--font-display), Rajdhani, Arial, sans-serif"
          fontSize={Math.max(8, viewBoxSize * 0.036)}
          textAnchor="middle"
        >
          {value}
        </text>,
      );
    }
  }

  return (
    <div className="speedometer" style={{ width: size, maxWidth: "100%" }} role="img" aria-label={`${status}: ${Math.round(speed)} ${unit}`}>
      <svg viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`} role="img" aria-hidden="true">
        <path d={trackPath} stroke="var(--gauge-track)" strokeWidth={strokeWidth} fill="none" strokeLinecap="round" />
        <path
          className="speedometer-progress"
          d={trackPath}
          stroke="var(--cyan)"
          strokeWidth={strokeWidth + 1}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${arcLength}`}
          strokeDashoffset={arcLength * (1 - fraction)}
        />
        {ticks}
      </svg>
      <div className="speedometer-center" aria-hidden="true">
        <strong>{Math.round(speed)}</strong>
        <span>{unit}</span>
      </div>
    </div>
  );
}
