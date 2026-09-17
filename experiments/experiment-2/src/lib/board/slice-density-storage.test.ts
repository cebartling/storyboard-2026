import { describe, expect, it } from 'vitest';
import {
	loadSliceDensities,
	saveSliceDensities,
	sliceDensityStorageKey,
	type SliceDensityStorageBackend
} from './slice-density-storage';

/** A minimal in-memory stand-in for `localStorage`, so no DOM is needed. */
function memoryBackend(initial: Record<string, string> = {}): SliceDensityStorageBackend {
	const store = new Map(Object.entries(initial));
	return {
		getItem: (key) => store.get(key) ?? null,
		setItem: (key, value) => store.set(key, value)
	};
}

const throwingBackend: SliceDensityStorageBackend = {
	getItem: () => {
		throw new Error('storage disabled');
	},
	setItem: () => {
		throw new Error('quota exceeded');
	}
};

describe('sliceDensityStorageKey', () => {
	it('namespaces the key by version and map id', () => {
		expect(sliceDensityStorageKey('map-1')).toBe('storyboard:slice-density:v1:map-1');
	});

	it('does not reuse the collapsed-slices key it replaces', () => {
		expect(sliceDensityStorageKey('map-1')).not.toContain('collapsed-slices');
	});
});

describe('saveSliceDensities / loadSliceDensities', () => {
	it('round-trips the densities', () => {
		const backend = memoryBackend();
		saveSliceDensities(
			backend,
			'map-1',
			new Map([
				['slice-a', 'condensed'],
				['slice-b', 'collapsed']
			] as const)
		);

		expect(loadSliceDensities(backend, 'map-1')).toEqual(
			new Map([
				['slice-a', 'condensed'],
				['slice-b', 'collapsed']
			])
		);
	});

	it('keeps different maps in separate keys', () => {
		const backend = memoryBackend();
		saveSliceDensities(backend, 'map-1', [['slice-a', 'condensed']]);
		saveSliceDensities(backend, 'map-2', [['slice-b', 'collapsed']]);

		expect(loadSliceDensities(backend, 'map-1')).toEqual(new Map([['slice-a', 'condensed']]));
		expect(loadSliceDensities(backend, 'map-2')).toEqual(new Map([['slice-b', 'collapsed']]));
	});

	it('returns an empty map when nothing has been saved for the map', () => {
		expect(loadSliceDensities(memoryBackend(), 'unseen-map')).toEqual(new Map());
	});

	it('returns an empty map for malformed JSON rather than throwing', () => {
		const backend = memoryBackend({ [sliceDensityStorageKey('map-1')]: '{not json' });
		expect(loadSliceDensities(backend, 'map-1')).toEqual(new Map());
	});

	it('returns an empty map when the saved value is not an object of densities', () => {
		for (const value of [['slice-a'], 'condensed', 7, null]) {
			const backend = memoryBackend({ [sliceDensityStorageKey('map-1')]: JSON.stringify(value) });
			expect(loadSliceDensities(backend, 'map-1')).toEqual(new Map());
		}
	});

	it('returns an empty map when any value is not a density this module writes', () => {
		for (const value of [{ 'slice-a': 'expanded' }, { 'slice-a': 'condensed', 'slice-b': true }]) {
			const backend = memoryBackend({ [sliceDensityStorageKey('map-1')]: JSON.stringify(value) });
			expect(loadSliceDensities(backend, 'map-1')).toEqual(new Map());
		}
	});

	it('loadSliceDensities returns an empty map when the backend throws', () => {
		expect(loadSliceDensities(throwingBackend, 'map-1')).toEqual(new Map());
	});

	it('saveSliceDensities swallows a throwing backend instead of throwing', () => {
		expect(() =>
			saveSliceDensities(throwingBackend, 'map-1', [['slice-a', 'condensed']])
		).not.toThrow();
	});
});
