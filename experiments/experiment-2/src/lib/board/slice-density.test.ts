import { describe, expect, it } from 'vitest';
import {
	isSliceDensity,
	nextSliceDensity,
	SLICE_DENSITIES,
	sliceDensityAction,
	sliceDensityName,
	type SliceDensity
} from './slice-density';

/** Expanded, the default, is `undefined` rather than a stored value. */
const EVERY_STATE: (SliceDensity | undefined)[] = [undefined, ...SLICE_DENSITIES];

describe('nextSliceDensity', () => {
	it('walks expanded to condensed to collapsed', () => {
		expect(nextSliceDensity(undefined)).toBe('condensed');
		expect(nextSliceDensity('condensed')).toBe('collapsed');
		expect(nextSliceDensity('collapsed')).toBeUndefined();
	});

	it('returns to the starting state after three steps, from any state', () => {
		for (const start of EVERY_STATE) {
			expect(nextSliceDensity(nextSliceDensity(nextSliceDensity(start)))).toBe(start);
		}
	});
});

describe('sliceDensityAction', () => {
	it('names the state the control moves to', () => {
		expect(sliceDensityAction(nextSliceDensity(undefined))).toBe('Condense');
		expect(sliceDensityAction(nextSliceDensity('condensed'))).toBe('Collapse');
		expect(sliceDensityAction(nextSliceDensity('collapsed'))).toBe('Expand');
	});
});

describe('sliceDensityName', () => {
	it('names the absent density expanded', () => {
		expect(sliceDensityName(undefined)).toBe('expanded');
		expect(sliceDensityName('condensed')).toBe('condensed');
		expect(sliceDensityName('collapsed')).toBe('collapsed');
	});
});

describe('isSliceDensity', () => {
	it('accepts only the stored densities', () => {
		for (const density of SLICE_DENSITIES) expect(isSliceDensity(density)).toBe(true);
		for (const value of ['expanded', '', null, undefined, 0, {}]) {
			expect(isSliceDensity(value)).toBe(false);
		}
	});
});
