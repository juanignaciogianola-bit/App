import { dayBounds, itemIsValid, mealTypeForHour, rescaleItem, sumItems, toSavePayload, type EditableItem } from '../mealMath';

const item = (p: Partial<EditableItem> = {}): EditableItem => ({
  key: 'k', name: 'Puré', grams: '200', kcal: '220', protein_g: '4', carbs_g: '30', fat_g: '9', edited: false, ...p,
});

describe('meal math', () => {
  it('rescales kcal and macros when the portion changes', () => {
    expect(rescaleItem(item(), '100')).toMatchObject({ grams: '100', kcal: '110', protein_g: '2', carbs_g: '15', fat_g: '4.5', edited: true });
    expect(rescaleItem(item(), '300').kcal).toBe('330');
  });
  it('does not rescale when the original portion is unknown', () => {
    expect(rescaleItem(item({ grams: '' }), '100')).toMatchObject({ grams: '100', kcal: '220' });
  });
  it('accepts comma decimals and sums items', () => {
    expect(sumItems([item(), item({ kcal: '100,4', protein_g: '10' })])).toEqual({ kcal: 320, protein_g: 14, carbs_g: 60, fat_g: 18 });
  });
  it('validates items', () => {
    expect(itemIsValid(item())).toBe(true);
    expect(itemIsValid(item({ name: ' ' }))).toBe(false);
    expect(itemIsValid(item({ kcal: 'abc' }))).toBe(false);
    expect(itemIsValid(item({ grams: '' }))).toBe(true);
  });
  it('builds the RPC payload with null grams when blank', () => {
    expect(toSavePayload([item({ grams: '', name: ' Yogur ' })])[0]).toEqual({ name: 'Yogur', grams: null, kcal: 220, protein_g: 4, carbs_g: 30, fat_g: 9, edited: false });
  });
  it('picks a meal type from the hour', () => {
    expect([7, 13, 17, 22, 2].map(mealTypeForHour)).toEqual(['breakfast', 'lunch', 'snack', 'dinner', 'dinner']);
  });
  it('computes local day bounds', () => {
    const { from, to } = dayBounds(new Date(2026, 10, 10, 15, 30));
    expect([from.getDate(), from.getHours(), to.getDate()]).toEqual([10, 0, 11]);
  });
});
