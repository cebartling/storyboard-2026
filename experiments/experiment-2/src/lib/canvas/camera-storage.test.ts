import { describe, expect, it } from 'vitest';
import {
	cameraStorageKey,
	loadCameraState,
	saveCameraState,
	type CameraStorageBackend
} from './camera-storage';

/** A minimal in-memory stand-in for `localStorage`, so no DOM is needed. */
function memoryBackend(initial: Record<string, string> = {}): CameraStorageBackend {
	const store = new Map(Object.entries(initial));
	return {
		getItem: (key) => store.get(key) ?? null,
		setItem: (key, value) => store.set(key, value)
	};
}

describe('cameraStorageKey', () => {
	it('namespaces the key by version and map id', () => {
		expect(cameraStorageKey('map-1')).toBe('storyboard:camera:v1:map-1');
	});
});

describe('saveCameraState / loadCameraState', () => {
	it('round-trips a saved state', () => {
		const backend = memoryBackend();
		saveCameraState(backend, 'map-1', { zoom: 1.25, scrollX: 100, scrollY: 200 });

		expect(loadCameraState(backend, 'map-1')).toEqual({ zoom: 1.25, scrollX: 100, scrollY: 200 });
	});

	it('keeps different maps in separate keys', () => {
		const backend = memoryBackend();
		saveCameraState(backend, 'map-1', { zoom: 1, scrollX: 0, scrollY: 0 });
		saveCameraState(backend, 'map-2', { zoom: 2, scrollX: 50, scrollY: 60 });

		expect(loadCameraState(backend, 'map-1')).toMatchObject({ zoom: 1 });
		expect(loadCameraState(backend, 'map-2')).toMatchObject({ zoom: 2 });
	});

	it('returns null when nothing has been saved for the map', () => {
		const backend = memoryBackend();
		expect(loadCameraState(backend, 'unseen-map')).toBeNull();
	});

	it('returns null for malformed JSON rather than throwing', () => {
		const backend = memoryBackend({ [cameraStorageKey('map-1')]: '{not json' });
		expect(loadCameraState(backend, 'map-1')).toBeNull();
	});

	it('returns null when required fields are missing', () => {
		const backend = memoryBackend({
			[cameraStorageKey('map-1')]: JSON.stringify({ zoom: 1 })
		});
		expect(loadCameraState(backend, 'map-1')).toBeNull();
	});

	it('returns null when a field is NaN or non-finite', () => {
		const backend = memoryBackend({
			[cameraStorageKey('map-1')]: JSON.stringify({ zoom: NaN, scrollX: 0, scrollY: 0 })
		});
		expect(loadCameraState(backend, 'map-1')).toBeNull();

		const infBackend = memoryBackend({
			[cameraStorageKey('map-1')]: JSON.stringify({ zoom: 1, scrollX: Infinity, scrollY: 0 })
		});
		expect(loadCameraState(infBackend, 'map-1')).toBeNull();
	});

	it('returns null when the saved value is not an object', () => {
		const backend = memoryBackend({ [cameraStorageKey('map-1')]: JSON.stringify('nope') });
		expect(loadCameraState(backend, 'map-1')).toBeNull();
	});

	it('loadCameraState returns null when the backend throws', () => {
		const throwingBackend: CameraStorageBackend = {
			getItem: () => {
				throw new Error('storage disabled');
			},
			setItem: () => {
				throw new Error('storage disabled');
			}
		};

		expect(loadCameraState(throwingBackend, 'map-1')).toBeNull();
	});

	it('saveCameraState swallows a throwing backend instead of throwing', () => {
		const throwingBackend: CameraStorageBackend = {
			getItem: () => null,
			setItem: () => {
				throw new Error('quota exceeded');
			}
		};

		expect(() =>
			saveCameraState(throwingBackend, 'map-1', { zoom: 1, scrollX: 0, scrollY: 0 })
		).not.toThrow();
	});
});
