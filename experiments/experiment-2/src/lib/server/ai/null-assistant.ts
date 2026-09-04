import type { AiAssistant, StepSnapshot, StorySuggestion } from '$lib/domain/ports';

/**
 * No-op `AiAssistant`: makes no external calls and always suggests nothing.
 * Wired in `src/lib/server/deps.ts` until a real AI feature is scoped (ADR
 * 0007). Exists now mainly to prove the port shape compiles and is wireable
 * end to end.
 */
export class NullAiAssistant implements AiAssistant {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature fixed by the AiAssistant port
	async suggestStoriesForStep(_snapshot: StepSnapshot): Promise<StorySuggestion[]> {
		return [];
	}
}
