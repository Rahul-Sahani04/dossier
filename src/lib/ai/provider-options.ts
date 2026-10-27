import { AiProvider } from "@/generated/prisma/enums";

/** The provider cards in Settings → AI provider (SET-1), as in the prototype's `PROVIDERS`. */
export const PROVIDER_OPTIONS: readonly {
  value: AiProvider;
  name: string;
  /** Who receives the data, for the privacy notes; null when it's whoever runs the server. */
  vendor: string | null;
  description: string;
  tag: string;
  /** Runs on the user's own hardware: no notes about data leaving, and one AI job at a time. */
  local: boolean;
  /** Filled in when the card is picked; empty means "type your server's address". */
  defaultUrl: string;
  urlPlaceholder: string;
  /** Shown under the address. */
  urlHint?: string;
  defaultModel: string;
  /** A cheaper default for the scheduled agent and its subtasks, when available. */
  defaultAgentModel?: string;
  /** The key field, if the card has one; `hint` says when it's needed. */
  apiKey: { label: string; hint?: string } | null;
}[] = [
  {
    value: AiProvider.LOCAL,
    name: "Local model",
    vendor: null,
    description: "Runs on your own hardware through Ollama or llama.cpp.",
    tag: "Private · free · slower",
    local: true,
    defaultUrl: "http://localhost:11434",
    urlPlaceholder: "http://localhost:11434",
    urlHint:
      "Dossier in Docker? There, localhost is Dossier's own container: use http://host.docker.internal:11434 for Ollama on this computer, or http://ollama:11434 for the Compose service.",
    defaultModel: "",
    apiKey: null,
  },
  {
    value: AiProvider.LMSTUDIO,
    name: "LM Studio",
    vendor: null,
    description: "Models you run in LM Studio, on this computer or your network.",
    tag: "Private · free · your hardware",
    local: true,
    // Dossier runs in Docker, where localhost is its own container.
    defaultUrl: "http://host.docker.internal:1234",
    urlPlaceholder: "http://host.docker.internal:1234",
    urlHint:
      "That's LM Studio on the computer Dossier's Docker runs on; without Docker, use http://localhost:1234. Can't connect? Start the server in LM Studio's Developer tab, and turn on Serve on Local Network there.",
    defaultModel: "",
    apiKey: { label: "API token", hint: "Only needed if you've turned on authentication in LM Studio's server settings." },
  },
  {
    value: AiProvider.OPENAI,
    name: "OpenAI-compatible",
    vendor: null,
    description: "Any server that speaks the OpenAI API, hosted or on your network.",
    tag: "Bring your own endpoint",
    local: false,
    defaultUrl: "",
    urlPlaceholder: "https://api.openai.com/v1",
    defaultModel: "",
    apiKey: { label: "API key" },
  },
  {
    value: AiProvider.ANTHROPIC,
    name: "Anthropic",
    vendor: "Anthropic",
    description: "Claude models through your own API key.",
    tag: "Hosted · pay per use",
    local: false,
    defaultUrl: "https://api.anthropic.com",
    urlPlaceholder: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-5",
    apiKey: { label: "API key" },
  },
  {
    value: AiProvider.MISTRAL,
    name: "Mistral",
    vendor: "Mistral",
    description: "Mistral's models through your own API key.",
    tag: "Hosted · free tier to start",
    local: false,
    defaultUrl: "https://api.mistral.ai/v1",
    urlPlaceholder: "https://api.mistral.ai/v1",
    defaultModel: "mistral-medium-latest",
    apiKey: { label: "API key" },
  },
  {
    value: AiProvider.GROQ,
    name: "Groq",
    vendor: "Groq",
    description: "Fast OpenAI-compatible models through Groq's API.",
    tag: "Hosted · rate-limited",
    local: false,
    defaultUrl: "https://api.groq.com/openai/v1",
    urlPlaceholder: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-120b",
    defaultAgentModel: "openai/gpt-oss-20b",
    apiKey: { label: "API key" },
  },
  {
    value: AiProvider.NIM,
    name: "NVIDIA NIM",
    vendor: "NVIDIA",
    description: "NVIDIA-hosted models through the OpenAI-compatible NIM API.",
    tag: "Hosted · fallback-friendly",
    local: false,
    defaultUrl: "https://integrate.api.nvidia.com/v1",
    urlPlaceholder: "https://integrate.api.nvidia.com/v1",
    defaultModel: "meta/llama-3.1-8b-instruct",
    apiKey: { label: "NVIDIA API key" },
  },
  {
    value: AiProvider.GOOGLE_AI_STUDIO,
    name: "Google AI Studio",
    vendor: "Google",
    description: "Gemini models through Google AI Studio's OpenAI-compatible API.",
    tag: "Hosted · fallback-friendly",
    local: false,
    defaultUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    urlPlaceholder: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    defaultAgentModel: "gemini-2.5-flash-lite",
    apiKey: { label: "Google AI API key" },
  },
];

export function providerOption(provider: AiProvider) {
  return PROVIDER_OPTIONS.find((option) => option.value === provider)!;
}

/** What people see when a saved key can't be decrypted, e.g. after DOSSIER_SECRET changed. */
export const API_KEY_UNREADABLE = "Your saved API key can't be read. Please enter it again.";

/** What Settings may know about the API key: never the key itself. */
export type KeyState = "none" | "set" | "unreadable" | "env";

/** What the AI provider section starts from. */
export type AiSettingsView = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  agentModel: string;
  keyState: KeyState;
};
