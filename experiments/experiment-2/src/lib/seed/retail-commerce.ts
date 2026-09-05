/**
 * A sample user story map for a retail commerce system, big enough to
 * exercise the board at realistic scale: 12 activities, 43 steps, and 157
 * stories across three release slices plus an unsliced backlog band. Those
 * counts are pinned by this module's test, because the READMEs quote them.
 *
 * The blueprint below is plain data; `buildRetailCommerceMap` turns it into
 * a `StoryMap` using only the pure domain functions, so this module stays
 * free of Mongo and SvelteKit and unit-tests without a database. The
 * script that writes it to MongoDB is `scripts/seed.ts`.
 *
 * Descriptions are **composed, not written out** (ADR 0018). Each story
 * carries a narrative sentence and its acceptance criteria as data, and
 * `storyDescription` renders them to Markdown. Two reasons: 157 hand-written
 * Markdown blobs would drift into 157 different shapes, and the seed is the
 * only realistic corpus this app has for the description renderer — so it
 * should exercise the constructs the renderer supports (emphasis, headings,
 * task lists, tables, code, links, quotes) rather than 157 bare paragraphs.
 */

import {
	addActivity,
	addSlice,
	addStep,
	addStory,
	createStoryMap,
	type StoryMap
} from '$lib/domain/story-map';

/** An acceptance criterion and whether it is already met. */
export type Criterion = [text: string, met: boolean];

export interface StoryBlueprint {
	title: string;
	/** The name of a slice in `retailCommerceSliceNames`, or `null` for the
	 * unsliced band — ideas parked below every release. */
	slice: string | null;
	/** The Patton sentence: "As a …, I … so that …". Carries its own emphasis. */
	narrative: string;
	criteria: Criterion[];
	/** An optional trailing block of raw Markdown — a caveat, a table, a link. */
	note?: string;
}

export interface StepBlueprint {
	name: string;
	stories: StoryBlueprint[];
}

export interface ActivityBlueprint {
	name: string;
	steps: StepBlueprint[];
}

export const RETAIL_COMMERCE_MAP_NAME = 'Retail Commerce Platform';

const R1 = 'Release 1 — Buy One Thing';
const R2 = 'Release 2 — Trustworthy Checkout';
const R3 = 'Release 3 — Scale & Personalise';

export const retailCommerceSliceNames = [R1, R2, R3] as const;

/**
 * The Markdown a story's `description` holds, composed from the blueprint.
 *
 * Exported because the module's test compares what the builder attached
 * against this, and because `scripts/seed.ts` has no other way to know what a
 * blueprint renders to.
 */
export function storyDescription(story: StoryBlueprint): string {
	const criteria = story.criteria.map(([text, met]) => `- [${met ? 'x' : ' '}] ${text}`).join('\n');

	return [
		story.narrative,
		'## Acceptance criteria',
		criteria,
		...(story.note ? [story.note] : [])
	].join('\n\n');
}

/** Terser than an object literal per story, so the shape of the map stays
 * readable at a glance. */
function s(
	title: string,
	slice: string | null,
	narrative: string,
	criteria: Criterion[],
	note?: string
): StoryBlueprint {
	return { title, slice, narrative, criteria, ...(note === undefined ? {} : { note }) };
}

