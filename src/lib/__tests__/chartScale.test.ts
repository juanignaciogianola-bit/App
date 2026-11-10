import { formatTick, nearestIndex, niceTicks } from '../chartScale';

describe('niceTicks', () => {
  it('produces clean steps that cover the data', () => {
    expect(niceTicks(0, 2760)).toEqual([0, 1000, 2000, 3000]);
    expect(niceTicks(87.5, 101.3)).toEqual([85, 90, 95, 100, 105]);
    expect(niceTicks(0, 7)).toEqual([0, 2, 4, 6, 8]);
  });
  it('handles flat and empty data', () => {
    expect(niceTicks(0, 0)).toEqual([0, 1]);
    expect(niceTicks(100, 100)[0]).toBe(0);
  });
});

describe('formatTick', () => {
  it('keeps full numbers under 10k and compacts above', () => {
    expect(formatTick(2500)).toBe((2500).toLocaleString('es')); // Spanish does not group 4-digit numbers
    expect(formatTick(1000)).not.toContain('K');
    expect(formatTick(12900)).toBe('12.9K');
    expect(formatTick(20000)).toBe('20K');
    expect(formatTick(2.5)).toBe((2.5).toLocaleString('es'));
  });
});

describe('nearestIndex', () => {
  it('snaps to the closest evenly spaced point', () => {
    expect(nearestIndex(0, 0, 100, 5)).toBe(0);
    expect(nearestIndex(60, 0, 100, 5)).toBe(2);
    expect(nearestIndex(90, 0, 100, 5)).toBe(4);
    expect(nearestIndex(500, 0, 100, 5)).toBe(4);
    expect(nearestIndex(10, 0, 100, 1)).toBe(0);
  });
});
