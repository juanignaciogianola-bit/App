import { create } from 'zustand';

/** Hand-off from the Food tab to the meal editor: the photo just picked and the day it is for. */
interface MealDraftState {
  picked: { uri: string; width: number; height: number } | null;
  day: Date;
  setPicked: (p: MealDraftState['picked'], day: Date) => void;
  clear: () => void;
}

export const useMealDraft = create<MealDraftState>((set) => ({
  picked: null,
  day: new Date(),
  setPicked: (picked, day) => set({ picked, day }),
  clear: () => set({ picked: null }),
}));
