/**
 * A sample user story map for a retail commerce system, big enough to
 * exercise the board at realistic scale: 12 activities, 43 steps, and 157
 * stories across three release slices plus an unsliced backlog band. Those
 * counts are pinned by this module's test, because the READMEs quote them.
 *
 * The blueprint below is plain data; `buildRetailCommerceMap` turns it into
 * a `StoryMap` using only the pure domain functions, so this module stays
 * free of Drizzle and SvelteKit and unit-tests without a database. The
 * script that writes it to SQLite is `scripts/seed.ts`.
 */

import {
	addActivity,
	addSlice,
	addStep,
	addStory,
	createStoryMap,
	type StoryMap
} from '$lib/domain/story-map';

export interface StoryBlueprint {
	title: string;
	/** The name of a slice in `retailCommerceSliceNames`, or `null` for the
	 * unsliced band — ideas parked below every release. */
	slice: string | null;
	description: string;
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

/** Terser than an object literal per story, so the shape of the map stays
 * readable at a glance. */
function s(title: string, slice: string | null, description: string): StoryBlueprint {
	return { title, slice, description };
}

export const retailCommerceBlueprint: ActivityBlueprint[] = [
	{
		name: 'Discover Products',
		steps: [
			{
				name: 'Land on the store',
				stories: [
					s('See the homepage', R1, 'As a shopper I see a storefront so I know what is sold here.'),
					s(
						'See featured collections',
						R2,
						'As a shopper I see curated collections so I can start browsing without searching.'
					),
					s(
						'See a localised storefront',
						R3,
						'As a shopper abroad I see my currency and language so prices make sense.'
					),
					s(
						'See a personalised hero banner',
						null,
						'As a returning shopper I see a banner tied to what I browsed last.'
					)
				]
			},
			{
				name: 'Browse the catalogue',
				stories: [
					s(
						'Browse a category',
						R1,
						'As a shopper I open a category so I can see the products in it.'
					),
					s(
						'Page through a long category',
						R1,
						'As a shopper I move through pages of results so I can see more than the first screen.'
					),
					s(
						'See breadcrumb navigation',
						R2,
						'As a shopper I see where I am in the category tree so I can go back up.'
					),
					s(
						'See a merchandised category order',
						R3,
						'As a merchandiser I control the default order of a category so best sellers lead.'
					)
				]
			},
			{
				name: 'Search',
				stories: [
					s(
						'Search by keyword',
						R1,
						'As a shopper I type what I want so I can find it without browsing.'
					),
					s(
						'See typo-tolerant results',
						R2,
						'As a shopper I still get results when I misspell a product name.'
					),
					s(
						'See search-as-you-type suggestions',
						R3,
						'As a shopper I see suggestions while typing so I reach a product in fewer keystrokes.'
					),
					s(
						'Search by image',
						null,
						'As a shopper I upload a photo to find visually similar products.'
					)
				]
			},
			{
				name: 'Filter and sort',
				stories: [
					s(
						'Filter by price',
						R1,
						'As a shopper I narrow results to a price range so I only see what I can afford.'
					),
					s(
						'Filter by size and colour',
						R2,
						'As a shopper I filter to the variants I would actually buy.'
					),
					s(
						'Sort by price and popularity',
						R2,
						'As a shopper I reorder results so the most relevant come first.'
					),
					s(
						'Save a filter set',
						null,
						'As a frequent shopper I save a filter combination so I can reuse it.'
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
						'As a shopper I see photos of the product so I know what I am buying.'
					),
					s(
						'Read the product description',
						R1,
						'As a shopper I read the details and specifications so I can judge fit.'
					),
					s(
						'Zoom a product photo',
						R2,
						'As a shopper I zoom into a photo so I can inspect materials and finish.'
					),
					s(
						'Watch a product video',
						R3,
						'As a shopper I watch the product in use so I understand its scale.'
					),
					s(
						'View the product in 3D',
						null,
						'As a shopper I rotate a 3D model so I can see every side.'
					)
				]
			},
			{
				name: 'Compare options',
				stories: [
					s(
						'Choose a size variant',
						R1,
						'As a shopper I pick a size so I add the right item to my cart.'
					),
					s(
						'Choose a colour variant',
						R2,
						'As a shopper I switch colour and see matching photos and stock.'
					),
					s(
						'Compare two products side by side',
						R3,
						'As a shopper I compare specifications so I can decide between two candidates.'
					),
					s(
						'See a size-fit recommendation',
						null,
						'As a shopper I get a size suggestion from my past orders so I return less.'
					)
				]
			},
			{
				name: 'Read reviews',
				stories: [
					s(
						'Read customer reviews',
						R2,
						'As a shopper I read what other buyers said so I can trust the listing.'
					),
					s(
						'Sort reviews by rating',
						R2,
						'As a shopper I read the critical reviews first so I see the downsides.'
					),
					s(
						'Write a review after delivery',
						R3,
						'As a buyer I review a product I received so others benefit.'
					),
					s(
						'See verified-purchase badges',
						R3,
						'As a shopper I can tell which reviews come from real orders.'
					),
					s(
						'Ask the community a question',
						null,
						'As a shopper I ask a question about the product and get answers from owners.'
					)
				]
			},
			{
				name: 'Check availability',
				stories: [
					s(
						'See stock status',
						R1,
						'As a shopper I see whether an item is in stock before I try to buy it.'
					),
					s(
						'See estimated delivery date',
						R2,
						'As a shopper I see when it would arrive so I can plan.'
					),
					s(
						'Check availability in a nearby store',
						R3,
						'As a shopper I see which local store has the item today.'
					),
					s(
						'Join a back-in-stock waitlist',
						R3,
						'As a shopper I ask to be told when a sold-out item returns.'
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
						'As a shopper I add a product so I can buy it later in the session.'
					),
					s(
						'Add from a category page',
						R2,
						'As a shopper I add a simple product without opening its page.'
					),
					s(
						'See a cart confirmation',
						R2,
						'As a shopper I get feedback that the item landed in my cart.'
					),
					s(
						'Add a gift message',
						null,
						'As a shopper I attach a gift note so the recipient knows who sent it.'
					)
				]
			},
			{
				name: 'Review the cart',
				stories: [
					s(
						'See cart line items and total',
						R1,
						'As a shopper I see everything in my cart and what it costs.'
					),
					s(
						'Change an item quantity',
						R1,
						'As a shopper I adjust how many I want without removing and re-adding.'
					),
					s('Remove an item', R1, 'As a shopper I take something out of my cart.'),
					s(
						'See a low-stock warning in the cart',
						R3,
						'As a shopper I am warned when an item in my cart is nearly gone.'
					)
				]
			},
			{
				name: 'Save for later',
				stories: [
					s('Move an item to a wishlist', R2, 'As a shopper I park an item I am not ready to buy.'),
					s(
						'Restore a saved cart on sign-in',
						R3,
						'As a returning shopper my cart is still there on another device.'
					),
					s(
						'Share a wishlist',
						null,
						'As a shopper I send my wishlist to someone buying me a gift.'
					)
				]
			},
			{
				name: 'Apply a promotion',
				stories: [
					s('Enter a promo code', R2, 'As a shopper I redeem a code I was sent.'),
					s(
						'See the discount on the total',
						R2,
						'As a shopper I see exactly what the code saved me.'
					),
					s(
						'See automatic bundle pricing',
						R3,
						'As a shopper I get the bundle price without hunting for a code.'
					),
					s(
						'Stack loyalty points with a promo',
						null,
						'As a member I combine points with a promotion where the rules allow it.'
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
						'As a first-time shopper I buy without creating an account.'
					),
					s(
						'Sign in to check out',
						R2,
						'As a returning shopper I sign in so my details are prefilled.'
					),
					s(
						'Create an account during checkout',
						R2,
						'As a shopper I save my details at the end without restarting checkout.'
					),
					s(
						'Check out with a one-time link',
						null,
						'As a shopper I resume a checkout from a link instead of a password.'
					)
				]
			},
			{
				name: 'Enter delivery details',
				stories: [
					s('Enter a delivery address', R1, 'As a shopper I say where the order should go.'),
					s(
						'Autocomplete an address',
						R2,
						'As a shopper I pick my address from suggestions so I mistype less.'
					),
					s(
						'Choose a saved address',
						R2,
						'As a returning shopper I reuse an address from a previous order.'
					),
					s(
						'Enter a separate billing address',
						R2,
						'As a shopper I bill to a different address than I ship to.'
					)
				]
			},
			{
				name: 'Choose a delivery option',
				stories: [
					s(
						'Choose standard delivery',
						R1,
						'As a shopper I take the default delivery option and its cost.'
					),
					s('Choose express delivery', R2, 'As a shopper I pay more to get it sooner.'),
					s(
						'Choose click-and-collect',
						R3,
						'As a shopper I collect from a store instead of paying for delivery.'
					),
					s(
						'Choose a delivery time window',
						null,
						'As a shopper I pick a window when I will be home.'
					)
				]
			},
			{
				name: 'Review the order',
				stories: [
					s(
						'See an order summary before paying',
						R1,
						'As a shopper I check what I am about to buy before I commit.'
					),
					s(
						'See taxes and shipping in the total',
						R2,
						'As a shopper I see the full price with no surprises at the end.'
					),
					s(
						'Edit the cart from the review step',
						R2,
						'As a shopper I fix a mistake without abandoning checkout.'
					),
					s(
						'Accept terms and conditions',
						R2,
						'As a merchant I record that the shopper accepted the sale terms.'
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
					s('Pay by card', R1, 'As a shopper I pay with a credit or debit card.'),
					s(
						'Pay with a digital wallet',
						R2,
						'As a shopper I pay with a wallet so I do not type card details.'
					),
					s('Pay with a stored card', R3, 'As a returning shopper I reuse a card I saved earlier.'),
					s('Pay in instalments', null, 'As a shopper I spread the cost over several payments.')
				]
			},
			{
				name: 'Authorise payment',
				stories: [
					s(
						'Complete 3-D Secure',
						R2,
						'As a shopper I complete my bank’s challenge and return to the order.'
					),
					s(
						'See a payment progress indicator',
						R2,
						'As a shopper I can tell the payment is still working and not stuck.'
					),
					s(
						'Reserve stock during authorisation',
						R3,
						'As a merchant I hold stock while payment completes so it is not double sold.'
					)
				]
			},
			{
				name: 'Handle payment failure',
				stories: [
					s(
						'See why a payment declined',
						R2,
						'As a shopper I am told what went wrong in terms I can act on.'
					),
					s(
						'Retry with another method',
						R2,
						'As a shopper I try a different card without rebuilding my cart.'
					),
					s(
						'Recover an abandoned payment by email',
						R3,
						'As a merchant I invite the shopper back to a payment they left unfinished.'
					)
				]
			},
			{
				name: 'Confirm the order',
				stories: [
					s(
						'See an order confirmation page',
						R1,
						'As a shopper I see that my order went through and what its number is.'
					),
					s(
						'Receive an order confirmation email',
						R1,
						'As a shopper I get a written record of what I ordered.'
					),
					s(
						'Add the order to a calendar',
						null,
						'As a shopper I add the expected delivery date to my calendar.'
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
						'As an operator I see new orders in the warehouse that will ship them.'
					),
					s(
						'Hold an order for fraud review',
						R2,
						'As a risk analyst I stop a suspicious order before it ships.'
					),
					s(
						'Split an order across warehouses',
						R3,
						'As an operator I fulfil one order from two locations when no single one has it all.'
					)
				]
			},
			{
				name: 'Pick and pack',
				stories: [
					s(
						'Print a picking list',
						R1,
						'As a picker I get a list of what to collect and where it is.'
					),
					s(
						'Scan items while packing',
						R2,
						'As a packer I scan each item so the wrong thing does not go in the box.'
					),
					s(
						'Print a packing slip',
						R2,
						'As a packer I include a slip so the buyer can check the contents.'
					),
					s(
						'Batch pick multiple orders',
						R3,
						'As a picker I walk the aisles once for several orders.'
					)
				]
			},
			{
				name: 'Ship the order',
				stories: [
					s('Buy a shipping label', R1, 'As an operator I generate a label for the parcel.'),
					s(
						'Hand off to a carrier',
						R2,
						'As an operator I record the handover and the tracking number.'
					),
					s(
						'Choose the cheapest compliant carrier',
						R3,
						'As an operator I ship at the lowest cost that still meets the promised date.'
					),
					s(
						'Ship internationally with customs data',
						null,
						'As an operator I attach customs declarations to cross-border parcels.'
					)
				]
			},
			{
				name: 'Handle exceptions',
				stories: [
					s(
						'Cancel an unshipped order',
						R2,
						'As a shopper I cancel while the order has not left the warehouse.'
					),
					s(
						'Substitute an out-of-stock item',
						R3,
						'As an operator I offer a replacement rather than cancel the whole order.'
					),
					s(
						'Re-ship a lost parcel',
						R3,
						'As an agent I send a replacement when a parcel is confirmed lost.'
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
					s('See order status', R1, 'As a shopper I check where my order is in the process.'),
					s(
						'Receive a dispatch notification',
						R2,
						'As a shopper I am told when my parcel leaves the warehouse.'
					),
					s(
						'Track the parcel on a carrier map',
						R3,
						'As a shopper I follow the parcel without leaving the store site.'
					),
					s('Get a delivery-day SMS', null, 'As a shopper I get a text on the morning of delivery.')
				]
			},
			{
				name: 'Take delivery',
				stories: [
					s(
						'Leave delivery instructions',
						R2,
						'As a shopper I say where to leave the parcel if I am out.'
					),
					s(
						'Collect from a pickup point',
						R3,
						'As a shopper I collect from a locker near me instead of waiting in.'
					),
					s(
						'Reschedule a delivery',
						null,
						'As a shopper I move the delivery to a day that suits me.'
					)
				]
			},
			{
				name: 'Check the order',
				stories: [
					s(
						'See what was delivered',
						R1,
						'As a shopper I see the delivered order and its contents in my account.'
					),
					s(
						'Report a missing item',
						R2,
						'As a shopper I tell the merchant something in the order never arrived.'
					),
					s(
						'Report damage with photos',
						R3,
						'As a shopper I send photos of a damaged item so a claim can be settled quickly.'
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
						'As a shopper I know what I can return and by when before I buy.'
					),
					s(
						'Request a return online',
						R2,
						'As a shopper I start a return myself without contacting support.'
					),
					s(
						'Choose a return reason',
						R2,
						'As a merchant I learn why items come back so I can fix the cause.'
					),
					s(
						'Request an exchange instead',
						R3,
						'As a shopper I swap for another size rather than get money back.'
					)
				]
			},
			{
				name: 'Send the item back',
				stories: [
					s('Print a return label', R2, 'As a shopper I get a prepaid label so returning is easy.'),
					s(
						'Drop off at a return point',
						R3,
						'As a shopper I hand the parcel in somewhere convenient.'
					),
					s(
						'Book a return pickup',
						null,
						'As a shopper I have a bulky return collected from my home.'
					)
				]
			},
			{
				name: 'Get refunded',
				stories: [
					s(
						'See the refund status',
						R2,
						'As a shopper I see where my refund is instead of chasing it.'
					),
					s(
						'Receive the refund to the original method',
						R2,
						'As a shopper my money goes back the way it came.'
					),
					s(
						'Take store credit instead',
						R3,
						'As a shopper I take credit now rather than wait for a bank refund.'
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
						'As a shopper I read the common answers before contacting anyone.'
					),
					s(
						'Search the help centre',
						R2,
						'As a shopper I search help by keyword so I find the right article.'
					),
					s(
						'Ask a support chatbot',
						R3,
						'As a shopper I get an instant answer to a simple question at any hour.'
					)
				]
			},
			{
				name: 'Contact support',
				stories: [
					s(
						'Email support from an order',
						R1,
						'As a shopper I raise a question with my order already attached.'
					),
					s(
						'Chat with an agent',
						R3,
						'As a shopper I talk to a person without waiting for an email reply.'
					),
					s(
						'Request a callback',
						null,
						'As a shopper I ask to be phoned instead of holding in a queue.'
					)
				]
			},
			{
				name: 'Resolve a case',
				stories: [
					s(
						'See case history',
						R2,
						'As a shopper I see everything already said so I do not repeat myself.'
					),
					s(
						'Get a goodwill credit',
						R3,
						'As an agent I compensate a shopper for a service failure within my limit.'
					),
					s(
						'Escalate to a supervisor',
						null,
						'As an agent I hand a case that exceeds my authority to a supervisor.'
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
					s('Create a product', R1, 'As a merchandiser I add a product so it can be sold.'),
					s('Upload product images', R1, 'As a merchandiser I attach photos to a listing.'),
					s(
						'Define product variants',
						R2,
						'As a merchandiser I model sizes and colours as variants of one product.'
					),
					s(
						'Import products from a CSV',
						R3,
						'As a merchandiser I load a supplier catalogue in one go.'
					)
				]
			},
			{
				name: 'Price products',
				stories: [
					s('Set a list price', R1, 'As a merchandiser I set what a product costs.'),
					s(
						'Schedule a sale price',
						R2,
						'As a merchandiser I set a discount that starts and ends on given dates.'
					),
					s(
						'Set prices per market',
						R3,
						'As a merchandiser I price differently by country and currency.'
					),
					s(
						'Run a price experiment',
						null,
						'As an analyst I test two price points and compare conversion.'
					)
				]
			},
			{
				name: 'Merchandise the store',
				stories: [
					s(
						'Assign products to categories',
						R1,
						'As a merchandiser I place products where shoppers will look for them.'
					),
					s(
						'Curate a collection',
						R2,
						'As a merchandiser I group products into a themed collection.'
					),
					s(
						'Pin products to the top of a category',
						R3,
						'As a merchandiser I promote specific products above the default order.'
					),
					s(
						'Personalise recommendations',
						null,
						'As a merchandiser I show recommendations based on browsing history.'
					)
				]
			},
			{
				name: 'Manage inventory',
				stories: [
					s('Set stock levels', R1, 'As an operator I record how many of each item we hold.'),
					s('Receive a purchase order', R2, 'As an operator I book in a delivery from a supplier.'),
					s('See low-stock alerts', R2, 'As a buyer I am warned before a line sells out.'),
					s(
						'Reconcile a stock count',
						R3,
						'As an operator I correct the system to match a physical count.'
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
					s('Search orders', R1, 'As an agent I find an order by number, email, or name.'),
					s(
						'Refund an order manually',
						R2,
						'As an agent I issue a full or partial refund for a resolved complaint.'
					),
					s(
						'Edit an order before dispatch',
						R3,
						'As an agent I change an address or item while the order is still editable.'
					)
				]
			},
			{
				name: 'Manage customers',
				stories: [
					s(
						'View a customer profile',
						R2,
						'As an agent I see a shopper’s orders and cases in one place.'
					),
					s(
						'Merge duplicate customers',
						R3,
						'As an agent I combine two records for the same person.'
					),
					s(
						'Honour a data deletion request',
						R3,
						'As a data officer I erase a shopper’s personal data on request.'
					)
				]
			},
			{
				name: 'Configure the store',
				stories: [
					s(
						'Configure tax rules',
						R2,
						'As a finance owner I set the tax applied per market and product type.'
					),
					s(
						'Configure shipping zones and rates',
						R2,
						'As an operator I set what delivery costs where.'
					),
					s(
						'Manage staff roles and permissions',
						R3,
						'As an administrator I control who can refund, edit, and publish.'
					),
					s(
						'Configure store opening hours',
						null,
						'As a store manager I set collection hours per location.'
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
					s('See daily sales', R2, 'As an owner I see yesterday’s revenue and order count.'),
					s(
						'See a conversion funnel',
						R3,
						'As an analyst I see where shoppers drop out between browse and pay.'
					),
					s(
						'Export a finance report',
						R3,
						'As a finance owner I export sales, tax, and refunds for the ledger.'
					),
					s(
						'See a cohort retention view',
						null,
						'As an analyst I see how repeat purchase changes by acquisition month.'
					)
				]
			},
			{
				name: 'Market to shoppers',
				stories: [
					s('Manage marketing consent', R2, 'As a shopper I control which messages I receive.'),
					s(
						'Send an abandoned-cart email',
						R3,
						'As a marketer I remind shoppers of a cart they left behind.'
					),
					s('Send a promotional campaign', R3, 'As a marketer I email a segment about an offer.')
				]
			},
			{
				name: 'Reward loyalty',
				stories: [
					s('Earn loyalty points', R3, 'As a member I earn points on every order.'),
					s('Redeem loyalty points', R3, 'As a member I spend points against an order total.'),
					s('See tier status', null, 'As a member I see my tier and what the next one gives me.')
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
					description: storyBlueprint.description,
					sliceId
				}).map;
			}
		}
	}

	return map;
}
