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

export class LLMValidationError extends Error {
  constructor(appel: AppelLLM, lastError: string) {
    super(`Échec de validation pour l'appel "${appel}" après retries : ${lastError}`);
  }
}

function loadPrompt(appel: AppelLLM, promptVersion: string): string {
  const file = path.join(process.cwd(), "prompts", `${appel}.${promptVersion}.md`);
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
  schema: z.ZodType<T>;
  context: object;
  /** Vérification métier post-zod (ex. couverture des gras) — même boucle de retry que le schéma. */
  validate?: (data: T) => string | null;
  maxRetries?: number;
}

export async function callLLM<T>(options: CallLLMOptions<T>): Promise<T> {
  const { appel, promptVersion, schema, context, validate, maxRetries = MAX_RETRIES_DEFAULT } = options;
  const promptText = loadPrompt(appel, promptVersion);
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

type FetchResult<T> =
  | { ok: true; data: T; inputTokens: number; outputTokens: number }
  | { ok: false; error: string; infra: boolean; inputTokens: number; outputTokens: number };

async function fetchAndValidate<T>(
  model: string,
  messages: { role: string; content: string }[],
  schema: z.ZodType<T>,
  validate?: (data: T) => string | null,
): Promise<FetchResult<T>> {
  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages }),
    });
  } catch (err) {
    return { ok: false, error: `échec réseau : ${(err as Error).message}`, infra: true, inputTokens: 0, outputTokens: 0 };
  }

  const raw = await response.json().catch(() => null);
  const inputTokens = raw?.usage?.prompt_tokens ?? 0;
  const outputTokens = raw?.usage?.completion_tokens ?? 0;

  if (response.ok === false) {
    const message = raw?.error?.message ?? `HTTP ${response.status}`;
    return { ok: false, error: `échec OpenRouter : ${message}`, infra: true, inputTokens, outputTokens };
  }

  const result = parseAndValidate(raw, schema, validate);
  return result.ok
    ? { ok: true, data: result.data, inputTokens, outputTokens }
    : { ok: false, error: result.error, infra: false, inputTokens, outputTokens };
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
