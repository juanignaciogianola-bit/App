import { useMemo, useState } from 'react';
import { Platform, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { formatTick, nearestIndex, niceTicks, shortDate } from '@/lib/chartScale';
import { colors } from '@/theme';
import { ChartTooltip, useWidth, CHART_FONT } from './common';

export interface LinePoint {
  date: string; // ISO date or timestamp
  value: number;
}

const PAD = { l: 40, r: 14, t: 14, b: 26 };

/**
 * Single-series time chart: hairline grid on clean ticks, 2 px line, 10 % area wash,
 * ringed end marker with its value, and a crosshair that snaps to the nearest point
 * while dragging (touch) or hovering (web).
 */
export function LineChart({
  points,
  height = 190,
  color = colors.accent,
  unit = '',
  formatValue = (v: number) => `${formatTick(v)}${unit}`,
  testID,
}: {
  points: LinePoint[];
  height?: number;
  color?: string;
  unit?: string;
  formatValue?: (v: number) => string;
  testID?: string;
}) {
  const { width, onLayout } = useWidth();
  const [active, setActive] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (!width || points.length === 0) return null;
    const values = points.map((p) => p.value);
    const ticks = niceTicks(Math.min(...values), Math.max(...values), 3);
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const x0 = PAD.l;
    const x1 = width - PAD.r;
    const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (height - PAD.t - PAD.b);
    const x = (i: number) => (points.length === 1 ? (x0 + x1) / 2 : x0 + (i * (x1 - x0)) / (points.length - 1));
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const base = y(lo);
    const area = `${line} L${x(points.length - 1).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`;
    // x labels: first, last and (if room) the middle
    const labelIdx = points.length >= 5 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.length > 1 ? [0, points.length - 1] : [0];
    return { ticks, x, y, x0, x1, line, area, labelIdx };
  }, [width, height, points]);

  const pick = (e: GestureResponderEvent | { nativeEvent: { locationX?: number; offsetX?: number } }) => {
    if (!geo) return;
    const ne = e.nativeEvent as { locationX?: number; offsetX?: number };
    const lx = ne.locationX ?? ne.offsetX ?? 0;
    setActive(nearestIndex(lx, geo.x0, geo.x1, points.length));
  };

  const last = points.length - 1;
  const shown = active ?? null;
  const hoverProps =
    Platform.OS === 'web'
      ? ({ onPointerMove: pick, onPointerLeave: () => setActive(null) } as object)
      : {};

  return (
    <View testID={testID} onLayout={onLayout} style={{ height }}>
      {geo ? (
        <>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.18} />
                <Stop offset="1" stopColor={color} stopOpacity={0.02} />
              </LinearGradient>
            </Defs>
            {geo.ticks.map((t) => (
              <G_Tick key={t} y={geo.y(t)} x0={geo.x0} x1={geo.x1} label={formatTick(t)} />
            ))}
            {points.length > 1 ? <Path d={geo.area} fill="url(#area)" /> : null}
            <Path d={geo.line} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {geo.labelIdx.map((i) => (
              <SvgText fontFamily={CHART_FONT}
                key={i}
                x={geo.x(i)}
                y={height - 8}
                fill={colors.axis}
                fontSize={10}
                textAnchor={i === 0 && points.length > 1 ? 'start' : i === last && points.length > 1 ? 'end' : 'middle'}
              >
                {shortDate(points[i].date)}
              </SvgText>
            ))}
            {shown !== null ? (
              <Line x1={geo.x(shown)} x2={geo.x(shown)} y1={PAD.t} y2={height - PAD.b} stroke={colors.textMuted} strokeWidth={1} />
            ) : null}
            {/* End marker (or the active point): series fill + 2 px surface ring */}
            <Circle
              cx={geo.x(shown ?? last)}
              cy={geo.y(points[shown ?? last].value)}
              r={5}
              fill={color}
              stroke={colors.surface}
              strokeWidth={2}
            />
            {shown === null ? (
              <SvgText fontFamily={CHART_FONT}
                x={Math.min(geo.x(last), geo.x1) - 8}
                y={geo.y(points[last].value) - 10}
                fill={colors.text}
                fontSize={12}
                fontWeight="600"
                textAnchor="end"
              >
                {formatValue(points[last].value)}
              </SvgText>
            ) : null}
          </Svg>
          {/* Hit layer: the whole plot finds the x, the reader never has to hit the 2 px line */}
          <View
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
            onResponderGrant={pick}
            onResponderMove={pick}
            onResponderRelease={() => setTimeout(() => setActive(null), 1800)}
            {...hoverProps}
          />
          {shown !== null ? (
            <ChartTooltip
              x={geo.x(shown)}
              containerWidth={width}
              value={formatValue(points[shown].value)}
              label={shortDate(points[shown].date)}
              color={color}
              top={-8}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function G_Tick({ y, x0, x1, label }: { y: number; x0: number; x1: number; label: string }) {
  return (
    <>
      <Line x1={x0} x2={x1} y1={y} y2={y} stroke={colors.grid} strokeWidth={1} />
      <SvgText fontFamily={CHART_FONT} x={x0 - 8} y={y + 3.5} fill={colors.axis} fontSize={10} textAnchor="end">
        {label}
      </SvgText>
    </>
  );
}
