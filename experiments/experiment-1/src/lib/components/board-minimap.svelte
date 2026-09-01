<script lang="ts">
	// Overview navigator for the board's Camera (ADR 0010): a small SVG
	// approximating the board's grid (uniform column widths/row heights —
	// see `minimap-model.ts` for why real track sizes are not modeled), with
	// a viewport rectangle computed from the camera's *measured* world/view
	// sizes and scroll, which is always truthful even though the grid is an
	// approximation.
	import { scrollForMinimapPoint, viewportRectInMinimap } from '$lib/canvas/camera-math';
	import type { Camera } from '$lib/canvas/camera.svelte';
	import type { MinimapModel } from '$lib/canvas/minimap-model';

	let { camera, model }: { camera: Camera; model: MinimapModel } = $props();

	const WIDTH = 180;
	const HEIGHT = 120;
	/** World-space pixels nudged per arrow-key press on the viewport handle. */
	const KEYBOARD_PAN_STEP = 48;

	let svgEl: SVGSVGElement | undefined = $state();

	const colCount = $derived(Math.max(model.columns, 1));
	const rowCount = $derived(Math.max(model.rows.length, 1));
	const cellWidth = $derived(WIDTH / colCount);
	const cellHeight = $derived(HEIGHT / rowCount);

	const scaledWorld = $derived({
		width: camera.worldWidth * camera.zoom,
		height: camera.worldHeight * camera.zoom
	});
	const viewportSize = $derived({ width: camera.viewWidth, height: camera.viewHeight });
	const minimapSize = { width: WIDTH, height: HEIGHT };

	const viewportRect = $derived(
		viewportRectInMinimap(
			scaledWorld,
			viewportSize,
			{ scrollX: camera.scrollX, scrollY: camera.scrollY },
			minimapSize
		)
	);

	/** Converts a pointer event's client coordinates into the SVG's own `viewBox` units. */
	function toLocalPoint(e: PointerEvent): { x: number; y: number } {
		if (!svgEl) return { x: 0, y: 0 };
		const box = svgEl.getBoundingClientRect();
		const scaleX = box.width > 0 ? WIDTH / box.width : 1;
		const scaleY = box.height > 0 ? HEIGHT / box.height : 1;
		return {
			x: (e.clientX - box.left) * scaleX,
			y: (e.clientY - box.top) * scaleY
		};
	}

	function panToCentre(point: { x: number; y: number }) {
		const next = scrollForMinimapPoint(scaledWorld, viewportSize, minimapSize, point);
		camera.panTo(next.scrollX, next.scrollY);
	}

	// Pressing anywhere on the minimap background (i.e. not the viewport handle,
	// which stops propagation below) centres the viewport there and then keeps
	// tracking, so a press-and-drag continues as a drag instead of snapping once.
	function onBackgroundPointerDown(e: PointerEvent) {
		if (dragPointerId !== null) return;
		panToCentre(toLocalPoint(e));
		const el = e.currentTarget as SVGSVGElement;
		el.setPointerCapture(e.pointerId);
		dragPointerId = e.pointerId;
		// The handle is now centred under the pointer, so the drag offset is
		// simply half of it — the same state a press on the handle would leave.
		dragOffset = { x: viewportRect.width / 2, y: viewportRect.height / 2 };
	}

	let dragOffset: { x: number; y: number } | null = null;
	/** Pointer that owns the current drag; a second finger must not steer it. */
	let dragPointerId: number | null = null;

	function onHandlePointerDown(e: PointerEvent) {
		if (dragPointerId !== null) return;
		e.stopPropagation();
		(e.currentTarget as SVGRectElement).setPointerCapture(e.pointerId);
		dragPointerId = e.pointerId;
		const point = toLocalPoint(e);
		dragOffset = { x: point.x - viewportRect.x, y: point.y - viewportRect.y };
	}

	function onHandlePointerMove(e: PointerEvent) {
		if (!dragOffset || e.pointerId !== dragPointerId) return;
		// The svg carries the same handlers for background drags; stop here so a
		// handle drag is not also processed on the way up.
		e.stopPropagation();
		const point = toLocalPoint(e);
		panToCentre({
			x: point.x - dragOffset.x + viewportRect.width / 2,
			y: point.y - dragOffset.y + viewportRect.height / 2
		});
	}

	function onHandlePointerUp(e: PointerEvent) {
		if (e.pointerId !== dragPointerId) return;
		e.stopPropagation();
		dragOffset = null;
		dragPointerId = null;
		// `pointercancel` releases the capture implicitly, and releasing a pointer
		// that is no longer captured throws NotFoundError.
		const el = e.currentTarget as Element;
		if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
	}

	function onHandleKeyDown(e: KeyboardEvent) {
		switch (e.key) {
			case 'ArrowLeft':
				camera.panBy(-KEYBOARD_PAN_STEP, 0);
				break;
			case 'ArrowRight':
				camera.panBy(KEYBOARD_PAN_STEP, 0);
				break;
			case 'ArrowUp':
				camera.panBy(0, -KEYBOARD_PAN_STEP);
				break;
			case 'ArrowDown':
				camera.panBy(0, KEYBOARD_PAN_STEP);
				break;
			default:
				return;
		}
		e.preventDefault();
	}
