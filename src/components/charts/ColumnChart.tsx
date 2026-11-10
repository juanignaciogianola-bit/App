import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { formatTick, niceTicks } from '@/lib/chartScale';
import { colors } from '@/theme';
import { useWidth, CHART_FONT } from './common';

export interface Column {
  key: string;
  label: string; // x-axis label
  value: number;
}

const PAD = { l: 40, r: 8, t: 22, b: 24 };

/** Column with a 4 px rounded data end and a square base on the baseline. */
function columnPath(x: number, w: number, top: number, base: number) {
  const r = Math.min(4, w / 2, Math.max(0, base - top));
  return `M${x},${base} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + w - r},${top} Q${x + w},${top} ${x + w},${top + r} L${x + w},${base} Z`;
}

/**
 * One series of columns (≤ 24 px, never filling the slot) with an optional target
 * reference line. The selected column is emphasised and labelled at its cap; the
 * rest recede. Tapping a column selects it (the whole slot is the hit target).
 */
export function ColumnChart({
  data,
  height = 170,
  color = colors.accent,
  target,
  targetLabel,
  selectedKey,
  onSelect,
  formatValue = formatTick,
  labelEvery = 1,
  testID,
}: {
  data: Column[];
  height?: number;
  color?: string;
  target?: number | null;
  targetLabel?: string;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  formatValue?: (v: number) => string;
  labelEvery?: number;
  testID?: string;
}) {
  const { width, onLayout } = useWidth();

  const geo = useMemo(() => {
    if (!width || !data.length) return null;
    const max = Math.max(...data.map((d) => d.value), target ?? 0, 1);
    const ticks = niceTicks(0, max, 3);
    const hi = ticks[ticks.length - 1];
    const plotW = width - PAD.l - PAD.r;
    const slot = plotW / data.length;
    const barW = Math.min(24, slot * 0.56);
    const base = height - PAD.b;
    const y = (v: number) => PAD.t + (1 - v / hi) * (base - PAD.t);
    return { ticks, slot, barW, base, y };
  }, [width, height, data, target]);

  return (
    <View testID={testID} onLayout={onLayout} style={{ height }}>
      {geo ? (
        <>
          <Svg width={width} height={height}>
            {geo.ticks.map((t) => (
              <Line key={`g${t}`} x1={PAD.l} x2={width - PAD.r} y1={geo.y(t)} y2={geo.y(t)} stroke={colors.grid} strokeWidth={1} />
            ))}
            {geo.ticks.map((t) => (
              <SvgText fontFamily={CHART_FONT} key={`t${t}`} x={PAD.l - 8} y={geo.y(t) + 3.5} fill={colors.axis} fontSize={10} textAnchor="end">
                {formatTick(t)}
              </SvgText>
            ))}
            {data.map((d, i) => {
              const x = PAD.l + i * geo.slot + (geo.slot - geo.barW) / 2;
              const selected = d.key === selectedKey;
              const top = geo.y(d.value);
              return d.value > 0 ? (
                <Path
                  key={d.key}
                  d={columnPath(x, geo.barW, top, geo.base)}
                  fill={color}
                  opacity={selectedKey == null || selected ? 1 : 0.38}
                />
              ) : (
                // A zero still marks its slot, so empty days read as data, not as missing.
                <Rect key={d.key} x={x} y={geo.base - 2} width={geo.barW} height={2} rx={1} fill={colors.grid} />
              );
            })}
            {target ? (
              <>
                <Line x1={PAD.l} x2={width - PAD.r} y1={geo.y(target)} y2={geo.y(target)} stroke={colors.textMuted} strokeWidth={1} />
                {targetLabel ? (
                  <SvgText fontFamily={CHART_FONT} x={width - PAD.r} y={geo.y(target) - 5} fill={colors.textMuted} fontSize={10} textAnchor="end">
                    {targetLabel}
                  </SvgText>
                ) : null}
              </>
            ) : null}
            {data.map((d, i) => {
              const cx = PAD.l + i * geo.slot + geo.slot / 2;
              const selected = d.key === selectedKey;
              return (
                <SvgText fontFamily={CHART_FONT}
                  key={`x${d.key}`}
                  x={cx}
                  y={height - 7}
                  fill={selected ? colors.text : colors.axis}
                  fontSize={10}
                  fontWeight={selected ? '700' : '400'}
                  textAnchor="middle"
                >
                  {i % labelEvery === 0 || selected ? d.label : ''}
                </SvgText>
              );
            })}
            {/* Value label only on the selected column's cap */}
            {data.map((d, i) =>
              d.key === selectedKey && d.value > 0 ? (
                <SvgText fontFamily={CHART_FONT}
                  key={`v${d.key}`}
                  testID="column-selected-value"
                  x={PAD.l + i * geo.slot + geo.slot / 2}
                  y={geo.y(d.value) - 6}
                  fill={colors.text}
                  fontSize={11}
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {formatValue(d.value)}
                </SvgText>
              ) : null,
            )}
          </Svg>
          {onSelect ? (
            <View style={{ position: 'absolute', left: PAD.l, right: PAD.r, top: 0, bottom: 0, flexDirection: 'row' }}>
              {data.map((d) => (
                <Pressable
                  key={d.key}
                  testID={`column-${d.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${d.label}: ${formatValue(d.value)}`}
                  onPress={() => onSelect(d.key)}
                  style={{ flex: 1 }}
                />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
