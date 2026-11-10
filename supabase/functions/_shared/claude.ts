import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { HttpError } from './http.ts';

export const DEFAULT_MODEL = 'claude-opus-5-5';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    // ANTHROPIC_BASE_URL is only set in local tests (mock server).
    client = new Anthropic({ apiKey, baseURL: Deno.env.get('ANTHROPIC_BASE_URL') || undefined, maxRetries: 2 });
  }
  return client;
}

export interface ImageInput {
  bytes: Uint8Array;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  label?: string;
}

export interface StructuredResult {
  data: unknown;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * One vision request with a JSON-schema constrained answer.
 * Server-side refusal fallback is on; a refusal of the whole chain becomes a 422.
 */
export async function analyzeImages(opts: {
  model?: string;
  effort: 'low' | 'medium' | 'high';
  system: string;
  images: ImageInput[];
  text: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<StructuredResult> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const img of opts.images) {
    if (img.label) content.push({ type: 'text', text: img.label });
    content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: encodeBase64(img.bytes) } });
  }
  content.push({ type: 'text', text: opts.text });

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await getClient().beta.messages.create({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: opts.system,
      output_config: { effort: opts.effort, format: { type: 'json_schema', schema: opts.schema } },
      messages: [{ role: 'user', content }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(503, 'ai_busy', 'El servicio de IA está saturado. Probá en un minuto.');
    if (e instanceof Anthropic.APIError) {
      console.error('Claude API error', e.status, e.message);
      throw new HttpError(502, 'ai_error', 'No se pudo analizar la imagen. Intentá de nuevo.');
    }
    throw e;
  }

  if (response.stop_reason === 'refusal') {
    throw new HttpError(422, 'ai_refused', 'La IA no pudo analizar esta foto. Probá con otra.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new HttpError(502, 'ai_truncated', 'La respuesta de la IA quedó incompleta. Intentá de nuevo.');
  }
  const textBlock = [...response.content].reverse().find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') throw new HttpError(502, 'ai_empty', 'La IA no devolvió resultado.');
  let data: unknown;
  try {
    data = JSON.parse(textBlock.text);
  } catch {
    throw new HttpError(502, 'ai_bad_json', 'La IA devolvió un resultado inválido.');
  }
  return {
    data,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
