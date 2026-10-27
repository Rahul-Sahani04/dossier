import "server-only";

import { AiProvider } from "@/generated/prisma/enums";
import { env, type Env } from "@/lib/env";
import { loadSettings } from "@/lib/settings-data";

import { API_KEY_UNREADABLE, ApiKeyUnreadable, apiKeyState, decryptApiKey } from "./api-key";
import type { AiSettingsView, KeyState } from "./provider-options";

// Which provider to use and how to reach it (E6-1): what's saved in Settings,
// or else the DOSSIER_AI_* variables, or else the defaults below.

export type AiConfig = {
  provider: AiProvider;
  baseUrl: string;
  model: string | null;
  /** Optional lower-cost model for scheduled agent work. */
  agentModel: string | null;
  apiKey: string | null;
  /** Why the saved key can't be used, e.g. DOSSIER_SECRET changed. */
  apiKeyProblem: string | null;
  timeoutMs: number;
  /** Total attempts for one provider before a fallback is tried. */
  retryCount: number;
};

export const PROVIDER_DEFAULTS: Record<AiProvider, { baseUrl: string; model: string | null; agentModel: string | null; timeoutSeconds: number }> = {
  // Generous: a local model on a laptop can take minutes for a cover letter.
  [AiProvider.LOCAL]: { baseUrl: "http://localhost:11434", model: null, agentModel: null, timeoutSeconds: 300 },
  [AiProvider.OPENAI]: { baseUrl: "https://api.openai.com/v1", model: null, agentModel: null, timeoutSeconds: 120 },
  [AiProvider.ANTHROPIC]: { baseUrl: "https://api.anthropic.com", model: "claude-sonnet-5", agentModel: null, timeoutSeconds: 120 },
  [AiProvider.MISTRAL]: { baseUrl: "https://api.mistral.ai/v1", model: "mistral-medium-latest", agentModel: null, timeoutSeconds: 120 },
  // As generous as a local model, and loading one can take a while too.
  [AiProvider.LMSTUDIO]: { baseUrl: "http://host.docker.internal:1234", model: null, agentModel: null, timeoutSeconds: 300 },
  [AiProvider.GROQ]: { baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", agentModel: "openai/gpt-oss-120b", timeoutSeconds: 120 },
  [AiProvider.NIM]: { baseUrl: "https://integrate.api.nvidia.com/v1", model: "nvidia/nemotron-3.5-super-vl-120b-a12b", agentModel: "nvidia/nemotron-3.5-super-vl-120b-a12b", timeoutSeconds: 120 },
  [AiProvider.GOOGLE_AI_STUDIO]: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash", agentModel: "gemini-2.5-flash-lite", timeoutSeconds: 120 },
};

const FROM_ENV: Record<NonNullable<Env["DOSSIER_AI_PROVIDER"]>, AiProvider> = {
  local: AiProvider.LOCAL,
  openai: AiProvider.OPENAI,
  anthropic: AiProvider.ANTHROPIC,
  mistral: AiProvider.MISTRAL,
  lmstudio: AiProvider.LMSTUDIO,
  groq: AiProvider.GROQ,
  nim: AiProvider.NIM,
  "google-ai-studio": AiProvider.GOOGLE_AI_STUDIO,
};

type SavedSettings = {
  provider: AiProvider | null;
  baseUrl: string | null;
  model: string | null;
  agentModel?: string | null;
  apiKeyEnc: string | null;
  aiModels?: Record<string, { model: string; agentModel: string }>;
};

type AiEnv = Pick<
  Env,
  | "DOSSIER_AI_PROVIDER"
  | "DOSSIER_AI_URL"
  | "DOSSIER_AI_MODEL"
  | "DOSSIER_AI_AGENT_MODEL"
  | "DOSSIER_AI_KEY"
  | "DOSSIER_AI_TIMEOUT_SECONDS"
  | "DOSSIER_AI_FALLBACKS"
  | "DOSSIER_AI_RETRIES"
  | "DOSSIER_AI_NIM_URL"
  | "DOSSIER_AI_NIM_MODEL"
  | "DOSSIER_AI_NIM_KEY"
  | "DOSSIER_AI_GOOGLE_URL"
  | "DOSSIER_AI_GOOGLE_MODEL"
  | "DOSSIER_AI_GOOGLE_KEY"
>;

/**
 * Settings win once a provider is saved there; until then the environment
 * decides. The two are never mixed, except that an env key still serves a
 * saved provider of the same kind that has no key of its own.
 */
export function resolveAiConfig(saved: SavedSettings | null, source: AiEnv, secret?: string): AiConfig {
  const envProvider = source.DOSSIER_AI_PROVIDER ? FROM_ENV[source.DOSSIER_AI_PROVIDER] : null;
  const useSaved = Boolean(saved?.provider);
  const provider = (useSaved ? saved!.provider : envProvider) ?? AiProvider.LOCAL;
  const defaults = PROVIDER_DEFAULTS[provider];
  const savedModels = useSaved ? saved?.aiModels?.[provider] : undefined;

  let apiKey: string | null = null;
  let apiKeyProblem: string | null = null;
  if (useSaved && saved!.apiKeyEnc) {
    try {
      apiKey = decryptApiKey(saved!.apiKeyEnc, secret);
    } catch (error) {
      if (!(error instanceof ApiKeyUnreadable)) throw error;
      apiKeyProblem = API_KEY_UNREADABLE;
    }
  } else if (!useSaved || envProvider === provider) {
    apiKey = source.DOSSIER_AI_KEY ?? null;
  }

  return {
    provider,
    baseUrl: (useSaved ? saved!.baseUrl : source.DOSSIER_AI_URL) || defaults.baseUrl,
    model: savedModels?.model || (useSaved ? saved!.model : source.DOSSIER_AI_MODEL) || defaults.model,
    agentModel: savedModels?.agentModel || (useSaved ? saved!.agentModel : source.DOSSIER_AI_AGENT_MODEL) || defaults.agentModel,
    apiKey,
    apiKeyProblem,
    timeoutMs: (source.DOSSIER_AI_TIMEOUT_SECONDS ?? defaults.timeoutSeconds) * 1000,
    retryCount: source.DOSSIER_AI_RETRIES ?? 2,
  };
}

/** The AI configuration in effect right now. */
export async function loadAiConfig(): Promise<AiConfig> {
  return resolveAiConfig(await loadSettings(), env);
}

export type AiRole = "primary" | "agent";

/** The provider for interactive work or for the scheduled agent/subtasks. */
export async function loadAiConfigFor(role: AiRole = "primary"): Promise<AiConfig> {
  const config = await loadAiConfig();
  return role === "agent" && config.agentModel ? { ...config, model: config.agentModel } : config;
}

/**
 * Environment-configured fallback providers. Fallback keys are deliberately
 * separate from the selected provider's saved key, so switching never sends
 * one vendor's credential to another vendor.
 */
export function fallbackAiConfigs(primary: AiConfig, source: AiEnv, role: AiRole = "primary", savedModels: Record<string, { model: string; agentModel: string }> = {}): AiConfig[] {
  const requested = source.DOSSIER_AI_FALLBACKS?.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const names = requested?.length ? requested : primary.provider === AiProvider.GROQ ? ["nim", "google-ai-studio"] : [];
  const seen = new Set<AiProvider>([primary.provider]);
  const configs: AiConfig[] = [];
  for (const name of names) {
    const provider = FROM_ENV[name as keyof typeof FROM_ENV];
    if (!provider || seen.has(provider)) continue;
    const defaults = PROVIDER_DEFAULTS[provider];
    const key = provider === AiProvider.NIM ? source.DOSSIER_AI_NIM_KEY : source.DOSSIER_AI_GOOGLE_KEY;
    if (!key) continue;
    const preference = savedModels[provider];
    const model = preference?.model || (provider === AiProvider.NIM ? source.DOSSIER_AI_NIM_MODEL || defaults.model : source.DOSSIER_AI_GOOGLE_MODEL || defaults.model);
    const agentModel = preference?.agentModel || defaults.agentModel;
    seen.add(provider);
    configs.push({
      provider,
      baseUrl: provider === AiProvider.NIM ? source.DOSSIER_AI_NIM_URL || defaults.baseUrl : source.DOSSIER_AI_GOOGLE_URL || defaults.baseUrl,
      model: role === "agent" && agentModel ? agentModel : model,
      agentModel,
      apiKey: key,
      apiKeyProblem: null,
      timeoutMs: primary.timeoutMs,
      retryCount: primary.retryCount,
    });
  }
  return configs;
}

export async function loadAiConfigsFor(role: AiRole = "primary"): Promise<AiConfig[]> {
  const saved = await loadSettings();
  const primaryConfig = resolveAiConfig(saved, env);
  const primary = role === "agent" && primaryConfig.agentModel ? { ...primaryConfig, model: primaryConfig.agentModel } : primaryConfig;
  return [primary, ...fallbackAiConfigs(primary, env, role, saved.aiModels)];
}

/**
 * The AI settings as the settings screen shows them: what's in effect,
 * whether it comes from Settings or DOSSIER_AI_*, and never the key.
 */
export async function loadAiSettingsView(): Promise<AiSettingsView> {
  const saved = await loadSettings();
  const config = resolveAiConfig(saved, env);
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model ?? "",
    agentModel: config.agentModel ?? "",
    providerModels: saved.aiModels ?? {},
    keyState: keyStateOf(saved, config),
  };
}

