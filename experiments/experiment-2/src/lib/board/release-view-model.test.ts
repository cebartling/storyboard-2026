import { describe, expect, it } from 'vitest';
import { buildReleaseViewModel } from './release-view-model';
import {
	addActivity,
	addDependency,
	addSlice,
	addStep,
	addStory,
	createStoryMap
} from '$lib/domain/story-map';
import type { StoryMap } from '$lib/domain/story-map';
import type { SliceId, StoryId } from '$lib/domain/ids';

/**
 * A board of two activities — Shop (Browse, Cart) then Buy (Pay) — and three
 * slices, R1 to R3. `story` files a titled story into a step and a slice and
 * returns its id, so each test states only the stories and edges it is about.
 */
function fixture() {
	let map: StoryMap = createStoryMap('Test map');
	const shop = addActivity(map, 'Shop');
	map = addStep(shop.map, shop.activity.id, 'Browse').map;
	map = addStep(map, shop.activity.id, 'Cart').map;
	const buy = addActivity(map, 'Buy');
	map = addStep(buy.map, buy.activity.id, 'Pay').map;

	const slices: Record<string, SliceId> = {};
	for (const name of ['R1', 'R2', 'R3']) {
		const added = addSlice(map, name);
		map = added.map;
		slices[name] = added.slice.id;
	}
	const stepId = (name: string) =>
		map.activities.flatMap((a) => a.steps).find((s) => s.name === name)!.id;

	return {
		slices,
		story(title: string, step: string, slice: string | null): StoryId {
			const added = addStory(map, stepId(step), title, {
				sliceId: slice === null ? null : slices[slice]
			});
			map = added.map;
			return added.story.id;
		},
		blocks(blockerId: StoryId, blockedId: StoryId) {
			map = addDependency(map, blockerId, blockedId);
		},
		get map() {
			return map;
		}
	};
}

const titles = (view: ReturnType<typeof buildReleaseViewModel>) =>
	view!.stories.map((s) => s.title);

