import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface Targets {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export function useCurrentTargets() {
  const [targets, setTargets] = useState<Targets | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase
      .from('current_nutrition_targets')
      .select('kcal, protein_g, carbs_g, fat_g')
      .maybeSingle()
      .then(({ data }) => {
        setTargets(data as Targets | null);
        setLoading(false);
      });
  }, []);
  return { targets, loading };
}
