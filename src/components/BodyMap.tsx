import { useMemo } from 'react';
import { Platform, View } from 'react-native';
import Svg, { Ellipse, G, Path, Rect } from 'react-native-svg';
import type { Experience } from '@/lib/nutrition';
import { volumeStatus, type VolumeStatus } from '@/lib/training';
import type { MuscleId } from '@/lib/types';
import { colors } from '@/theme';
import { Text } from './ui';

/**
 * Stylised anatomical figure. Each shape is drawn for the figure's right side
 * (viewer's left, x < 100) and mirrored around x = 100.
 * viewBox: 200 × 400.
 */
type Shape = { muscle: MuscleId; d: string };

const FRONT: Shape[] = [
  { muscle: 'traps', d: 'M93,58 L80,67 L93,66 Z' },
  { muscle: 'side_delts', d: 'M70,68 C59,72 55,84 56,100 L64,99 C63,88 66,78 74,70 Z' },
  { muscle: 'front_delts', d: 'M76,69 C68,77 65,88 66,99 L77,94 C78,85 81,76 86,70 Z' },
  { muscle: 'chest', d: 'M98,72 L88,70 C81,76 78,88 79,100 C86,108 95,108 98,105 Z' },
  { muscle: 'biceps', d: 'M57,104 C53,118 53,134 57,148 L67,148 C70,134 71,118 68,102 Z' },
  { muscle: 'forearms', d: 'M56,153 C50,168 48,186 50,203 L59,203 C63,188 67,170 67,153 Z' },
  { muscle: 'abs', d: 'M89,112 h8 a2,2 0 0 1 2,2 v14 a2,2 0 0 1 -2,2 h-8 a2,2 0 0 1 -2,-2 v-14 a2,2 0 0 1 2,-2 Z' },
  { muscle: 'abs', d: 'M89,133 h8 a2,2 0 0 1 2,2 v14 a2,2 0 0 1 -2,2 h-8 a2,2 0 0 1 -2,-2 v-14 a2,2 0 0 1 2,-2 Z' },
  { muscle: 'abs', d: 'M89,154 h8 a2,2 0 0 1 2,2 v16 C99,178 94,182 89,180 a2,2 0 0 1 -2,-2 v-20 a2,2 0 0 1 2,-2 Z' },
  { muscle: 'obliques', d: 'M82,110 C78,126 78,150 82,172 L85,174 L85,112 Z' },
  { muscle: 'quads', d: 'M80,190 C71,214 71,246 78,276 L92,276 C93,252 93,226 96,200 Z' },
  { muscle: 'adductors', d: 'M98,196 C95,212 94,228 94,246 L98,238 Z' },
  { muscle: 'calves', d: 'M80,296 C75,320 76,348 81,372 L90,372 C93,348 93,320 91,296 Z' },
];

const BACK: Shape[] = [
  { muscle: 'traps', d: 'M100,54 L92,58 L76,68 L88,76 L95,96 L100,112 Z' },
  { muscle: 'rear_delts', d: 'M70,68 C59,73 55,86 57,100 L67,97 C67,86 70,77 77,71 Z' },
  { muscle: 'upper_back', d: 'M86,80 L76,74 C72,84 74,96 80,104 L93,100 Z' },
  { muscle: 'lats', d: 'M79,108 C78,126 82,144 90,160 L98,160 L98,122 L94,104 Z' },
  { muscle: 'lower_back', d: 'M91,164 L98,164 L98,186 L88,186 C87,178 88,170 91,164 Z' },
  { muscle: 'triceps', d: 'M57,104 C53,118 53,134 57,148 L67,148 C70,134 71,118 68,102 Z' },
  { muscle: 'forearms', d: 'M56,153 C50,168 48,186 50,203 L59,203 C63,188 67,170 67,153 Z' },
  { muscle: 'glutes', d: 'M98,190 L84,188 C75,198 74,216 80,228 C88,234 96,232 98,228 Z' },
  { muscle: 'hamstrings', d: 'M80,232 C74,250 75,268 80,282 L94,282 C96,266 96,250 96,234 Z' },
  { muscle: 'calves', d: 'M80,294 C72,312 74,334 80,352 L92,352 C96,334 96,312 92,294 Z' },
];

