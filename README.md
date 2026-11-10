# Forma

App de fitness (Expo + Supabase + Claude): tracker de entrenamiento, calorías con foto y análisis de físico.

## Estado

- [x] Etapa 1: auth + onboarding + objetivos de calorías y macros
- [x] Etapa 2: tracker de entrenamiento (rutinas, sesiones, historial, progresión, mapa corporal)
- [x] Etapa 3: calorías con foto (estimación con Claude, edición, registro diario)
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

Para que el análisis de fotos funcione en local, copiá `supabase/functions/.env.example` a
`supabase/functions/.env` y poné tu `ANTHROPIC_API_KEY` (o apuntá `ANTHROPIC_BASE_URL` al mock).

## Producción

```bash
npx supabase link --project-ref <ref>
npx supabase db push
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy analyze-meal
```

y en `.env` la URL y publishable key del proyecto. La API key de Claude vive solo como secret de
Supabase: la app nunca la ve.

## Tests

| Comando | Qué prueba |
|---|---|
| `npm test` | Unit tests (Jest): calorías/macros, volumen, 1RM, store del entrenamiento activo |
| `npm run test:db` | Migraciones + RLS contra un Postgres descartable (no necesita Docker) |
| `npm run test:db:local` | Los mismos tests contra el Supabase local (`supabase start`) |
| `npm run typecheck` | TypeScript |
| `npm run typecheck:functions` | Typecheck de las Edge Functions con Deno |
| `npm run test:functions` | Edge Function `analyze-meal` contra el Supabase local + mock de Claude |
| `npm run e2e` | Flujos completos en Expo web contra el Supabase local + mock de Claude (Playwright) |

Los tests de funciones y E2E necesitan `npm run mock:anthropic` corriendo, para no gastar créditos.

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

## IA

- Las fotos se suben a buckets privados (`meal-photos`, `physique-photos`) bajo `<user id>/`.
- La Edge Function valida la sesión, que la ruta sea del usuario y un límite diario por usuario,
  descarga la foto con el token del usuario (RLS) y llama a Claude con salida estructurada (JSON Schema).
- Cada llamada queda en `ai_requests` (modelo, tokens, ok) para límites y costos.
- Modelo por defecto `claude-opus-5-5`; se cambia con `MEAL_MODEL` sin tocar código.