export const retailCommerceBlueprint: ActivityBlueprint[] = [
	{
		name: 'Discover Products',
		steps: [
			{
				name: 'Land on the store',
				stories: [
					s(
						'See the homepage',
						R1,
						'As a shopper I **see a storefront** so I know what is sold here.',
						[
							['Hero, primary navigation and footer render above the fold', true],
							['Featured rail is server-rendered, not fetched after paint', true],
							['Largest Contentful Paint under `2.5s` on a cold 4G load', false]
						]
					),
					s(
						'See featured collections',
						R2,
						'As a shopper I see **curated collections** so I can start browsing without searching.',
						[
							['Up to six collections, ordered by the merchandiser', true],
							['An empty collection is hidden rather than shown empty', false]
						]
					),
					s(
						'See a localised storefront',
						R3,
						'As a shopper abroad I see **my currency and language** so prices make sense.',
						[
							[
								'Locale resolves from the `Accept-Language` header, overridable by the shopper',
								false
							],
							['Prices convert at the rate stored with the price list, not a live feed', false],
							['Falls back to the default market rather than erroring on an unknown locale', false]
						],
						'| Market | Currency | Language |\n| --- | --- | --- |\n| UK | GBP | en-GB |\n| DE | EUR | de-DE |\n| JP | JPY | ja-JP |'
					),
					s(
						'See a personalised hero banner',
						null,
						'As a returning shopper I see a banner tied to **what I browsed last**.',
						[
							['Falls back to the default hero when there is no history', false],
							['Respects the shopper’s marketing consent', false]
						],
						'> Parked until we know whether the lift beats the cache cost — the hero is the one thing every page render shares.'
					)
				]
			},
			{
				name: 'Browse the catalogue',
				stories: [
					s(
						'Browse a category',
						R1,
						'As a shopper I **open a category** so I can see the products in it.',
						[
							['Products show image, title and price', true],
							['Out-of-stock items still appear, marked as such', true]
						]
					),
					s(
						'Page through a long category',
						R1,
						'As a shopper I **move through pages** of results so I can see more than the first screen.',
						[
							['Page size is 24, configurable per market', true],
							['The page number is in the URL so a result is linkable', true],
							['Deep pages do not re-count the full result set', false]
						]
					),
					s(
						'See breadcrumb navigation',
						R2,
						'As a shopper I see **where I am** in the category tree so I can go back up.',
						[
							['Breadcrumbs reflect the path taken, not the product’s primary category', false],
							['Marked up as `BreadcrumbList` structured data', false]
						]
					),
					s(
						'See a merchandised category order',
						R3,
						'As a merchandiser I **control the default order** of a category so best sellers lead.',
						[
							['Manual pins sit above the algorithmic order', false],
							['Order is per category and per market', false]
						]
					)
				]
			},
			{
				name: 'Search',
				stories: [
					s(
						'Search by keyword',
						R1,
						'As a shopper I **type what I want** so I can find it without browsing.',
						[
							['Matches product title, SKU and brand', true],
							['An empty result set offers categories rather than a dead end', true]
						]
					),
					s(
						'See typo-tolerant results',
						R2,
						'As a shopper I **still get results** when I misspell a product name.',
						[
							['A one-character transposition still matches', false],
							['Exact matches always outrank fuzzy ones', false]
						],
						'Edit distance is capped at `2`; beyond that the query is treated as a new term rather than a correction.'
					),
					s(
						'See search-as-you-type suggestions',
						R3,
						'As a shopper I see **suggestions while typing** so I reach a product in fewer keystrokes.',
						[
							['Suggestions appear after the third character', false],
							['Keyboard navigable, and announced to screen readers', false],
							['Debounced so typing does not issue a request per keystroke', false]
						]
					),
					s(
						'Search by image',
						null,
						'As a shopper I **upload a photo** to find visually similar products.',
						[
							['Accepts JPEG and PNG up to 5MB', false],
							['Uploaded images are discarded after the search', false]
						],
						'> Depends on an embedding service we have not chosen. See [the discovery spike](https://example.com/spikes/visual-search).'
					)
				]
			},
			{
				name: 'Filter and sort',
				stories: [
					s(
						'Filter by price',
						R1,
						'As a shopper I **narrow results to a price range** so I only see what I can afford.',
						[
							['Bounds are inclusive and shown in the shopper’s currency', true],
							['Filters combine with search rather than replacing it', true]
						]
					),
					s(
						'Filter by size and colour',
						R2,
						'As a shopper I filter to **the variants I would actually buy**.',
						[
							['A product matches if any of its variants match', false],
							['Facet counts reflect the other filters already applied', false]
						]
					),
					s(
						'Sort by price and popularity',
						R2,
						'As a shopper I **reorder results** so the most relevant come first.',
						[
							['Sort choice survives paging', false],
							['Popularity is a rolling 30-day window, not all-time', false]
						]
					),
					s(
						'Save a filter set',
						null,
						'As a frequent shopper I **save a filter combination** so I can reuse it.',
						[['Saved sets are per account and named by the shopper', false]]
					)
				]
			}
		]
	},
	{
		name: 'Evaluate a Product',
		steps: [
			{
				name: 'View product details',
				stories: [
					s(
						'See product photos',
						R1,
						'As a shopper I **see photos** of the product so I know what I am buying.',
						[
							['At least one image is required to publish a product', true],
							['Images are served in `webp` with a JPEG fallback', true],
							['Alt text falls back to the product title when unset', false]
						]
					),
					s(
						'Read the product description',
						R1,
						'As a shopper I read the **details and specifications** so I can judge fit.',
						[
							['Description and a specification table render separately', true],
							['Supplier HTML is sanitised before it is shown', true]
						]
					),
					s(
						'Zoom a product photo',
						R2,
						'As a shopper I **zoom into a photo** so I can inspect materials and finish.',
						[
							['Zoom works by touch and by keyboard, not hover alone', false],
							['The high-resolution image loads only when zoom is opened', false]
						]
					),
					s(
						'Watch a product video',
						R3,
						'As a shopper I **watch the product in use** so I understand its scale.',
						[
							['Video never autoplays with sound', false],
							['Captions are required before a video can be published', false]
						]
					),
					s(
						'View the product in 3D',
						null,
						'As a shopper I **rotate a 3D model** so I can see every side.',
						[['Falls back to the photo gallery where WebGL is unavailable', false]]
					)
				]
			},
			{
				name: 'Compare options',
				stories: [
					s(
						'Choose a size variant',
						R1,
						'As a shopper I **pick a size** so I add the right item to my cart.',
						[
							['Unavailable sizes are shown but not selectable', true],
							['The chosen variant is in the URL so the choice is shareable', true]
						]
					),
					s(
						'Choose a colour variant',
						R2,
						'As a shopper I **switch colour** and see matching photos and stock.',
						[
							['Gallery swaps to that colour’s images without a full reload', false],
							['Switching colour keeps the selected size where it exists', false]
						]
					),
					s(
						'Compare two products side by side',
						R3,
						'As a shopper I **compare specifications** so I can decide between two candidates.',
						[
							['Up to four products at once', false],
							['Differing rows are highlighted; identical rows can be collapsed', false]
						]
					),
					s(
						'See a size-fit recommendation',
						null,
						'As a shopper I get a **size suggestion from my past orders** so I return less.',
						[['Only shown where the shopper has two or more prior orders in the category', false]],
						'> Worth measuring against return rate before building: the value is the returns saved, not the conversion.'
					)
				]
			},
			{
				name: 'Read reviews',
				stories: [
					s(
						'Read customer reviews',
						R2,
						'As a shopper I read **what other buyers said** so I can trust the listing.',
						[
							['Average rating and distribution shown above the reviews', false],
							['Reviews paginate rather than loading all at once', false]
						]
					),
					s(
						'Sort reviews by rating',
						R2,
						'As a shopper I read the **critical reviews first** so I see the downsides.',
						[['Sort by newest, highest and lowest', false]]
					),
					s(
						'Write a review after delivery',
						R3,
						'As a buyer I **review a product I received** so others benefit.',
						[
							['Only orders marked delivered can be reviewed', false],
							['One review per buyer per product, editable for 30 days', false],
							['Submitted reviews are queued for moderation, not published live', false]
						]
					),
					s(
						'See verified-purchase badges',
						R3,
						'As a shopper I can tell **which reviews come from real orders**.',
						[['The badge is derived from the order, never set by hand', false]]
					),
					s(
						'Ask the community a question',
						null,
						'As a shopper I **ask a question** about the product and get answers from owners.',
						[['Questions are moderated before they appear', false]]
					)
				]
			},
			{
				name: 'Check availability',
				stories: [
					s(
						'See stock status',
						R1,
						'As a shopper I see **whether an item is in stock** before I try to buy it.',
						[
							['Status is one of in stock, low stock, or out of stock', true],
							['Low stock threshold is configurable per product', true]
						]
					),
					s(
						'See estimated delivery date',
						R2,
						'As a shopper I see **when it would arrive** so I can plan.',
						[
							['Estimate accounts for the cut-off time and non-working days', false],
							['Shown as a date range, never a single promised day', false]
						]
					),
					s(
						'Check availability in a nearby store',
						R3,
						'As a shopper I see **which local store** has the item today.',
						[
							['Store stock is refreshed at least every 15 minutes', false],
							['Location comes from a postcode entry, not silent geolocation', false]
						]
					),
					s(
						'Join a back-in-stock waitlist',
						R3,
						'As a shopper I ask to be **told when a sold-out item returns**.',
						[
							['One notification per shopper per variant', false],
							['Waitlist entries expire after 90 days', false]
						]
					)
				]
			}
		]
	},
	{
		name: 'Build a Cart',
		steps: [
			{
				name: 'Add to cart',
				stories: [
					s(
						'Add an item to the cart',
						R1,
						'As a shopper I **add a product** so I can buy it later in the session.',
						[
							['A guest cart survives a browser refresh', true],
							['Adding the same variant twice increments the quantity', true],
							['Stock is checked at add time and again at checkout', true]
						]
					),
					s(
						'Add from a category page',
						R2,
						'As a shopper I **add a simple product** without opening its page.',
						[
							['Only offered for products with a single variant', false],
							['Products with variants link through to the detail page instead', false]
						]
					),
					s(
						'See a cart confirmation',
						R2,
						'As a shopper I get **feedback that the item landed** in my cart.',
						[
							['Confirmation is announced to assistive technology', false],
							['It never steals focus from what the shopper was doing', false]
						]
					),
					s(
						'Add a gift message',
						null,
						'As a shopper I **attach a gift note** so the recipient knows who sent it.',
						[['Note is limited to 200 characters and printed on the packing slip', false]]
					)
				]
			},
			{
				name: 'Review the cart',
				stories: [
					s(
						'See cart line items and total',
						R1,
						'As a shopper I see **everything in my cart** and what it costs.',
						[
							['Each line shows variant, unit price, quantity and line total', true],
							['The total is recalculated server-side, never trusted from the client', true]
						]
					),
					s(
						'Change an item quantity',
						R1,
						'As a shopper I **adjust how many** I want without removing and re-adding.',
						[
							['Quantity is capped at available stock', true],
							['Setting a quantity of zero removes the line', true]
						]
					),
					s('Remove an item', R1, 'As a shopper I **take something out** of my cart.', [
						['Removal is undoable for the rest of the session', true],
						['Removing the last line leaves a useful empty state', true]
					]),
					s(
						'See a low-stock warning in the cart',
						R3,
						'As a shopper I am **warned when an item in my cart is nearly gone**.',
						[['Warning appears when remaining stock is below the cart quantity', false]]
					)
				]
			},
			{
				name: 'Save for later',
				stories: [
					s(
						'Move an item to a wishlist',
						R2,
						'As a shopper I **park an item** I am not ready to buy.',
						[
							['Moving out of the cart releases any stock reservation', false],
							['A wishlist item can be moved back in one action', false]
						]
					),
					s(
						'Restore a saved cart on sign-in',
						R3,
						'As a returning shopper my **cart is still there** on another device.',
						[
							['A signed-in cart merges with the guest cart rather than replacing it', false],
							['Merge conflicts resolve to the higher quantity', false]
						]
					),
					s(
						'Share a wishlist',
						null,
						'As a shopper I **send my wishlist** to someone buying me a gift.',
						[['The shared link is read-only and can be revoked', false]]
					)
				]
			},
			{
				name: 'Apply a promotion',
				stories: [
					s('Enter a promo code', R2, 'As a shopper I **redeem a code** I was sent.', [
						['Codes are case-insensitive and trimmed', false],
						['An invalid code says why: expired, not started, or not applicable', false],
						['Rejected after `5` failed attempts in a session', false]
					]),
					s(
						'See the discount on the total',
						R2,
						'As a shopper I see **exactly what the code saved me**.',
						[['Discount is a separate line, never folded into the subtotal', false]]
					),
					s(
						'See automatic bundle pricing',
						R3,
						'As a shopper I get the **bundle price** without hunting for a code.',
						[
							['Bundles apply automatically when the cart qualifies', false],
							['Only the best-value bundle applies where several match', false]
						]
					),
					s(
						'Stack loyalty points with a promo',
						null,
						'As a member I **combine points with a promotion** where the rules allow it.',
						[['Stacking rules are configured per promotion, defaulting to off', false]],
						'> The default matters more than the feature: silent stacking is how margin leaks.'
					)
				]
			}
		]
	},
	{
		name: 'Check Out',
		steps: [
			{
				name: 'Identify the shopper',
				stories: [
					s(
						'Check out as a guest',
						R1,
						'As a first-time shopper I **buy without creating an account**.',
						[
							['Email address is the only identity required', true],
							['Guest orders are claimable later by registering with the same email', true]
						]
					),
					s(
						'Sign in to check out',
						R2,
						'As a returning shopper I **sign in** so my details are prefilled.',
						[
							['Signing in mid-checkout preserves the cart', false],
							['Failed attempts are rate limited per address', false]
						]
					),
					s(
						'Create an account during checkout',
						R2,
						'As a shopper I **save my details at the end** without restarting checkout.',
						[['Offered after payment, so it cannot block the sale', false]]
					),
					s(
						'Check out with a one-time link',
						null,
						'As a shopper I **resume a checkout from a link** instead of a password.',
						[['Links are single-use and expire after 30 minutes', false]]
					)
				]
			},
			{
				name: 'Enter delivery details',
				stories: [
					s('Enter a delivery address', R1, 'As a shopper I say **where the order should go**.', [
						['Required fields differ by country', true],
						['Postcode is validated against the selected country’s format', true]
					]),
					s(
						'Autocomplete an address',
						R2,
						'As a shopper I **pick my address from suggestions** so I mistype less.',
						[
							['Manual entry stays available if lookup fails', false],
							['The chosen suggestion is still editable afterwards', false]
						]
					),
					s(
						'Choose a saved address',
						R2,
						'As a returning shopper I **reuse an address** from a previous order.',
						[['Editing a saved address at checkout does not silently change past orders', false]]
					),
					s(
						'Enter a separate billing address',
						R2,
						'As a shopper I **bill to a different address** than I ship to.',
						[['Defaults to the delivery address, with one control to differ', false]]
					)
				]
			},
			{
				name: 'Choose a delivery option',
				stories: [
					s(
						'Choose standard delivery',
						R1,
						'As a shopper I take the **default delivery option** and its cost.',
						[
							['Cost comes from the shipping zone for the delivery address', true],
							['A free-delivery threshold is shown when the cart is close to it', false]
						]
					),
					s('Choose express delivery', R2, 'As a shopper I **pay more to get it sooner**.', [
						['Express is hidden where the cut-off for the day has passed', false]
					]),
					s(
						'Choose click-and-collect',
						R3,
						'As a shopper I **collect from a store** instead of paying for delivery.',
						[
							['Only stores holding all cart items are offered', false],
							['Collection is free and skips the delivery address step', false]
						]
					),
					s(
						'Choose a delivery time window',
						null,
						'As a shopper I **pick a window** when I will be home.',
						[['Windows come from the carrier’s API, not a fixed list', false]]
					)
				]
			},
			{
				name: 'Review the order',
				stories: [
					s(
						'See an order summary before paying',
						R1,
						'As a shopper I **check what I am about to buy** before I commit.',
						[
							['Shows lines, delivery option, address and total', true],
							['Nothing on this step can change the price', true]
						]
					),
					s(
						'See taxes and shipping in the total',
						R2,
						'As a shopper I see the **full price with no surprises** at the end.',
						[
							['Tax is itemised, not folded into the line prices', false],
							['Tax-inclusive or exclusive display follows the market', false]
						],
						'| Market | Display | Rate |\n| --- | --- | --- |\n| UK | inclusive | 20% |\n| US-CA | exclusive | varies by county |\n| DE | inclusive | 19% |'
					),
					s(
						'Edit the cart from the review step',
						R2,
						'As a shopper I **fix a mistake** without abandoning checkout.',
						[['Returning to the cart preserves the delivery and address choices', false]]
					),
					s(
						'Accept terms and conditions',
						R2,
						'As a merchant I **record that the shopper accepted** the sale terms.',
						[
							['The accepted version is stored with the order', false],
							['Unticked by default; acceptance is never implied', false]
						]
					)
				]
			}
		]
	},
	{
		name: 'Pay',
		steps: [
			{
				name: 'Choose a payment method',
				stories: [
					s('Pay by card', R1, 'As a shopper I **pay with a credit or debit card**.', [
						['Card details are entered in the provider’s hosted fields, never ours', true],
						['Visa, Mastercard and Amex at launch', true],
						['No card number ever reaches our logs', true]
					]),
					s(
						'Pay with a digital wallet',
						R2,
						'As a shopper I **pay with a wallet** so I do not type card details.',
						[
							['Apple Pay and Google Pay, shown only where supported', false],
							['Wallet address overrides the entered delivery address', false]
						]
					),
					s(
						'Pay with a stored card',
						R3,
						'As a returning shopper I **reuse a card** I saved earlier.',
						[
							['Only the provider token is stored, never the PAN', false],
							['Stored cards can be removed from the account page', false]
						]
					),
					s(
						'Pay in instalments',
						null,
						'As a shopper I **spread the cost** over several payments.',
						[['Eligibility is decided by the provider, not by us', false]]
					)
				]
			},
			{
				name: 'Authorise payment',
				stories: [
					s(
						'Complete 3-D Secure',
						R2,
						'As a shopper I complete my bank’s challenge and **return to the order**.',
						[
							['Returning from the challenge resumes the same checkout, not a new one', false],
							['An abandoned challenge leaves the cart intact', false]
						]
					),
					s(
						'See a payment progress indicator',
						R2,
						'As a shopper I can tell the payment is **still working and not stuck**.',
						[
							['The pay button is disabled while a charge is in flight', false],
							['A double submit cannot create two charges', false]
						]
					),
					s(
						'Reserve stock during authorisation',
						R3,
						'As a merchant I **hold stock while payment completes** so it is not double sold.',
						[
							['Reservation expires after `15m` if authorisation never completes', false],
							['Expiry releases stock without cancelling the cart', false]
						]
					)
				]
			},
			{
				name: 'Handle payment failure',
				stories: [
					s(
						'See why a payment declined',
						R2,
						'As a shopper I am told **what went wrong** in terms I can act on.',
						[
							['Provider codes map to plain-language messages', false],
							['Never expose the raw gateway response', false]
						],
						'| Gateway code | Shown to the shopper |\n| --- | --- |\n| `insufficient_funds` | Your card was declined for insufficient funds. |\n| `expired_card` | That card has expired. |\n| `do_not_honour` | Your bank declined the payment. Try another card. |'
					),
					s(
						'Retry with another method',
						R2,
						'As a shopper I **try a different card** without rebuilding my cart.',
						[['The cart and address survive a declined payment', false]]
					),
					s(
						'Recover an abandoned payment by email',
						R3,
						'As a merchant I **invite the shopper back** to a payment they left unfinished.',
						[
							['One email only, sent an hour after abandonment', false],
							['Honours marketing consent and suppresses if the order completes', false]
						]
					)
				]
			},
			{
				name: 'Confirm the order',
				stories: [
					s(
						'See an order confirmation page',
						R1,
						'As a shopper I see that my **order went through** and what its number is.',
						[
							['Order number is human-readable and safe to quote to support', true],
							['Refreshing the page does not re-place the order', true]
						]
					),
					s(
						'Receive an order confirmation email',
						R1,
						'As a shopper I get a **written record** of what I ordered.',
						[
							['Sent within a minute of the order being placed', true],
							['A failed send is retried and never blocks the order', true]
						]
					),
					s(
						'Add the order to a calendar',
						null,
						'As a shopper I **add the expected delivery date** to my calendar.',
						[['Offered as an `.ics` download rather than a calendar integration', false]]
					)
				]
			}
		]
	},
	{
		name: 'Fulfil the Order',
		steps: [
			{
				name: 'Accept the order',
				stories: [
					s(
						'Route an order to a warehouse',
						R1,
						'As an operator I see **new orders in the warehouse** that will ship them.',
						[
							['Routing picks the nearest warehouse holding every line', true],
							['An unroutable order is queued for a human, not dropped', true]
						]
					),
					s(
						'Hold an order for fraud review',
						R2,
						'As a risk analyst I **stop a suspicious order** before it ships.',
						[
							['Held orders are invisible to pickers until released', false],
							['The shopper is not told the reason for the hold', false]
						]
					),
					s(
						'Split an order across warehouses',
						R3,
						'As an operator I **fulfil one order from two locations** when no single one has it all.',
						[
							['The shopper is charged delivery once, not per parcel', false],
							['Each parcel gets its own tracking number under one order', false]
						]
					)
				]
			},
			{
				name: 'Pick and pack',
				stories: [
					s(
						'Print a picking list',
						R1,
						'As a picker I get a **list of what to collect** and where it is.',
						[
							['Lines are ordered by aisle to minimise walking', true],
							['The list prints legibly on a 4-inch label printer', true]
						]
					),
					s(
						'Scan items while packing',
						R2,
						'As a packer I **scan each item** so the wrong thing does not go in the box.',
						[
							['A mismatched scan blocks the pack and explains why', false],
							['Scanning is by barcode, with manual SKU entry as a fallback', false]
						]
					),
					s(
						'Print a packing slip',
						R2,
						'As a packer I **include a slip** so the buyer can check the contents.',
						[['Prices are omitted where the order is flagged as a gift', false]]
					),
					s(
						'Batch pick multiple orders',
						R3,
						'As a picker I **walk the aisles once** for several orders.',
						[
							['Batches are capped at 12 orders', false],
							['Each picked item is assigned to its order at the pack bench', false]
						]
					)
				]
			},
			{
				name: 'Ship the order',
				stories: [
					s('Buy a shipping label', R1, 'As an operator I **generate a label** for the parcel.', [
						['Label includes the tracking number and the service level', true],
						['A voided label is refunded automatically', false]
					]),
					s(
						'Hand off to a carrier',
						R2,
						'As an operator I **record the handover** and the tracking number.',
						[
							['Handover marks the order dispatched and notifies the shopper', false],
							['Manifests are generated per carrier per day', false]
						]
					),
					s(
						'Choose the cheapest compliant carrier',
						R3,
						'As an operator I ship at the **lowest cost that still meets the promised date**.',
						[
							['Never chooses a service that misses the promised date', false],
							['Rate cards are versioned so historic costs stay reproducible', false]
						]
					),
					s(
						'Ship internationally with customs data',
						null,
						'As an operator I **attach customs declarations** to cross-border parcels.',
						[['Requires HS codes and country of origin on every product', false]],
						'> Blocked on the catalogue: HS codes are not modelled yet.'
					)
				]
			},
			{
				name: 'Handle exceptions',
				stories: [
					s(
						'Cancel an unshipped order',
						R2,
						'As a shopper I **cancel while the order has not left** the warehouse.',
						[
							['Cancellation is refused once a label is bought', false],
							['Cancelling refunds in full and releases the stock', false]
						]
					),
					s(
						'Substitute an out-of-stock item',
						R3,
						'As an operator I **offer a replacement** rather than cancel the whole order.',
						[
							['The shopper must accept the substitution before it ships', false],
							['A substitution never increases the price', false]
						]
					),
					s(
						'Re-ship a lost parcel',
						R3,
						'As an agent I **send a replacement** when a parcel is confirmed lost.',
						[['A re-ship is linked to the original order, not a new sale', false]]
					)
				]
			}
		]
	},
	{
		name: 'Receive the Order',
		steps: [
			{
				name: 'Track the delivery',
				stories: [
					s('See order status', R1, 'As a shopper I **check where my order is** in the process.', [
						['Status is one of placed, packed, dispatched, delivered', true],
						['Visible to guests through the order number and email', true]
					]),
					s(
						'Receive a dispatch notification',
						R2,
						'As a shopper I am told **when my parcel leaves** the warehouse.',
						[['The notification carries the tracking number and a carrier link', false]]
					),
					s(
						'Track the parcel on a carrier map',
						R3,
						'As a shopper I **follow the parcel** without leaving the store site.',
						[
							['Tracking is embedded, with a link out as a fallback', false],
							['Carrier outages degrade to the last known status', false]
						]
					),
					s(
						'Get a delivery-day SMS',
						null,
						'As a shopper I get **a text on the morning of delivery**.',
						[['Requires a separate SMS consent, not the email one', false]]
					)
				]
			},
			{
				name: 'Take delivery',
				stories: [
					s(
						'Leave delivery instructions',
						R2,
						'As a shopper I say **where to leave the parcel** if I am out.',
						[
							['Instructions are passed to the carrier at label time', false],
							['Limited to 100 characters, since carriers truncate', false]
						]
					),
					s(
						'Collect from a pickup point',
						R3,
						'As a shopper I **collect from a locker** near me instead of waiting in.',
						[['Pickup points are searched by postcode and shown with opening hours', false]]
					),
					s(
						'Reschedule a delivery',
						null,
						'As a shopper I **move the delivery** to a day that suits me.',
						[['Only where the carrier exposes rescheduling', false]]
					)
				]
			},
			{
				name: 'Check the order',
				stories: [
					s(
						'See what was delivered',
						R1,
						'As a shopper I see the **delivered order and its contents** in my account.',
						[
							['Shows what shipped in each parcel where an order was split', true],
							['Order history is retained for six years for tax purposes', true]
						]
					),
					s(
						'Report a missing item',
						R2,
						'As a shopper I tell the merchant **something in the order never arrived**.',
						[
							['Reporting opens a support case linked to the order line', false],
							['Only reportable within 14 days of delivery', false]
						]
					),
					s(
						'Report damage with photos',
						R3,
						'As a shopper I **send photos of a damaged item** so a claim can be settled quickly.',
						[
							['Up to five images, 10MB each', false],
							['Images are retained only for the life of the claim', false]
						]
					)
				]
			}
		]
	},
	{
		name: 'Return & Refund',
		steps: [
			{
				name: 'Start a return',
				stories: [
					s(
						'See the return policy',
						R1,
						'As a shopper I know **what I can return and by when** before I buy.',
						[
							['Policy is linked from the product page and the checkout', true],
							['Non-returnable products say so on the listing', true]
						]
					),
					s(
						'Request a return online',
						R2,
						'As a shopper I **start a return myself** without contacting support.',
						[
							['Only delivered lines within the return window are eligible', false],
							['A return can cover part of an order', false]
						]
					),
					s(
						'Choose a return reason',
						R2,
						'As a merchant I **learn why items come back** so I can fix the cause.',
						[
							['Reasons are a fixed list plus optional free text', false],
							['Reason is reportable by product and by category', false]
						]
					),
					s(
						'Request an exchange instead',
						R3,
						'As a shopper I **swap for another size** rather than get money back.',
						[['The replacement is reserved when the return is booked', false]]
					)
				]
			},
			{
				name: 'Send the item back',
				stories: [
					s(
						'Print a return label',
						R2,
						'As a shopper I get a **prepaid label** so returning is easy.',
						[
							['Label cost is deducted from the refund where the policy says so', false],
							['Labels expire after 28 days', false]
						]
					),
					s(
						'Drop off at a return point',
						R3,
						'As a shopper I **hand the parcel in** somewhere convenient.',
						[['Drop-off scan starts the refund clock, not receipt at the warehouse', false]]
					),
					s(
						'Book a return pickup',
						null,
						'As a shopper I have a **bulky return collected** from my home.',
						[['Only for items over a weight threshold', false]]
					)
				]
			},
			{
				name: 'Get refunded',
				stories: [
					s(
						'See the refund status',
						R2,
						'As a shopper I **see where my refund is** instead of chasing it.',
						[
							['Status distinguishes received, approved, and paid', false],
							['Shows the expected working days for the payment method', false]
						]
					),
					s(
						'Receive the refund to the original method',
						R2,
						'As a shopper **my money goes back the way it came**.',
						[
							['Refund never exceeds the amount captured', false],
							['Partial refunds are allowed down to a single line', false]
						]
					),
					s(
						'Take store credit instead',
						R3,
						'As a shopper I **take credit now** rather than wait for a bank refund.',
						[['Credit is optional and never the default', false]]
					)
				]
			}
		]
	},
	{
		name: 'Get Help',
		steps: [
			{
				name: 'Find answers',
				stories: [
					s(
						'Browse help articles',
						R1,
						'As a shopper I **read the common answers** before contacting anyone.',
						[
							['Articles are grouped by topic and readable without signing in', true],
							['Each article says when it was last reviewed', false]
						]
					),
					s(
						'Search the help centre',
						R2,
						'As a shopper I **search help by keyword** so I find the right article.',
						[['A no-result search offers the contact form rather than an empty page', false]]
					),
					s(
						'Ask a support chatbot',
						R3,
						'As a shopper I get an **instant answer to a simple question** at any hour.',
						[
							['The bot hands off to a human when confidence is low', false],
							['It never states order-specific facts it cannot verify', false]
						],
						'> The handoff rule is the whole design: a bot that guesses about someone’s order costs more trust than it saves in tickets.'
					)
				]
			},
			{
				name: 'Contact support',
				stories: [
					s(
						'Email support from an order',
						R1,
						'As a shopper I **raise a question with my order already attached**.',
						[
							['The order reference is attached automatically', true],
							['An acknowledgement is sent with a case number', true]
						]
					),
					s(
						'Chat with an agent',
						R3,
						'As a shopper I **talk to a person** without waiting for an email reply.',
						[
							['Chat is offered only inside staffed hours', false],
							['A transcript is attached to the case when the chat ends', false]
						]
					),
					s(
						'Request a callback',
						null,
						'As a shopper I **ask to be phoned** instead of holding in a queue.',
						[['Callback windows reflect actual agent availability', false]]
					)
				]
			},
			{
				name: 'Resolve a case',
				stories: [
					s(
						'See case history',
						R2,
						'As a shopper I see **everything already said** so I do not repeat myself.',
						[
							['History shows both sides in one thread', false],
							['Internal agent notes are never shown to the shopper', false]
						]
					),
					s(
						'Get a goodwill credit',
						R3,
						'As an agent I **compensate a shopper** for a service failure within my limit.',
						[
							['Each agent has a per-case limit set by their role', false],
							['Every credit records who issued it and why', false]
						]
					),
					s(
						'Escalate to a supervisor',
						null,
						'As an agent I **hand a case that exceeds my authority** to a supervisor.',
						[['Escalation carries the full history rather than starting over', false]]
					)
				]
			}
		]
	},
	{
		name: 'Manage the Catalogue',
		steps: [
			{
				name: 'Create products',
				stories: [
					s('Create a product', R1, 'As a merchandiser I **add a product** so it can be sold.', [
						['Title, SKU and price are required to save a draft', true],
						['SKU is unique across the catalogue', true],
						['A product is not visible until it is published', true]
					]),
					s('Upload product images', R1, 'As a merchandiser I **attach photos** to a listing.', [
						['Accepts JPEG, PNG and WebP up to 10MB', true],
						['Derivatives are generated on upload, not on request', true]
					]),
					s(
						'Define product variants',
						R2,
						'As a merchandiser I **model sizes and colours** as variants of one product.',
						[
							['A variant is the unit that carries SKU, price and stock', false],
							['Options are ordered as the merchandiser sets them, not alphabetically', false]
						]
					),
					s(
						'Import products from a CSV',
						R3,
						'As a merchandiser I **load a supplier catalogue** in one go.',
						[
							['The import is previewed before anything is written', false],
							['A row that fails validation does not abort the whole file', false],
							['Every import is reversible for 24 hours', false]
						],
						'Required columns: `sku`, `title`, `price`, `currency`, `stock`. Everything else is optional and ignored if unrecognised.'
					)
				]
			},
			{
				name: 'Price products',
				stories: [
					s('Set a list price', R1, 'As a merchandiser I **set what a product costs**.', [
						['Prices are stored in minor units to avoid floating point error', true],
						['A price change is recorded with who made it and when', true]
					]),
					s(
						'Schedule a sale price',
						R2,
						'As a merchandiser I set a **discount that starts and ends** on given dates.',
						[
							['Scheduled prices take effect without anyone being present', false],
							['Overlapping schedules are rejected at save time, not silently resolved', false]
						]
					),
					s(
						'Set prices per market',
						R3,
						'As a merchandiser I **price differently by country and currency**.',
						[
							['A market without an explicit price falls back to the default list', false],
							['Rounding rules are per currency', false]
						]
					),
					s(
						'Run a price experiment',
						null,
						'As an analyst I **test two price points** and compare conversion.',
						[['Assignment is sticky per shopper for the life of the experiment', false]],
						'> Legally fraught in some markets — check before scheduling any work here.'
					)
				]
			},
			{
				name: 'Merchandise the store',
				stories: [
					s(
						'Assign products to categories',
						R1,
						'As a merchandiser I **place products where shoppers will look** for them.',
						[
							['A product can sit in several categories', true],
							['One category is marked primary, for breadcrumbs and canonical URLs', true]
						]
					),
					s(
						'Curate a collection',
						R2,
						'As a merchandiser I **group products into a themed collection**.',
						[
							['Collections are either hand-picked or rule-based, not both', false],
							['A collection can be scheduled to publish and unpublish', false]
						]
					),
					s(
						'Pin products to the top of a category',
						R3,
						'As a merchandiser I **promote specific products** above the default order.',
						[['Pins are per market and expire on a date', false]]
					),
					s(
						'Personalise recommendations',
						null,
						'As a merchandiser I show **recommendations based on browsing history**.',
						[['Recommendations respect consent and are disabled without it', false]]
					)
				]
			},
			{
				name: 'Manage inventory',
				stories: [
					s('Set stock levels', R1, 'As an operator I **record how many of each item** we hold.', [
						['Stock is per variant per location', true],
						['Adjustments require a reason code', true]
					]),
					s(
						'Receive a purchase order',
						R2,
						'As an operator I **book in a delivery** from a supplier.',
						[
							['Partial receipts are supported and leave the PO open', false],
							['Over-receipt requires a supervisor override', false]
						]
					),
					s('See low-stock alerts', R2, 'As a buyer I am **warned before a line sells out**.', [
						['The threshold is per product, defaulting to the category’s', false],
						['Alerts are digested daily rather than sent per event', false]
					]),
					s(
						'Reconcile a stock count',
						R3,
						'As an operator I **correct the system to match a physical count**.',
						[
							['Every correction is an auditable movement, never an in-place edit', false],
							['Counts can be scoped to one aisle without freezing the warehouse', false]
						]
					)
				]
			}
		]
	},
	{
		name: 'Run Store Operations',
		steps: [
			{
				name: 'Handle orders',
				stories: [
					s('Search orders', R1, 'As an agent I **find an order** by number, email, or name.', [
						['Partial matches on email and name', true],
						['Results are scoped to what the agent’s role may see', true]
					]),
					s(
						'Refund an order manually',
						R2,
						'As an agent I **issue a full or partial refund** for a resolved complaint.',
						[
							['Refunds are capped at the captured amount', false],
							['Every refund records the agent and the reason', false]
						]
					),
					s(
						'Edit an order before dispatch',
						R3,
						'As an agent I **change an address or item** while the order is still editable.',
						[
							['Editing is refused once a label is bought', false],
							['A price-changing edit requires the shopper’s agreement', false]
						]
					)
				]
			},
			{
				name: 'Manage customers',
				stories: [
					s(
						'View a customer profile',
						R2,
						'As an agent I see a shopper’s **orders and cases in one place**.',
						[
							['Payment details are never shown, only the method type', false],
							['Viewing a profile is itself audited', false]
						]
					),
					s(
						'Merge duplicate customers',
						R3,
						'As an agent I **combine two records** for the same person.',
						[
							['Orders and cases move to the surviving record', false],
							['A merge is reversible for 30 days', false]
						]
					),
					s(
						'Honour a data deletion request',
						R3,
						'As a data officer I **erase a shopper’s personal data** on request.',
						[
							['Order records are anonymised, not deleted, to preserve tax history', false],
							['Deletion completes within 30 days and is evidenced', false]
						],
						'See [the retention policy](https://example.com/legal/retention) for which fields survive anonymisation and why.'
					)
				]
			},
			{
				name: 'Configure the store',
				stories: [
					s(
						'Configure tax rules',
						R2,
						'As a finance owner I **set the tax applied** per market and product type.',
						[
							['Rules are versioned so a past order can be re-priced as it was', false],
							['A market without a rule blocks checkout rather than charging zero', false]
						]
					),
					s(
						'Configure shipping zones and rates',
						R2,
						'As an operator I **set what delivery costs where**.',
						[
							['Zones are defined by country and postcode prefix', false],
							['Rates can be flat, weight-based, or free above a threshold', false]
						]
					),
					s(
						'Manage staff roles and permissions',
						R3,
						'As an administrator I **control who can refund, edit, and publish**.',
						[
							['Permissions are grouped into roles, not assigned per person', false],
							['A role change takes effect on the staff member’s next request', false]
						]
					),
					s(
						'Configure store opening hours',
						null,
						'As a store manager I **set collection hours** per location.',
						[['Hours drive click-and-collect availability, including holidays', false]]
					)
				]
			}
		]
	},
	{
		name: 'Grow the Business',
		steps: [
			{
				name: 'Measure performance',
				stories: [
					s('See daily sales', R2, 'As an owner I see **yesterday’s revenue and order count**.', [
						['Figures exclude cancelled and fully refunded orders', false],
						['The day boundary follows the store’s timezone, not UTC', false]
					]),
					s(
						'See a conversion funnel',
						R3,
						'As an analyst I see **where shoppers drop out** between browse and pay.',
						[
							['Steps are view, add to cart, begin checkout, pay', false],
							['Bot traffic is excluded before the funnel is computed', false]
						]
					),
					s(
						'Export a finance report',
						R3,
						'As a finance owner I **export sales, tax, and refunds** for the ledger.',
						[
							['CSV export, reconcilable to the payment provider’s settlement', false],
							['An export of a closed period always returns identical figures', false]
						]
					),
					s(
						'See a cohort retention view',
						null,
						'As an analyst I see **how repeat purchase changes** by acquisition month.',
						[['Cohorts are by first order month, not by registration date', false]]
					)
				]
			},
			{
				name: 'Market to shoppers',
				stories: [
					s(
						'Manage marketing consent',
						R2,
						'As a shopper I **control which messages I receive**.',
						[
							['Consent is opt-in and recorded with a timestamp and source', false],
							['Unsubscribing takes effect immediately, not at the next send', false],
							['Transactional email is never suppressed by a marketing opt-out', false]
						]
					),
					s(
						'Send an abandoned-cart email',
						R3,
						'As a marketer I **remind shoppers of a cart they left behind**.',
						[
							['Sent once, and only with consent', false],
							['Suppressed if the shopper completes the order first', false]
						]
					),
					s(
						'Send a promotional campaign',
						R3,
						'As a marketer I **email a segment** about an offer.',
						[
							['A campaign must be previewed and approved before sending', false],
							['Send rate is throttled to protect deliverability', false]
						]
					)
				]
			},
			{
				name: 'Reward loyalty',
				stories: [
					s('Earn loyalty points', R3, 'As a member I **earn points on every order**.', [
						['Points accrue on the paid amount, excluding delivery', false],
						['Points are reversed when an order is refunded', false]
					]),
					s('Redeem loyalty points', R3, 'As a member I **spend points against an order total**.', [
						['Redemption is capped at a percentage of the order', false],
						['Points are deducted on capture, not on order placement', false]
					]),
					s(
						'See tier status',
						null,
						'As a member I see **my tier and what the next one gives me**.',
						[['Tier is calculated on a rolling 12-month spend', false]]
					)
				]
			}
		]
	}
];