describe('buildReleaseViewModel', () => {
	it('returns null for a slice the map does not have', () => {
		const f = fixture();

		expect(buildReleaseViewModel(f.map, 'no-such-slice' as SliceId)).toBeNull();
	});

	it('names the slice and lists nothing when it has no stories', () => {
		const f = fixture();

		expect(buildReleaseViewModel(f.map, f.slices.R2)).toEqual({
			sliceId: f.slices.R2,
			name: 'R2',
			stories: []
		});
	});

	it('falls back to reading order — activity, then step, then story rank — with no edges', () => {
		const f = fixture();
		// Added out of reading order on purpose, so array order cannot pass this.
		f.story('Pay by card', 'Pay', 'R1');
		f.story('Add to cart', 'Cart', 'R1');
		f.story('Browse catalogue', 'Browse', 'R1');
		f.story('Search', 'Browse', 'R1');
		f.story('In another slice', 'Browse', 'R2');

		const view = buildReleaseViewModel(f.map, f.slices.R1);

		expect(titles(view)).toEqual(['Browse catalogue', 'Search', 'Add to cart', 'Pay by card']);
	});

	it('carries each story’s status, activity and step', () => {
		const f = fixture();
		f.story('Add to cart', 'Cart', 'R1');

		expect(buildReleaseViewModel(f.map, f.slices.R1)!.stories[0]).toMatchObject({
			title: 'Add to cart',
			status: 'todo',
			activityName: 'Shop',
			stepName: 'Cart',
			blockers: []
		});
	});

	it('lists a blocker inside the slice before the story it blocks, and names its position', () => {
		const f = fixture();
		const browse = f.story('Browse catalogue', 'Browse', 'R1');
		const pay = f.story('Pay by card', 'Pay', 'R1');
		f.blocks(pay, browse);

		const view = buildReleaseViewModel(f.map, f.slices.R1)!;

		expect(titles(view)).toEqual(['Pay by card', 'Browse catalogue']);
		expect(view.stories[1].blockers).toEqual([
			{ kind: 'inSlice', id: pay, title: 'Pay by card', position: 1 }
		]);
	});

	it('keeps reading order among stories an edge does not constrain', () => {
		const f = fixture();
		f.story('Browse catalogue', 'Browse', 'R1');
		const cart = f.story('Add to cart', 'Cart', 'R1');
		const pay = f.story('Pay by card', 'Pay', 'R1');
		f.blocks(pay, cart);

		// Only "cart after pay" is required. Browse is free, and stays first.
		expect(titles(buildReleaseViewModel(f.map, f.slices.R1))).toEqual([
			'Browse catalogue',
			'Pay by card',
			'Add to cart'
		]);
	});

	it('respects a chain that passes through a story in another slice', () => {
		const f = fixture();
		const browse = f.story('Browse catalogue', 'Browse', 'R1');
		const pay = f.story('Pay by card', 'Pay', 'R1');
		const elsewhere = f.story('Save card', 'Pay', 'R2');
		// pay -> elsewhere -> browse: browse cannot be built before pay, although
		// no edge joins the two directly.
		f.blocks(pay, elsewhere);
		f.blocks(elsewhere, browse);

		expect(titles(buildReleaseViewModel(f.map, f.slices.R1))).toEqual([
			'Pay by card',
			'Browse catalogue'
		]);
	});

	it('flags a blocker in a later slice or unsliced, but not one in an earlier slice', () => {
		const f = fixture();
		const earlier = f.story('Earlier', 'Browse', 'R1');
		const later = f.story('Later', 'Browse', 'R3');
		const unsliced = f.story('Unsliced', 'Browse', null);
		const story = f.story('Checkout', 'Pay', 'R2');
		f.blocks(earlier, story);
		f.blocks(later, story);
		f.blocks(unsliced, story);

		const [checkout] = buildReleaseViewModel(f.map, f.slices.R2)!.stories;

		expect(checkout.blockers).toEqual([
			{ kind: 'outside', id: earlier, title: 'Earlier', sliceName: 'R1', contradicts: false },
			{ kind: 'outside', id: later, title: 'Later', sliceName: 'R3', contradicts: true },
			{ kind: 'outside', id: unsliced, title: 'Unsliced', sliceName: null, contradicts: true }
		]);
	});

	it('lists only what blocks a story, not what it blocks', () => {
		const f = fixture();
		const story = f.story('Browse catalogue', 'Browse', 'R1');
		f.blocks(story, f.story('Later work', 'Browse', 'R2'));

		expect(buildReleaseViewModel(f.map, f.slices.R1)!.stories[0].blockers).toEqual([]);
	});

	it('lists blockers from one other slice in reading order, not the order the edges were added', () => {
		const f = fixture();
		const story = f.story('Checkout', 'Pay', 'R1');
		const saveCard = f.story('Save card', 'Pay', 'R3');
		const wishlist = f.story('Wishlist', 'Browse', 'R3');
		f.blocks(saveCard, story);
		f.blocks(wishlist, story);

		const [checkout] = buildReleaseViewModel(f.map, f.slices.R1)!.stories;

		expect(checkout.blockers.map((b) => b.title)).toEqual(['Wishlist', 'Save card']);
	});

	it('throws, naming the stuck stories, when the stored edges form a cycle', () => {
		const f = fixture();
		const browse = f.story('Browse catalogue', 'Browse', 'R1');
		const pay = f.story('Pay by card', 'Pay', 'R1');
		f.blocks(pay, browse);
		// addDependency refuses the closing edge, so only a hand-edited document
		// can hold one. The view must say so rather than drop the two stories.
		const cyclic: StoryMap = {
			...f.map,
			dependencies: [...f.map.dependencies, { blockerId: browse, blockedId: pay }]
		};

		expect(() => buildReleaseViewModel(cyclic, f.slices.R1)).toThrow(`${browse}, ${pay}`);
	});
});
