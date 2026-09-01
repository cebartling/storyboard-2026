import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { createRawSnippet } from 'svelte';
import BoardViewport from './board-viewport.svelte';
import { createCamera } from '$lib/canvas/camera.svelte';

// The world content only needs to exercise the interactive-target bail-out
// (a real `<button>`) and give the viewport something to scroll/zoom.
const worldSnippet = createRawSnippet(() => ({
	render: () => `
		<div style="width: 2000px; height: 2000px;">
			<button type="button" data-testid="inner-button">Inside</button>
		</div>
	`
}));

describe('BoardViewport', () => {
	it('ctrl+wheel zooms the camera and prevents the default event', async () => {
		const camera = createCamera();
		render(BoardViewport, { camera, children: worldSnippet });

		const viewport = page.getByTestId('board-viewport');
		const el = viewport.element() as HTMLElement;
		const startZoom = camera.zoom;

		const wheelEvent = new WheelEvent('wheel', {
			deltaY: -100,
			ctrlKey: true,
			clientX: 10,
			clientY: 10,
			bubbles: true,
			cancelable: true
		});
		el.dispatchEvent(wheelEvent);

		expect(wheelEvent.defaultPrevented).toBe(true);
		expect(camera.zoom).toBeGreaterThan(startZoom);
	});

	it('does not zoom or preventDefault on a plain wheel event', async () => {
		const camera = createCamera();
		render(BoardViewport, { camera, children: worldSnippet });

		const viewport = page.getByTestId('board-viewport');
		const el = viewport.element() as HTMLElement;
		const startZoom = camera.zoom;

		const wheelEvent = new WheelEvent('wheel', {
			deltaY: -100,
			clientX: 10,
			clientY: 10,
			bubbles: true,
			cancelable: true
		});
		el.dispatchEvent(wheelEvent);

		expect(wheelEvent.defaultPrevented).toBe(false);
		expect(camera.zoom).toBe(startZoom);
	});

	it('does not pan when pointerdown starts on a button child', async () => {
		const camera = createCamera();
		render(BoardViewport, { camera, children: worldSnippet });

		const viewport = page.getByTestId('board-viewport');
		const viewportEl = viewport.element() as HTMLElement;
		viewportEl.style.width = '400px';
		viewportEl.style.height = '400px';
		viewportEl.style.overflow = 'auto';
		const button = page.getByTestId('inner-button').element() as HTMLElement;

		viewportEl.scrollTop = 50;
		viewportEl.scrollLeft = 50;

		button.dispatchEvent(
			new PointerEvent('pointerdown', {
				pointerId: 1,
				button: 0,
				clientX: 100,
				clientY: 100,
				bubbles: true
			})
		);
		viewportEl.dispatchEvent(
			new PointerEvent('pointermove', {
				pointerId: 1,
				button: 0,
				clientX: 150,
				clientY: 150,
				bubbles: true
			})
		);

		// A background pan would have adjusted scroll from the pointer delta;
		// bailing on the button leaves it exactly where it was set above.
		expect(viewportEl.scrollLeft).toBe(50);
		expect(viewportEl.scrollTop).toBe(50);
	});

	it('pans on a middle-button drag regardless of target', async () => {
		const camera = createCamera();
		render(BoardViewport, { camera, children: worldSnippet });

		const viewport = page.getByTestId('board-viewport');
		const viewportEl = viewport.element() as HTMLElement;
		viewportEl.style.width = '400px';
		viewportEl.style.height = '400px';
		viewportEl.style.overflow = 'auto';
		viewportEl.setPointerCapture = () => {};
		viewportEl.releasePointerCapture = () => {};

		viewportEl.dispatchEvent(
			new PointerEvent('pointerdown', {
				pointerId: 2,
				button: 1,
				clientX: 200,
				clientY: 200,
				bubbles: true
			})
		);
		viewportEl.dispatchEvent(
			new PointerEvent('pointermove', {
				pointerId: 2,
				button: 1,
				clientX: 150,
				clientY: 170,
				bubbles: true
			})
		);

		expect(viewportEl.scrollLeft).toBe(50);
		expect(viewportEl.scrollTop).toBe(30);
	});

	it('pans on a space+left-button drag', async () => {
		const camera = createCamera();
		render(BoardViewport, { camera, children: worldSnippet });

		const viewport = page.getByTestId('board-viewport');
		const viewportEl = viewport.element() as HTMLElement;
		viewportEl.style.width = '400px';
		viewportEl.style.height = '400px';
		viewportEl.style.overflow = 'auto';
		viewportEl.setPointerCapture = () => {};
		viewportEl.releasePointerCapture = () => {};

		window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));

		viewportEl.dispatchEvent(
			new PointerEvent('pointerdown', {
				pointerId: 3,
				button: 0,
				clientX: 300,
				clientY: 300,
				bubbles: true
			})
		);
		viewportEl.dispatchEvent(
			new PointerEvent('pointermove', {
				pointerId: 3,
				button: 0,
				clientX: 260,
				clientY: 280,
				bubbles: true
			})
		);

		expect(viewportEl.scrollLeft).toBe(40);
		expect(viewportEl.scrollTop).toBe(20);

		window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
	});

	it('releases a held space when the window loses focus, so cards stay draggable', async () => {
		const camera = createCamera();
		render(BoardViewport, { camera, children: worldSnippet });

		const viewportEl = page.getByTestId('board-viewport').element() as HTMLElement;
		viewportEl.style.width = '400px';
		viewportEl.style.height = '400px';
		viewportEl.style.overflow = 'auto';
		viewportEl.setPointerCapture = () => {};
		viewportEl.releasePointerCapture = () => {};

		// Space goes down here, but the keyup lands in whatever window took focus.
		window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
		window.dispatchEvent(new Event('blur'));

		const button = page.getByTestId('inner-button').element() as HTMLElement;
		button.dispatchEvent(
			new PointerEvent('pointerdown', {
				pointerId: 7,
				button: 0,
				clientX: 300,
				clientY: 300,
				bubbles: true
			})
		);
		viewportEl.dispatchEvent(
			new PointerEvent('pointermove', {
				pointerId: 7,
				button: 0,
				clientX: 260,
				clientY: 280,
				bubbles: true
			})
		);

		expect(viewportEl.scrollLeft).toBe(0);
		expect(viewportEl.scrollTop).toBe(0);
	});

	it('keyboard "0" resets zoom and "1" fits, reaching the camera', async () => {
		const camera = createCamera();
		camera.setWorldSize(4000, 4000);
		camera.setViewportSize(400, 400);
		camera.zoomIn();
		render(BoardViewport, { camera, children: worldSnippet });

		expect(camera.zoom).not.toBe(1);

		window.dispatchEvent(new KeyboardEvent('keydown', { key: '0' }));
		expect(camera.zoom).toBe(1);

		window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
		expect(camera.zoom).toBeLessThan(1);
	});

	it('leaves the browser page-zoom shortcuts alone when a modifier is held', async () => {
		const camera = createCamera();
		camera.setWorldSize(4000, 4000);
		camera.setViewportSize(400, 400);
		camera.zoomIn();
		render(BoardViewport, { camera, children: worldSnippet });

		const zoomed = camera.zoom;

		for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const) {
			for (const key of ['0', '1', '-', '=']) {
				const event = new KeyboardEvent('keydown', { key, [modifier]: true, cancelable: true });
				window.dispatchEvent(event);
				expect(event.defaultPrevented).toBe(false);
			}
		}

		expect(camera.zoom).toBe(zoomed);
	});
});
