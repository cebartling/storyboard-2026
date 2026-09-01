import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import ZoomControls from './zoom-controls.svelte';
import { createCamera } from '$lib/canvas/camera.svelte';

describe('ZoomControls', () => {
	it('zoom-in increases the camera zoom and updates the readout', async () => {
		const camera = createCamera();
		render(ZoomControls, { camera });

		await expect.element(page.getByTestId('zoom-readout')).toHaveTextContent('100%');

		await page.getByTestId('zoom-in').click();

		expect(camera.zoom).toBeCloseTo(1.25);
		await expect.element(page.getByTestId('zoom-readout')).toHaveTextContent('125%');
	});

	it('zoom-out decreases the camera zoom and updates the readout', async () => {
		const camera = createCamera();
		render(ZoomControls, { camera });

		await page.getByTestId('zoom-out').click();

		expect(camera.zoom).toBeCloseTo(0.75);
		await expect.element(page.getByTestId('zoom-readout')).toHaveTextContent('75%');
	});

	it('zoom-reset returns to 100% after zooming', async () => {
		const camera = createCamera();
		render(ZoomControls, { camera });

		await page.getByTestId('zoom-in').click();
		await page.getByTestId('zoom-in').click();
		await page.getByTestId('zoom-reset').click();

		expect(camera.zoom).toBe(1);
		await expect.element(page.getByTestId('zoom-readout')).toHaveTextContent('100%');
	});

	it('zoom-fit sizes the camera to fit the world in the viewport', async () => {
		const camera = createCamera();
		camera.setWorldSize(4000, 4000);
		camera.setViewportSize(400, 400);
		render(ZoomControls, { camera });

		await page.getByTestId('zoom-fit').click();

		expect(camera.zoom).toBeLessThan(1);
		await expect
			.element(page.getByTestId('zoom-readout'))
			.toHaveTextContent(`${Math.round(camera.zoom * 100)}%`);
	});

	// The cluster reads as one control only if its four marks share a stroke
	// width and an optical size — which text glyphs from four different
	// Unicode blocks (U+2212, U+002B, U+2922, U+29BF) never did.
	it.each([
		['zoom-out', 'lucide-minus'],
		['zoom-in', 'lucide-plus'],
		['zoom-fit', 'lucide-maximize'],
		['zoom-reset', 'lucide-target']
	])('draws %s as the %s icon', async (testid, iconClass) => {
		const camera = createCamera();
		render(ZoomControls, { camera });

		const button = page.getByTestId(testid).element() as HTMLElement;

		expect(button.querySelector(`svg.${iconClass}`)).not.toBeNull();
		expect(button.textContent?.trim()).toBe('');
	});
});
