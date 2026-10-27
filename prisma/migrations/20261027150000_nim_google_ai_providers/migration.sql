-- Add NVIDIA NIM and Google AI Studio as OpenAI-compatible providers.
ALTER TYPE "AiProvider" ADD VALUE 'NIM';
ALTER TYPE "AiProvider" ADD VALUE 'GOOGLE_AI_STUDIO';
