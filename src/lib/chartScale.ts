/** Axis helpers shared by the charts. Pure, unit-tested. */

/** "Nice" tick values (1, 2, 2.5, 5 × 10^n) covering [min, max] with about `count` ticks. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) {
    if (max === 0) return [0, 1];
    min = Math.min(0, min);
    max = max * 1.1;
  }
  const span = max - min;
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/** Full numbers under 10,000 (with thousands separators), compact above (12.9K). */
export function formatTick(v: number): string {
  if (Math.abs(v) >= 10_000) return `${Math.round(v / 100) / 10}K`.replace('.0K', 'K');
  return Math.round(v * 10) / 10 === Math.round(v) ? Math.round(v).toLocaleString('es') : (Math.round(v * 10) / 10).toLocaleString('es');
}

/** Index of the data point nearest to x, given evenly spaced points from x0 to x1. */
export function nearestIndex(x: number, x0: number, x1: number, n: number): number {
  if (n <= 1) return 0;
  const t = (x - x0) / (x1 - x0);
  return Math.min(n - 1, Math.max(0, Math.round(t * (n - 1))));
}

export function shortDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso) : iso;
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');
}

export function weekdayInitial(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es', { weekday: 'short' }).slice(0, 2).replace('.', '');
}
