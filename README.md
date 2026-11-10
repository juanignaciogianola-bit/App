# Forma

App de fitness (Expo + Supabase + Claude): tracker de entrenamiento, calorías con foto y análisis de físico.

## Estado

- [x] Etapa 1: auth + onboarding + objetivos de calorías y macros
- [x] Etapa 2: tracker de entrenamiento (rutinas, sesiones, historial, progresión, mapa corporal)
- [ ] Etapa 3: calorías con foto
- [ ] Etapa 4: análisis de físico

## Desarrollo local (recomendado)

Necesita Docker.

```bash
npm install
npx supabase start            # Postgres, Auth, Storage, Edge Functions locales; aplica las migraciones
cp .env.example .env.local    # usar la URL y la publishable key que imprime `supabase start`
npx expo start                # i = simulador iOS, o escanear el QR con Expo Go
```

En un iPhone físico, reemplazá `127.0.0.1` por la IP de tu computadora en `.env.local`.

## Producción

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

y en `.env` la URL y publishable key del proyecto.

## Tests

| Comando | Qué prueba |
|---|---|
| `npm test` | Unit tests (Jest): calorías/macros, volumen, 1RM, store del entrenamiento activo |
| `npm run test:db` | Migraciones + RLS contra un Postgres descartable (no necesita Docker) |
| `npm run test:db:local` | Los mismos tests contra el Supabase local (`supabase start`) |
| `npm run typecheck` | TypeScript |
| `npm run e2e` | Flujos completos en Expo web contra el Supabase local (Playwright) |

## Estructura

```
src/app/(auth)        login / registro
src/app/onboarding    onboarding en 7 pasos
src/app/(app)/(tabs)  Hoy, Entrenar, Comida, Físico
src/app/(app)/...     rutina, entrenamiento activo, historial, progreso, selector de ejercicios
src/components/       UI (tema oscuro), mapa corporal SVG, gráfico
src/lib/              supabase, auth, api (TanStack Query), lógica pura testeada
supabase/migrations   esquema + RLS + RPCs
supabase/tests        tests SQL
e2e/                  tests end-to-end web
```

## Cómo se calcula el volumen por músculo

Cada serie completada suma 1 a los músculos principales del ejercicio y 0,5 a los secundarios.
El total semanal (lunes a domingo, hora local) se compara con un rango según la experiencia:
principiante 6–10, intermedio 10–16, avanzado 12–20 series.
