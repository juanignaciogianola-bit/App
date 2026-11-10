import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme';
import { Text } from './ui';

/** Calorie ring: fills with the accent colour, turns orange past 100 %. */
export function Ring({ value, target, size = 150, stroke = 12, label = 'kcal' }: { value: number; target: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? value / target : 0;
  const over = pct > 1;
  const left = Math.round(target - value);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceHigh} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={over ? colors.carbs : colors.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - Math.min(1, pct))}
        />
      </Svg>
      <Text testID="ring-left" style={{ fontSize: size / 5, fontWeight: '800', color: colors.text, letterSpacing: -1 }}>
        {Math.abs(left)}
      </Text>
      <Text variant="small" muted>{over ? `${label} de más` : `${label} restantes`}</Text>
    </View>
  );
}
