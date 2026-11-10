# Forma

App de fitness (Expo + Supabase + Claude): tracker de entrenamiento, calorías con foto y análisis de físico.

## Estado

- [x] Etapa 1: auth + onboarding + objetivos de calorías y macros
- [ ] Etapa 2: tracker de entrenamiento + mapa corporal
- [ ] Etapa 3: calorías con foto
- [ ] Etapa 4: análisis de físico

## Puesta en marcha

```bash
npm install
cp .env.example .env          # completar URL y publishable key de Supabase
npx supabase link --project-ref <ref>
npx supabase db push          # aplica supabase/migrations
npx expo start                # abrir en iOS con Expo Go
```

## Tests

| Comando | Qué prueba |
|---|---|
| `npm test` | Unit tests (Jest): cálculo de calorías y macros |
| `npm run test:db` | Migraciones + RLS contra un Postgres local descartable (necesita Postgres 15+ instalado) |
| `npm run typecheck` | TypeScript |
| `npm run e2e` | Flujo registro → onboarding → dashboard en Expo web con Supabase simulado (Playwright) |

## Estructura

```
src/app/            rutas (Expo Router): (auth), onboarding, (tabs)
src/components/     UI compartida (tema oscuro)
src/lib/            supabase, auth, cálculos puros (nutrition.ts)
supabase/migrations SQL con RLS
supabase/tests      tests de base de datos
e2e/                tests end-to-end web
```
