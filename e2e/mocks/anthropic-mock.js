// Minimal stand-in for POST /v1/messages used by local E2E tests, so the edge
// functions run their real code path without spending API credits.
// The last request body is saved to $MOCK_LOG for assertions.
const http = require('http');
const fs = require('fs');
const PORT = Number(process.env.MOCK_PORT || 4010);
const LOG = process.env.MOCK_LOG || '/tmp/anthropic-mock-last.json';

const responders = [];
function register(fn) { responders.push(fn); }

function message(model, obj) {
  return {
    id: 'msg_mock', type: 'message', role: 'assistant', model,
    content: [{ type: 'text', text: JSON.stringify(obj) }],
    stop_reason: 'end_turn', stop_sequence: null,
    usage: { input_tokens: 1234, output_tokens: 321 },
  };
}

http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) { res.writeHead(404); return res.end(); }
    const body = JSON.parse(raw);
    const summary = {
      headers: { 'anthropic-beta': req.headers['anthropic-beta'], 'x-api-key': req.headers['x-api-key'] ? 'set' : 'missing' },
      model: body.model, fallbacks: body.fallbacks, output_config: body.output_config, system: body.system,
      images: body.messages[0].content.filter((b) => b.type === 'image').map((b) => ({ media_type: b.source.media_type, bytes: Buffer.from(b.source.data, 'base64').length })),
      texts: body.messages[0].content.filter((b) => b.type === 'text').map((b) => b.text),
    };
    fs.writeFileSync(LOG, JSON.stringify(summary, null, 1));
    for (const r of responders) {
      const out = r(body, summary);
      if (out) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(message(body.model, out))); }
    }
    res.writeHead(500); res.end('{"type":"error","error":{"type":"api_error","message":"no mock"}}');
  });
}).listen(PORT, () => console.log(`anthropic mock on :${PORT}`));

// Meal estimation
register((body, s) => {
  if (!String(s.system).includes('nutrition estimator')) return null;
  if (s.texts.some((t) => t.includes('NOFOOD'))) return { is_food: false, meal_name: '', items: [], confidence: 'low', notes: 'La foto no muestra comida.' };
  return {
    is_food: true, meal_name: 'Milanesa con puré', confidence: 'medium', notes: 'Asumí milanesa frita en aceite.',
    items: [
      { name: 'Milanesa de carne', grams: 180, kcal: 450, protein_g: 35, carbs_g: 20, fat_g: 25 },
      { name: 'Puré de papa', grams: 200, kcal: 220, protein_g: 4, carbs_g: 30, fat_g: 9 },
    ],
  };
});

// Physique analysis. A tiny third photo (< 2 KB) simulates an unusable photo set.
register((body, s) => {
  if (!String(s.system).includes('physique coach')) return null;
  if (s.images.length !== 3) throw new Error('expected 3 photos');
  if (s.images[2].bytes < 2000) {
    return { can_analyze: false, reason_if_not: 'La foto de perfil no muestra el físico con claridad.', summary: '', strengths: [], lagging: [], imbalances: [], routine_suggestions: [], diet_suggestions: [] };
  }
  return {
    can_analyze: true, reason_if_not: '',
    summary: 'Tren superior bien desarrollado; gemelos y deltoides laterales van por detrás. Prioridad: sumar volumen de gemelos.',
    strengths: [{ muscle_id: 'chest', note: 'Pecho con buen volumen' }, { muscle_id: 'lats', note: 'Dorsales anchos' }],
    lagging: [
      { muscle_id: 'calves', severity: 'marked', note: 'Gemelos chicos y 0 series semanales' },
      { muscle_id: 'side_delts', severity: 'moderate', note: 'Hombros estrechos respecto de la espalda' },
    ],
    imbalances: [{ note: 'Tren superior más desarrollado que el inferior', muscles: ['quads', 'calves'] }],
    routine_suggestions: [
      { muscle_id: 'calves', exercise_slug: 'standing_calf_raise', sets: 4, rep_min: 10, rep_max: 15, reason: 'Hoy no entrenás gemelos' },
      { muscle_id: 'calves', exercise_slug: 'seated_calf_raise', sets: 3, rep_min: 12, rep_max: 20, reason: 'Sóleo' },
      { muscle_id: 'side_delts', exercise_slug: 'cable_lateral_raise', sets: 3, rep_min: 12, rep_max: 20, reason: 'Más tensión en el rango corto' },
    ],
    diet_suggestions: [{ title: 'Proteína', detail: 'Llegá a 160 g por día repartidos en 4 comidas.' }, { title: 'Superávit leve', detail: 'Mantené +250 kcal sobre mantenimiento.' }],
  };
});

module.exports = { register };
