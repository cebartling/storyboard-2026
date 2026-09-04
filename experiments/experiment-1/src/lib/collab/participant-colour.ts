/**
 * A stable colour per person, so the same person is the same colour for
 * everyone looking at the board — and their cursor matches their avatar.
 *
 * Keyed on the **user id**, not the client id and not join order. Join order
 * differs per viewer, which would give one person a different colour on each
 * screen and make "the blue cursor" meaningless as a thing to say out loud; the
 * client id is per tab, so a colleague with two windows open would be two
 * colours.
 *
 * Note this is a derived colour, not a profile setting: nobody picks it, and
 * with eight of them two people can collide. It is a hint, not an identifier —
 * the name is on the avatar and beside the cursor, and that is what actually
 * tells people apart.
 */
const PALETTE = [
	{ bg: 'bg-sky-500', text: 'text-sky-500', ring: 'ring-sky-500' },
	{ bg: 'bg-violet-500', text: 'text-violet-500', ring: 'ring-violet-500' },
	{ bg: 'bg-emerald-500', text: 'text-emerald-500', ring: 'ring-emerald-500' },
	{ bg: 'bg-amber-500', text: 'text-amber-500', ring: 'ring-amber-500' },
	{ bg: 'bg-rose-500', text: 'text-rose-500', ring: 'ring-rose-500' },
	{ bg: 'bg-cyan-500', text: 'text-cyan-500', ring: 'ring-cyan-500' },
	{ bg: 'bg-indigo-500', text: 'text-indigo-500', ring: 'ring-indigo-500' },
	{ bg: 'bg-teal-500', text: 'text-teal-500', ring: 'ring-teal-500' }
];

export function participantColour(key: string): (typeof PALETTE)[number] {
	let hash = 0;
	for (let i = 0; i < key.length; i += 1) {
		hash = (hash * 31 + key.charCodeAt(i)) | 0;
	}
	return PALETTE[Math.abs(hash) % PALETTE.length];
}

/** One or two letters for an avatar. Falls back rather than throwing on a name
 *  that is only punctuation or whitespace. */
export function initials(displayName: string): string {
	const words = displayName.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return '?';
	if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
	return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