/** Whether a key is in play for the provider in effect, and where it comes from. */
export function keyStateOf(saved: { provider: AiProvider | null; apiKeyEnc: string | null } | null, config: AiConfig): KeyState {
  if (saved?.provider && saved.apiKeyEnc) return apiKeyState(saved.apiKeyEnc);
  return config.apiKey ? "env" : "none";
}

/** Whether an AI provider has been chosen, in Settings or with DOSSIER_AI_PROVIDER. */
export async function isAiConfigured(): Promise<boolean> {
  if (env.DOSSIER_AI_PROVIDER) return true;
  return Boolean((await loadSettings()).provider);
}

/**
 * Whether Dossier's own AI model can be called: a provider with its model,
 * and a key for the hosted ones that always need one. Without it, and with
 * the Claude connector on, the AI buttons hand the work to Claude chat
 * (src/lib/connector/handoff.ts, #221).
 */
export async function isAiUsable(): Promise<boolean> {
  if (!(await isAiConfigured())) return false;
  const config = await loadAiConfig();
  if (!config.model || config.apiKeyProblem) return false;
  const needsKey = new Set<AiProvider>([AiProvider.ANTHROPIC, AiProvider.MISTRAL, AiProvider.GROQ, AiProvider.NIM, AiProvider.GOOGLE_AI_STUDIO]).has(config.provider);
  return !needsKey || Boolean(config.apiKey);
}