// Non-muscle body parts, drawn first in a neutral tone.
function Skeleton() {
  const fill = '#262630';
  return (
    <G fill={fill}>
      <Ellipse cx={100} cy={30} rx={16} ry={20} />
      <Rect x={93} y={48} width={14} height={12} rx={4} />
      {[1, -1].map((s) => (
        <G key={s} transform={s === -1 ? 'translate(200,0) scale(-1,1)' : undefined}>
          <Ellipse cx={53} cy={213} rx={6} ry={9} />
          <Ellipse cx={86} cy={287} rx={7} ry={7} />
          <Path d="M80,376 L91,376 L93,388 C88,392 79,392 76,388 Z" />
          <Path d="M85,186 L98,188 L98,194 L82,192 Z" />
        </G>
      ))}
    </G>
  );
}

// react-native-svg's web build forwards RN responder props to the DOM when it sees
// onPress (React warns about them), so on web we attach a plain click handler.
function pressProps(handler?: () => void): object {
  if (!handler) return {};
  // onPress must be null (not undefined) or prepare() overwrites onClick with it.
  return Platform.OS === 'web' ? { onPress: null, onClick: handler, style: { cursor: 'pointer' } } : { onPress: handler };
}

export const STATUS_COLORS: Record<VolumeStatus, string> = {
  none: '#34343F',
  low: '#5E7A12',
  optimal: colors.accent,
  high: '#FFB547',
};

interface Props {
  side: 'front' | 'back';
  volume: Partial<Record<MuscleId, number>>;
  experience: Experience;
  selected?: MuscleId | null;
  onPressMuscle?: (m: MuscleId) => void;
  height?: number;
}

export function BodyMap({ side, volume, experience, selected, onPressMuscle, height = 320 }: Props) {
  const shapes = side === 'front' ? FRONT : BACK;
  const fills = useMemo(() => {
    const out: Partial<Record<MuscleId, string>> = {};
    for (const s of shapes) out[s.muscle] = STATUS_COLORS[volumeStatus(volume[s.muscle] ?? 0, experience)];
    return out;
  }, [shapes, volume, experience]);

  return (
    <View style={{ height, aspectRatio: 200 / 400 }}>
      <Svg width="100%" height="100%" viewBox="0 0 200 400">
        <Skeleton />
        {[1, -1].map((s) => (
          <G key={s} transform={s === -1 ? 'translate(200,0) scale(-1,1)' : undefined}>
            {shapes.map((shape, i) => (
              <Path
                key={`${shape.muscle}-${i}`}
                testID={onPressMuscle && s === 1 && i === shapes.findIndex((x) => x.muscle === shape.muscle) ? `muscle-${shape.muscle}` : undefined}
                d={shape.d}
                fill={fills[shape.muscle]}
                stroke={selected === shape.muscle ? colors.text : colors.bg}
                strokeWidth={selected === shape.muscle ? 1.5 : 0.75}
                {...pressProps(onPressMuscle && (() => onPressMuscle(shape.muscle)))}
              />
            ))}
          </G>
        ))}
      </Svg>
    </View>
  );
}

const LEGEND: [VolumeStatus, string][] = [
  ['none', 'Sin entrenar'],
  ['low', 'Bajo'],
  ['optimal', 'Óptimo'],
  ['high', 'Alto'],
];

export function BodyMapLegend() {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14 }}>
      {LEGEND.map(([status, label]) => (
        <View key={status} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: STATUS_COLORS[status] }} />
          <Text variant="small" muted>{label}</Text>
        </View>
      ))}
    </View>
  );
}
