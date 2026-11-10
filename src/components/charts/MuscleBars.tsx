import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { formatTick } from '@/lib/chartScale';
import { colors } from '@/theme';
import { useWidth, LegendItem, CHART_FONT } from './common';
import { Text } from '../ui';

const LABEL_W = 108;
const ROW_H = 26;
const BAR_H = 10;
const PAD_R = 34;

function barPath(x0: number, x1: number, y: number) {
  const r = Math.min(4, (x1 - x0) / 2);
  return `M${x0},${y} L${x1 - r},${y} Q${x1},${y} ${x1},${y + r} L${x1},${y + BAR_H - r} Q${x1},${y + BAR_H} ${x1 - r},${y + BAR_H} L${x0},${y + BAR_H} Z`;
}

/**
 * Weekly sets per muscle, ranked, against the productive range for the user's
 * experience (a recessive band). One colour for every bar; the band carries the
 * "in range" meaning and each bar carries its value at the tip.
 */
export function MuscleBars({
  rows,
  targetMin,
  targetMax,
  untrained,
}: {
  rows: { id: string; label: string; value: number }[];
  targetMin: number;
  targetMax: number;
  untrained: string[];
}) {
  const { width, onLayout } = useWidth();
  const height = rows.length * ROW_H + 18;

  const geo = useMemo(() => {
    if (!width) return null;
    const max = Math.max(targetMax * 1.25, ...rows.map((r) => r.value));
    const x0 = LABEL_W;
    const x1 = width - PAD_R;
    const x = (v: number) => x0 + (v / max) * (x1 - x0);
    return { x, x0, x1 };
  }, [width, rows, targetMax]);

  return (
    <View style={{ gap: 10 }}>
      {rows.length ? (
        <View onLayout={onLayout} style={{ height }} testID="muscle-bars">
          {geo ? (
            <Svg width={width} height={height}>
              <Rect x={geo.x(targetMin)} y={0} width={geo.x(targetMax) - geo.x(targetMin)} height={height - 18} fill="rgba(198,244,50,0.09)" />
              <Line x1={geo.x0} x2={geo.x0} y1={0} y2={height - 18} stroke={colors.grid} strokeWidth={1} />
              {[0, targetMin, targetMax].map((t) => (
                <SvgText fontFamily={CHART_FONT} key={t} x={geo.x(t)} y={height - 4} fill={colors.axis} fontSize={10} textAnchor="middle">
                  {formatTick(t)}
                </SvgText>
              ))}
              {rows.map((r, i) => {
                const y = i * ROW_H + (ROW_H - BAR_H) / 2;
                return (
                  <G key={r.id}>
                    <SvgText fontFamily={CHART_FONT} x={0} y={y + BAR_H - 1} fill={colors.textMuted} fontSize={12}>
                      {r.label}
                    </SvgText>
                    <Path d={barPath(geo.x0, Math.max(geo.x0 + 2, geo.x(r.value)), y)} fill={colors.accent} />
                    <SvgText fontFamily={CHART_FONT} x={geo.x(r.value) + 6} y={y + BAR_H - 1} fill={colors.text} fontSize={11} fontWeight="600">
                      {formatTick(r.value)}
                    </SvgText>
                  </G>
                );
              })}
            </Svg>
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <LegendItem color="rgba(198,244,50,0.16)" label={`Rango objetivo ${targetMin}–${targetMax} series`} />
      </View>
      {untrained.length ? (
        <Text variant="small" muted>
          Sin entrenar esta semana: {untrained.join(', ')}
        </Text>
      ) : null}
    </View>
  );
}

function G({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
