/**
 * A committee paper on the floor (`docs/committee-papers.md`, section 6, and
 * step 6 of its build order): the approved papers a motion to introduce a
 * document may name, the paper the dais put on the projector, the line the
 * live view gives it, and the words around them.
 *
 * Introducing is a motion (section 3, rule 8). Passing it runs
 * `introduce_paper` inside `apply_passed_motion`, which introduces the paper
 * and puts it on the projector in the same transaction, so nothing here
 * writes. Reading and writing is `$lib/server/papers-on-floor.ts`'s job.
 *
 * Plain functions with no Svelte in them, so the browser and the server
 * both use them and they can be tested on their own.
 */

import { paperKindAndNumber, type PaperName } from '$lib/committee-papers';
import { formatDayAndLongMonth } from '$lib/dashboard-dates';
import { formatTimeOfDay } from '$lib/dates';
import type { ScreenPage } from '$lib/paper-on-screen';
import type { RoomScreen } from '$lib/room-screen';

/**
 * A paper as the floor names it: an approved paper in the motion composer's
 * list, or the paper on the projector in the live view's line.
 */
export type FloorPaper = {
	id: string;
	/** "Working paper 1.1": what a chair says, and what the motion's own name becomes. */
	name: string;
	title: string;
};

/**
 * The paper the projector shows: its name, its title, and the part of it on
 * screen, drawn on the server as a reader sees it (`$lib/paper-on-screen.ts`).
 */
export type PaperForScreen = FloorPaper & {
	/** "Operative clause 1 of 6" or "Preambulatory clauses"; null for a paper shown whole. */
	position: string | null;
	page: ScreenPage;
};

/** The sentences "Show on screen", "Take off screen" and the clause buttons answer with. */
export const PAPER_SCREEN_MESSAGES = {
	shown: (name: string) => `${name} is on the screen.`,
	hidden: (name: string) => `${name} is off the screen.`,
	notIntroduced: 'Only an introduced paper can go on the screen.',
	notOnScreen: 'That paper is no longer on the screen.',
	notDais: 'Only the dais changes the screen.'
} as const;

/** A paper as the floor names it, from its row: "Working paper 1.1" and its title. */
export function floorPaper(paper: PaperName & { id: string; title: string }): FloorPaper {
	return { id: paper.id, name: paperKindAndNumber(paper), title: paper.title };
}

/** "Working paper 1.1 · Lethal autonomous weapons": the words of the live view's link. */
export function floorPaperText(paper: FloorPaper): string {
	return `${paper.name} · ${paper.title}`;
}

/**
 * The paper the projector shows instead of the floor, or null. The dais's
 * paper takes the place of the floor and the Unmod clock while the room
 * debates; the lobby, a suspension, the end of a session and a vote keep
 * their own screens, as they say something the whole room must see.
 */
export function paperShownOnScreen<Paper>(screen: RoomScreen, paper: Paper | null): Paper | null {
	const isDebating = screen.kind === 'floor' || screen.kind === 'unmod';

	return isDebating ? paper : null;
}

/** "Introduced 9 October, 16:12", for the line under an introduced paper's title; null before. */
export function introducedWord(introducedAt: string | null, timeZone: string): string | null {
	if (introducedAt === null) return null;

	const day = formatDayAndLongMonth(introducedAt, timeZone);

	return `Introduced ${day}, ${formatTimeOfDay(introducedAt, timeZone)}`;
}
