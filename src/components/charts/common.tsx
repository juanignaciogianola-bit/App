import { useState } from 'react';
import { Platform, View, type LayoutChangeEvent } from 'react-native';
import { colors, radius, space } from '@/theme';
import { Text } from '../ui';

/** Measures the available width so SVG charts draw at 1:1 (no stretched strokes or text). */
export function useWidth(initial = 0) {
  const [width, setWidth] = useState(initial);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };
  return { width, onLayout };
}

/** Tooltip: value first (strong), label second (muted), keyed by a short line in the series colour. */
export function ChartTooltip({
  x,
  containerWidth,
  value,
  label,
  color,
  top = 0,
}: {
  x: number;
  containerWidth: number;
  value: string;
  label: string;
  color: string;
  top?: number;
}) {
  const W = 128;
  const left = Math.min(Math.max(0, x - W / 2), Math.max(0, containerWidth - W));
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top,
        left,
        width: W,
        paddingVertical: space.sm,
        paddingHorizontal: space.md,
        borderRadius: radius.sm,
        backgroundColor: colors.surfaceHigh,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 2,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 10, height: 2, borderRadius: 1, backgroundColor: color }} />
        <Text testID="chart-tooltip-value" variant="h3">{value}</Text>
      </View>
      <Text variant="small" muted>{label}</Text>
    </View>
  );
}

/** Legend item: rect swatch for bars/areas, short line for lines. */
export function LegendItem({ color, label, kind = 'rect' }: { color: string; label: string; kind?: 'rect' | 'line' | 'band' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={
          kind === 'line'
            ? { width: 12, height: 2, borderRadius: 1, backgroundColor: color }
            : { width: 10, height: 10, borderRadius: 2, backgroundColor: color }
        }
      />
      <Text variant="small" muted>{label}</Text>
    </View>
  );
}

/** SVG text does not inherit the app font: use the same system sans stack everywhere. */
export const CHART_FONT = Platform.select({
  web: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  default: undefined,
});