</script>

<svg
	bind:this={svgEl}
	role="group"
	aria-label="Board overview"
	data-testid="board-minimap"
	viewBox="0 0 {WIDTH} {HEIGHT}"
	width={WIDTH}
	height={HEIGHT}
	class="border-line rounded border bg-white/90 shadow-sm"
	onpointerdown={onBackgroundPointerDown}
	onpointermove={onHandlePointerMove}
	onpointerup={onHandlePointerUp}
	onpointercancel={onHandlePointerUp}
>
	{#each model.rows as row, i (row.sliceId ?? `unsliced-${i}`)}
		<rect
			data-testid="minimap-row"
			aria-hidden="true"
			x="0"
			y={i * cellHeight}
			width={WIDTH}
			height={cellHeight}
			fill="none"
			stroke="var(--color-line)"
			stroke-width="0.5"
		/>
	{/each}

	{#each model.cells as cell (`${cell.col}-${cell.row}`)}
		<rect
			data-testid="minimap-cell"
			aria-hidden="true"
			data-story-count={cell.storyCount}
			x={cell.col * cellWidth}
			y={cell.row * cellHeight}
			width={cellWidth}
			height={cellHeight}
			fill={cell.storyCount > 0 ? 'var(--color-accent-soft)' : 'var(--color-brand-soft)'}
		/>
	{/each}

	<!--
		`group`, not `img`: an `img` has presentational children, which would drop
		this focusable handle out of the accessibility tree entirely. The handle is
		`application` rather than `button` because it is a 2D pan surface driven by
		the arrow keys — the role has to put a screen reader into focus mode so
		those keys reach `onHandleKeyDown`, and `button` would promise an
		Enter/Space activation that does not exist here.

		Svelte's a11y checker does not count `application` among its interactive
		roles, so it flags the tabindex and the listeners; both are deliberate and
		are what makes the handle reachable at all.
	-->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<rect
		data-testid="minimap-viewport"
		role="application"
		aria-label="Visible area of the board; drag or use arrow keys to pan"
		tabindex="0"
		x={viewportRect.x}
		y={viewportRect.y}
		width={viewportRect.width}
		height={viewportRect.height}
		fill="var(--color-brand-soft)"
		fill-opacity="0.5"
		stroke="var(--color-accent-soft)"
		stroke-width="1.5"
		class="cursor-move"
		onpointerdown={onHandlePointerDown}
		onpointermove={onHandlePointerMove}
		onpointerup={onHandlePointerUp}
		onpointercancel={onHandlePointerUp}
		onkeydown={onHandleKeyDown}
	/>
</svg>
