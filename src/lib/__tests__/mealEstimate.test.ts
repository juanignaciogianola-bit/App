import { isOwnPhotoPath, mediaTypeFor, normalizeMealEstimate } from '../../../supabase/functions/_shared/meal';

const UID = '3f0d2c1e-9b8a-4c7d-8e6f-5a4b3c2d1e0f';

describe('normalizeMealEstimate', () => {
  it('keeps a well-formed estimate and rounds numbers', () => {
    const e = normalizeMealEstimate({
      is_food: true,
      meal_name: 'Milanesa con puré',
      items: [{ name: 'Milanesa', grams: 180.04, kcal: 450.26, protein_g: 35, carbs_g: 20, fat_g: 25 }],
      confidence: 'medium',
      notes: '',
    });
    expect(e.items[0]).toEqual({ name: 'Milanesa', grams: 180, kcal: 450.3, protein_g: 35, carbs_g: 20, fat_g: 25 });
    expect(e.is_food).toBe(true);
  });

  it('clamps negative or absurd values into database ranges', () => {
    const e = normalizeMealEstimate({
      is_food: true, meal_name: 'x', confidence: 'high', notes: '',
      items: [{ name: 'Torta', grams: -5, kcal: 99999, protein_g: NaN, carbs_g: 'a', fat_g: 2000 }],
    });
    expect(e.items[0]).toMatchObject({ grams: 0, kcal: 10000, protein_g: 0, carbs_g: 0, fat_g: 1000 });
  });

  it('drops nameless items and treats an empty list as not food', () => {
    const e = normalizeMealEstimate({ is_food: true, meal_name: '', items: [{ name: '  ', kcal: 10 }], confidence: 'high', notes: '' });
    expect(e.is_food).toBe(false);
    expect(e.items).toEqual([]);
  });

  it('defaults unknown confidence to low and fills the meal name', () => {
    const e = normalizeMealEstimate({ is_food: true, meal_name: '', items: [{ name: 'Banana', grams: 120, kcal: 105, protein_g: 1, carbs_g: 27, fat_g: 0 }], confidence: 'sure', notes: 5 });
    expect(e.confidence).toBe('low');
    expect(e.meal_name).toBe('Banana');
    expect(e.notes).toBe('');
  });

  it('rejects malformed output', () => {
    expect(() => normalizeMealEstimate(null)).toThrow();
    expect(() => normalizeMealEstimate({ items: 'nope' })).toThrow();
  });
});

describe('photo path checks', () => {
  it('only accepts files inside the caller\'s folder', () => {
    expect(isOwnPhotoPath(`${UID}/abc-123.jpg`, UID)).toBe(true);
    expect(isOwnPhotoPath(`${UID}/../other/x.jpg`, UID)).toBe(false);
    expect(isOwnPhotoPath(`aaaaaaaa-9b8a-4c7d-8e6f-5a4b3c2d1e0f/x.jpg`, UID)).toBe(false);
    expect(isOwnPhotoPath(`${UID}/x.gif`, UID)).toBe(false);
    expect(isOwnPhotoPath(undefined, UID)).toBe(false);
  });
  it('maps extensions to media types', () => {
    expect(mediaTypeFor('a/b.png')).toBe('image/png');
    expect(mediaTypeFor('a/b.jpeg')).toBe('image/jpeg');
  });
});
