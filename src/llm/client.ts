import { readFileSync } from "node:fs";
import path from "node:path";
import type { z } from "zod";
import { db } from "@/db";
import { promptLog } from "@/db/schema";
import { resolveModel, type AppelLLM } from "./models";

// L0 · callLLM (FUNCTIONS §2, TECH_MAPPING §2) — unique point d'accès à OpenRouter.
// Charge le prompt versionné, appelle, valide Zod, retry avec réinjection d'erreur
// (schéma ET métier via `validate` — même besoin documenté pour L1 bornes/L2 couverture),
// journalise chaque tentative dans PromptLog. Clé API strictement serveur.

const MAX_RETRIES_DEFAULT = 2;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// ponytail: sans timeout, un OpenRouter qui ne répond pas bloque la requête
// jusqu'à la limite de la fonction Vercel (5 min) au lieu d'échouer vite —
// `after()`/lazyScheduler (S3, page d'accueil) dépend de cet appel à chaque connexion.
const LLM_FETCH_TIMEOUT_MS = 30_000;

export class LLMValidationError extends Error {
  constructor(appel: AppelLLM, lastError: string) {
    super(`Échec de validation pour l'appel "${appel}" après retries : ${lastError}`);
  }
}

// `fileStem` par défaut = `appel` (un fichier par appel) ; certains appels (L4/L5,
// Bloc 7.2) partagent le même `appel` PromptLog/modèle mais ont des prompts trop
// différents (texte streamé vs JSON) pour un seul fichier — `promptFile` permet
// de charger `feynman_turn.v1.md`/`feynman_bilan.v1.md` sous `appel: "feynman"`.
function loadPrompt(fileStem: string, promptVersion: string): string {
  const file = path.join(process.cwd(), "prompts", `${fileStem}.${promptVersion}.md`);
  return readFileSync(file, "utf-8");
}

// Le prompt embarque ses variables en `{{cle}}` (documenté dans sa méta d'en-tête) ;
// le ContextBuilder de l'appel fournit un objet dont les clés matchent ces placeholders.
function renderTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in context ? formatTemplateValue(context[key]) : match,
  );
}

function formatTemplateValue(value: unknown): string {
  if (value === null || value === undefined) return "(aucun)";
  if (Array.isArray(value)) {
    if (value.length === 0) return "(aucun)";
    return value.map((item, i) => `${i + 1}. ${formatTemplateItem(item)}`).join("\n");
  }
  return String(value);
}

function formatTemplateItem(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object" && "type" in item && "description" in item) {
    const { type, description } = item as { type: unknown; description: unknown };
    return `[${type}] ${description}`;
  }
  return JSON.stringify(item);
}

interface CallLLMOptions<T> {
  appel: AppelLLM;
  promptVersion: string;
  /** Fichier de prompt à charger si différent de `appel` (ex. "feynman_bilan"). */
  promptFile?: string;
  schema: z.ZodType<T>;
  context: object;
  /** Vérification métier post-zod (ex. couverture des gras) — même boucle de retry que le schéma. */
  validate?: (data: T) => string | null;
  maxRetries?: number;
}

export async function callLLM<T>(options: CallLLMOptions<T>): Promise<T> {
  const { appel, promptVersion, promptFile, schema, context, validate, maxRetries = MAX_RETRIES_DEFAULT } = options;
  const promptText = loadPrompt(promptFile ?? appel, promptVersion);
  const model = resolveModel(appel);

  let lastError = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    const rendered = renderTemplate(promptText, context as Record<string, unknown>);
    const content = lastError
      ? `${rendered}\n\n---\nErreur de la tentative précédente, à corriger : ${lastError}`
      : rendered;
    const messages = [{ role: "user", content }];

    const result = await fetchAndValidate(model, messages, schema, validate);
    const dureeMs = Date.now() - start;
    const isLastAttempt = attempt === maxRetries;

    await db.insert(promptLog).values({
      appel,
      promptVersion,
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      dureeMs,
      statut: result.ok ? "ok" : isLastAttempt ? "echec" : "retry",
    });

    if (result.ok) return result.data;
    // une panne réseau/HTTP n'est pas la faute du modèle : rien à "corriger" dans le prompt,
    // on retente la même requête au lieu de réinjecter une erreur qui n'a pas de sens pour lui.
    if (!result.infra) lastError = result.error;
    if (isLastAttempt) throw new LLMValidationError(appel, result.error);
  }
  throw new LLMValidationError(appel, lastError);
}

interface CallTranscriptionOptions {
  promptVersion: string;
  context: object;
  /** Audio encodé en base64 — jamais persisté (ni ici ni par l'appelant, PLAN Bloc 7.1). */
  audioBase64: string;
  audioFormat: string;
  maxRetries?: number;
}

// Sortie texte libre (pas de schéma Zod) : forme de requête (content multimodal
// input_audio) et de réponse trop différentes de callLLM pour partager sa boucle
// de retry sans la forcer — voir postChatCompletion pour la partie commune (HTTP).
export async function callTranscription(options: CallTranscriptionOptions): Promise<string> {
  const { promptVersion, context, audioBase64, audioFormat, maxRetries = MAX_RETRIES_DEFAULT } = options;
  const appel: AppelLLM = "transcription";
  const promptText = loadPrompt(appel, promptVersion);
  const model = resolveModel(appel);
  const rendered = renderTemplate(promptText, context as Record<string, unknown>);
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: rendered },
        { type: "input_audio", input_audio: { data: audioBase64, format: audioFormat } },
      ],
    },
  ];

  let lastError = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    const posted = await postChatCompletion(model, messages);
    const outcome = posted.ok ? extractTranscript(posted.raw) : { ok: false as const, error: posted.error };
    const dureeMs = Date.now() - start;
    const isLastAttempt = attempt === maxRetries;

    await db.insert(promptLog).values({
      appel,
      promptVersion,
      model,
      inputTokens: posted.ok ? posted.inputTokens : 0,
      outputTokens: posted.ok ? posted.outputTokens : 0,
      dureeMs,
      statut: outcome.ok ? "ok" : isLastAttempt ? "echec" : "retry",
    });

    if (outcome.ok) return outcome.text;
    lastError = outcome.error;
    if (isLastAttempt) throw new LLMValidationError(appel, lastError);
  }
  throw new LLMValidationError(appel, lastError);
}

