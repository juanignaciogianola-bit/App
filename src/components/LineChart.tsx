import { View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { colors } from '@/theme';

/** Minimal line chart: evenly spaced points, min/max labels on the y-axis. */
export function LineChart({ values, height = 160, unit = '' }: { values: number[]; height?: number; unit?: string }) {
  const W = 320;
  const H = height;
  const pad = { l: 36, r: 10, t: 12, b: 12 };
  if (values.length === 0) return <View style={{ height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad.l + (values.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (values.length - 1));
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {[max, min].map((v, i) => (
        <SvgText key={i} x={pad.l - 6} y={y(v) + 4} fill={colors.textFaint} fontSize={10} textAnchor="end">
          {Math.round(v)}{unit}
        </SvgText>
      ))}
      <Line x1={pad.l} x2={W - pad.r} y1={y(min)} y2={y(min)} stroke={colors.border} strokeWidth={1} />
      <Path d={d} stroke={colors.accent} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (
        <Circle key={i} cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 4.5 : 3} fill={colors.accent} />
      ))}
    </Svg>
  );
}
