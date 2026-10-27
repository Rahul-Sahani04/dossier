import "server-only";

import { AiError } from "../errors";
import type { AIProvider, CompletionRequest, JsonCompletionRequest } from "../provider";

/** Tries configured providers in order after each provider exhausts its retries. */
export class FallbackProvider implements AIProvider {
  readonly kind = "FALLBACK" as const;
  readonly model: string | null;

  constructor(private readonly providers: AIProvider[]) {
    this.model = providers[0]?.model ?? null;
  }

  complete(request: CompletionRequest): Promise<string>;
  complete<T>(request: JsonCompletionRequest<T>): Promise<T>;
  async complete<T>(request: CompletionRequest | JsonCompletionRequest<T>): Promise<string | T> {
    let last: unknown;
    for (const provider of this.providers) {
      try {
        return await provider.complete(request as never);
      } catch (error) {
        last = error;
        if (!(error instanceof AiError) || !error.retryable) throw error;
      }
    }
    throw last ?? AiError.of("provider");
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    return this.providers[0]?.listModels(signal) ?? [];
  }

  async test(signal?: AbortSignal): Promise<{ model: string; latencyMs: number }> {
    let last: unknown;
    for (const provider of this.providers) {
      try {
        return await provider.test(signal);
      } catch (error) {
        last = error;
        if (!(error instanceof AiError) || !error.retryable) throw error;
      }
    }
    throw last ?? AiError.of("provider");
  }
}
