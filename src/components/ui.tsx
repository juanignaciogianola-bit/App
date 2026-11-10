import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font, radius, space } from '@/theme';

type Variant = keyof typeof font;

export function Text({
  variant = 'body',
  muted,
  style,
  ...rest
}: TextProps & { variant?: Variant; muted?: boolean }) {
  return (
    <RNText
      style={[font[variant], { color: muted ? colors.textMuted : colors.text }, style]}
      {...rest}
    />
  );
}

export function Screen({
  children,
  style,
  edges = ['top', 'bottom'],
}: {
  children: ReactNode;
  style?: ViewStyle;
  edges?: ('top' | 'bottom')[];
}) {
  return (
    <SafeAreaView edges={edges} style={[styles.screen, style]}>
      {children}
    </SafeAreaView>
  );
}

export function Card({ style, ...rest }: ViewProps) {
  return <View style={[styles.card, style]} {...rest} />;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  testID,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  const bg =
    variant === 'primary' ? colors.accent : variant === 'secondary' ? colors.surfaceHigh : 'transparent';
  const fg =
    variant === 'primary' ? colors.accentText : variant === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: isDisabled ? 0.4 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[font.h3, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Input({
  label,
  suffix,
  style,
  containerStyle,
  ...rest
}: TextInputProps & { label?: string; suffix?: string; containerStyle?: ViewStyle }) {
  return (
    <View style={[{ gap: space.xs }, containerStyle]}>
      {label ? (
        <Text variant="caption" muted>
          {label}
        </Text>
      ) : null}
      <View style={styles.inputWrap}>
        <TextInput
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.accent}
          style={[styles.input, style]}
          {...rest}
        />
        {suffix ? (
          <Text muted style={{ paddingRight: space.lg }}>
            {suffix}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Large tappable option used for single-choice questions. */
export function Choice({
  label,
  description,
  selected,
  onPress,
  testID,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && { borderColor: colors.accent, backgroundColor: colors.surfaceHigh }]}
    >
      <Text variant="h3">{label}</Text>
      {description ? (
        <Text variant="small" muted style={{ marginTop: 2 }}>
          {description}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function ProgressBar({ value, color = colors.accent }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  button: {
    height: 54,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    height: 52,
    paddingHorizontal: space.lg,
    color: colors.text,
    fontSize: 17,
  },
  choice: {
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});

export function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={{
        paddingHorizontal: space.md,
        height: 34,
        justifyContent: 'center',
        borderRadius: radius.pill,
        backgroundColor: selected ? colors.accent : colors.surfaceHigh,
      }}
    >
      <Text variant="small" style={{ color: selected ? colors.accentText : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  label,
  testID,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  label?: string;
  testID?: string;
}) {
  const btn = (text: string, next: number, disabled: boolean, id: string) => (
    <Pressable
      testID={testID ? `${testID}-${id}` : undefined}
      disabled={disabled}
      onPress={() => onChange(next)}
      hitSlop={6}
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceHigh,
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Text variant="h3">{text}</Text>
    </Pressable>
  );
  return (
    <View style={{ alignItems: 'center', gap: space.xs }}>
      {label ? <Text variant="caption" muted>{label}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {btn('−', value - 1, value <= min, 'dec')}
        <Text testID={testID ? `${testID}-value` : undefined} variant="h3" style={{ minWidth: 24, textAlign: 'center' }}>
          {value}
        </Text>
        {btn('+', value + 1, value >= max, 'inc')}
      </View>
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm }}>
      <Text variant="h2">{title}</Text>
      {action}
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: space.xl, gap: space.xs }}>
      <Text variant="h3">{title}</Text>
      {body ? <Text muted style={{ textAlign: 'center' }}>{body}</Text> : null}
    </Card>
  );
}
