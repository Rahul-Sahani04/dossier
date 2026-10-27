import "server-only";

import { AiProvider } from "@/generated/prisma/enums";

import { loadAiConfigsFor, type AiConfig, type AiRole } from "./config";
import { AiError } from "./errors";
import { providerOption } from "./provider-options";
import type { AIProvider } from "./provider";
import { AnthropicProvider } from "./providers/anthropic";
import { LocalProvider } from "./providers/local";
import { LmStudioProvider } from "./providers/lmstudio";
import { MistralProvider } from "./providers/mistral";
import { OpenAICompatibleProvider } from "./providers/openai-compatible";
import { FallbackProvider } from "./providers/fallback";

export { AiError } from "./errors";
export type { AIProvider, ChatMessage, CompletionRequest, JsonCompletionRequest } from "./provider";

/** A provider for `config`. A saved key that can't be read stops hosted providers with a clear message. */
export function createProvider(config: AiConfig): AIProvider {
  const { provider, baseUrl, model, apiKey, apiKeyProblem, timeoutMs, retryCount } = config;
  if (apiKeyProblem && providerOption(provider).apiKey) throw AiError.config(apiKeyProblem);
  switch (provider) {
    case AiProvider.LOCAL:
      return new LocalProvider(baseUrl, model, timeoutMs, retryCount);
    case AiProvider.OPENAI:
      return new OpenAICompatibleProvider("OPENAI", baseUrl, apiKey, model, timeoutMs, retryCount);
    case AiProvider.GROQ:
      return new OpenAICompatibleProvider("GROQ", baseUrl, apiKey, model, timeoutMs, retryCount);
    case AiProvider.NIM:
      return new OpenAICompatibleProvider("NIM", baseUrl, apiKey, model, timeoutMs, retryCount);
    case AiProvider.GOOGLE_AI_STUDIO:
      return new OpenAICompatibleProvider("GOOGLE_AI_STUDIO", baseUrl, apiKey, model, timeoutMs, retryCount);
    case AiProvider.ANTHROPIC:
      return new AnthropicProvider(baseUrl, apiKey, model, timeoutMs, retryCount);
    case AiProvider.MISTRAL:
      return new MistralProvider(baseUrl, apiKey, model, timeoutMs, retryCount);
    case AiProvider.LMSTUDIO:
      return new LmStudioProvider(baseUrl, apiKey, model, timeoutMs, retryCount);
  }
}

/** The provider configured in Settings, or by the DOSSIER_AI_* variables. */
export async function getAiProvider(role: AiRole = "primary"): Promise<AIProvider> {
  const configs = await loadAiConfigsFor(role);
  const providers: AIProvider[] = [];
  let firstError: unknown;
  for (const config of configs) {
    try {
      providers.push(createProvider(config));
    } catch (error) {
      firstError ??= error;
    }
  }
  if (providers.length === 0 && firstError) throw firstError;
  return providers.length === 1 ? providers[0] : new FallbackProvider(providers);
}