function extractTranscript(raw: unknown): { ok: true; text: string } | { ok: false; error: string } {
  const content = (raw as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content;
  const trimmed = content?.trim();
  if (!trimmed) return { ok: false, error: "transcript vide" };
  return { ok: true, text: trimmed };
}

interface StreamCompletionOptions {
  appel: AppelLLM;
  promptVersion: string;
  promptFile?: string;
  context: object;
}

// L4 (relance Feynman, Bloc 7.2) : texte libre streamé token par token — pas de
// retry avec réinjection (rien à "corriger" dans un texte déjà partiellement
// affiché à l'utilisateur, contrairement au schéma JSON de callLLM) : un échec
// se propage tel quel, l'UI porte son propre [Réessayer] (USER_FLOW règle 7).
export async function* streamCompletion(options: StreamCompletionOptions): AsyncGenerator<string> {
  const { appel, promptVersion, promptFile, context } = options;
  const promptText = loadPrompt(promptFile ?? appel, promptVersion);
  const model = resolveModel(appel);
  const rendered = renderTemplate(promptText, context as Record<string, unknown>);
  const messages = [{ role: "user", content: rendered }];
  const start = Date.now();

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, stream: true, stream_options: { include_usage: true } }),
      signal: AbortSignal.timeout(LLM_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    await logStreamAttempt(appel, promptVersion, model, 0, 0, Date.now() - start, "echec");
    throw new LLMValidationError(appel, `échec réseau : ${(err as Error).message}`);
  }

  if (!response.ok || !response.body) {
    const raw = await response.json().catch(() => null);
    const message = (raw as { error?: { message?: string } })?.error?.message ?? `HTTP ${response.status}`;
    await logStreamAttempt(appel, promptVersion, model, 0, 0, Date.now() - start, "echec");
    throw new LLMValidationError(appel, `échec OpenRouter : ${message}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let received = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      const chunk = JSON.parse(data) as {
        choices?: { delta?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        received = true;
        yield delta;
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? 0;
        outputTokens = chunk.usage.completion_tokens ?? 0;
      }
    }
  }

  await logStreamAttempt(appel, promptVersion, model, inputTokens, outputTokens, Date.now() - start, received ? "ok" : "echec");
  if (!received) throw new LLMValidationError(appel, "réponse vide (streaming)");
}

async function logStreamAttempt(
  appel: AppelLLM,
  promptVersion: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  dureeMs: number,
  statut: "ok" | "echec",
) {
  await db.insert(promptLog).values({ appel, promptVersion, model, inputTokens, outputTokens, dureeMs, statut });
}

type FetchResult<T> =
  | { ok: true; data: T; inputTokens: number; outputTokens: number }
  | { ok: false; error: string; infra: boolean; inputTokens: number; outputTokens: number };

type PostResult =
  | { ok: true; raw: unknown; inputTokens: number; outputTokens: number }
  | { ok: false; error: string; infra: boolean; inputTokens: number; outputTokens: number };

async function postChatCompletion(model: string, messages: unknown[]): Promise<PostResult> {
  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages }),
      signal: AbortSignal.timeout(LLM_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, error: `échec réseau : ${(err as Error).message}`, infra: true, inputTokens: 0, outputTokens: 0 };
  }

  const raw = await response.json().catch(() => null);
  const inputTokens = (raw as { usage?: { prompt_tokens?: number } })?.usage?.prompt_tokens ?? 0;
  const outputTokens = (raw as { usage?: { completion_tokens?: number } })?.usage?.completion_tokens ?? 0;

  if (response.ok === false) {
    const message = (raw as { error?: { message?: string } })?.error?.message ?? `HTTP ${response.status}`;
    return { ok: false, error: `échec OpenRouter : ${message}`, infra: true, inputTokens, outputTokens };
  }

  return { ok: true, raw, inputTokens, outputTokens };
}

async function fetchAndValidate<T>(
  model: string,
  messages: { role: string; content: string }[],
  schema: z.ZodType<T>,
  validate?: (data: T) => string | null,
): Promise<FetchResult<T>> {
  const posted = await postChatCompletion(model, messages);
  if (!posted.ok) return posted;

  const result = parseAndValidate(posted.raw, schema, validate);
  return result.ok
    ? { ok: true, data: result.data, inputTokens: posted.inputTokens, outputTokens: posted.outputTokens }
    : { ok: false, error: result.error, infra: false, inputTokens: posted.inputTokens, outputTokens: posted.outputTokens };
}

function parseAndValidate<T>(
  raw: unknown,
  schema: z.ZodType<T>,
  validate?: (data: T) => string | null,
): { ok: true; data: T } | { ok: false; error: string } {
  const content = (raw as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content;
  // ponytail: certains modèles ajoutent des balises ```json malgré la consigne — dépouillage défensif
  const stripped = content?.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  let json: unknown;
  try {
    json = JSON.parse(stripped ?? "");
  } catch {
    return { ok: false, error: "réponse non-JSON du modèle" };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  const businessError = validate?.(parsed.data) ?? null;
  if (businessError) {
    return { ok: false, error: businessError };
  }

  return { ok: true, data: parsed.data };
}