/**
 * Builds the sample map. Ranks come out of the domain's append semantics, so
 * activities, steps, slices, and the stories within each (step, slice) scope
 * end up in blueprint order.
 */
export function buildRetailCommerceMap(createdAt: Date = new Date()): StoryMap {
	let map = createStoryMap(RETAIL_COMMERCE_MAP_NAME, createdAt);

	const sliceIdByName = new Map<string, ReturnType<typeof addSlice>['slice']['id']>();
	for (const name of retailCommerceSliceNames) {
		const added = addSlice(map, name);
		map = added.map;
		sliceIdByName.set(name, added.slice.id);
	}

	for (const activityBlueprint of retailCommerceBlueprint) {
		const addedActivity = addActivity(map, activityBlueprint.name);
		map = addedActivity.map;

		for (const stepBlueprint of activityBlueprint.steps) {
			const addedStep = addStep(map, addedActivity.activity.id, stepBlueprint.name);
			map = addedStep.map;

			for (const storyBlueprint of stepBlueprint.stories) {
				const sliceId =
					storyBlueprint.slice === null ? null : sliceIdByName.get(storyBlueprint.slice)!;
				map = addStory(map, addedStep.step.id, storyBlueprint.title, {
					description: storyDescription(storyBlueprint),
					sliceId
				}).map;
			}
		}
	}

	return map;
}
