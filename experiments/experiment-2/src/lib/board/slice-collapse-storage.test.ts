import { describe, expect, it } from 'vitest';
import {
	loadCollapsedSlices,
	saveCollapsedSlices,
	sliceCollapseStorageKey,
	type SliceCollapseStorageBackend
} from './slice-collapse-storage';

/** A minimal in-memory stand-in for `localStorage`, so no DOM is needed. */
function memoryBackend(initial: Record<string, string> = {}): SliceCollapseStorageBackend {
	const store = new Map(Object.entries(initial));
	return {
		getItem: (key) => store.get(key) ?? null,
		setItem: (key, value) => store.set(key, value)
	};
}

const throwingBackend: SliceCollapseStorageBackend = {
	getItem: () => {
		throw new Error('storage disabled');
	},
	setItem: () => {
		throw new Error('quota exceeded');
	}
};

describe('sliceCollapseStorageKey', () => {
	it('namespaces the key by version and map id', () => {
		expect(sliceCollapseStorageKey('map-1')).toBe('storyboard:collapsed-slices:v1:map-1');
	});
});

describe('saveCollapsedSlices / loadCollapsedSlices', () => {
	it('round-trips the collapsed ids', () => {
		const backend = memoryBackend();
		saveCollapsedSlices(backend, 'map-1', new Set(['slice-a', 'slice-b']));

		expect(loadCollapsedSlices(backend, 'map-1')).toEqual(new Set(['slice-a', 'slice-b']));
	});

	it('keeps different maps in separate keys', () => {
		const backend = memoryBackend();
		saveCollapsedSlices(backend, 'map-1', ['slice-a']);
		saveCollapsedSlices(backend, 'map-2', ['slice-b']);

		expect(loadCollapsedSlices(backend, 'map-1')).toEqual(new Set(['slice-a']));
		expect(loadCollapsedSlices(backend, 'map-2')).toEqual(new Set(['slice-b']));
	});

	it('returns an empty set when nothing has been saved for the map', () => {
		expect(loadCollapsedSlices(memoryBackend(), 'unseen-map')).toEqual(new Set());
	});

	it('returns an empty set for malformed JSON rather than throwing', () => {
		const backend = memoryBackend({ [sliceCollapseStorageKey('map-1')]: '[not json' });
		expect(loadCollapsedSlices(backend, 'map-1')).toEqual(new Set());
	});

	it('returns an empty set when the saved value is not an array of strings', () => {
		for (const value of [{ ids: ['a'] }, 'slice-a', ['slice-a', 7]]) {
			const backend = memoryBackend({ [sliceCollapseStorageKey('map-1')]: JSON.stringify(value) });
			expect(loadCollapsedSlices(backend, 'map-1')).toEqual(new Set());
		}
	});

	it('loadCollapsedSlices returns an empty set when the backend throws', () => {
		expect(loadCollapsedSlices(throwingBackend, 'map-1')).toEqual(new Set());
	});

	it('saveCollapsedSlices swallows a throwing backend instead of throwing', () => {
		expect(() => saveCollapsedSlices(throwingBackend, 'map-1', ['slice-a'])).not.toThrow();
	});
});
