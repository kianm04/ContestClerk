/**
 * The form actions behind the dais's control of the projector
 * (`docs/committee-papers.md`, section 6): "Show on screen", "Take off
 * screen", "Previous clause" and "Next clause". The paper's reading page and
 * the dais's review of it both offer them, so each spreads them into its own
 * `actions`, saying how to find its paper, the way `paperCommentActions` is shared.
 *
 * Every answer comes back to the page the button was pressed on, so the
 * buttons work the same with and without JavaScript. Putting a paper on or
 * off the screen says so in a toast; stepping does not, since the dais is
 * watching the projector move and presses it often.
 *
 * Files under `$lib/server` only ever run on the server.
 */

import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Flash } from '$lib/flash';
import type { ClauseDirection } from '$lib/paper-on-screen';
import { PAPER_SCREEN_MESSAGES } from '$lib/papers-on-floor';
import { setFlash } from './flash';
import {
	mayRunRoom,
	showPaperOnScreen,
	stepDisplayedClause,
	takePaperOffScreen
} from './papers-on-floor';

/** The paper a button is about, its name for the toast, and the page to come back to. */
export type ScreenedPaper = {
	committeeId: string;
	paperId: string;
	/** "Draft resolution 1.1". */
	name: string;
	pageUrl: string;
};

/** Refuse with the reason as a toast, leaving the page as it was. */
function refuse(message: string) {
	return fail(400, { flash: { tone: 'error', message } satisfies Flash });
}

/**
 * The screen actions. `findPaper` checks again that the reader may see the
 * paper, by throwing when they may not, since each action is its own request
 * and nothing the page's `load` worked out reaches it. Then the reader has
 * to run the room. Row Level Security decides the change itself, but the
 * paper's reading page offers these buttons among everybody who may read the
 * paper, and a volunteer's press was answered with "no row changed" and no
 * word of why, or with a toast saying it had worked. So the question is
 * asked first, and nothing is written for a reader who does not run the room
 * (security review I16).
 */
export function paperScreenActions<Event extends RequestEvent>(
	findPaper: (event: Event) => Promise<ScreenedPaper>
) {
	/** The paper the button is about, or null when the reader does not run its room. */
	async function findPaperForTheDais(event: Event): Promise<ScreenedPaper | null> {
		const paper = await findPaper(event);
		const isDais = await mayRunRoom(event.locals.supabase, paper.committeeId);

		return isDais ? paper : null;
	}

	/** "Previous clause" or "Next clause": the projector moves, and the page comes back. */
	const step = (direction: ClauseDirection) => async (event: Event) => {
		const paper = await findPaperForTheDais(event);

		if (paper === null) return refuse(PAPER_SCREEN_MESSAGES.notDais);

		const refusal = await stepDisplayedClause(
			event.locals.supabase,
			paper.committeeId,
			paper.paperId,
			direction
		);

		if (refusal !== null) return refuse(refusal);

		redirect(303, paper.pageUrl);
	};

	return {
		/** "Show on screen": the paper goes on the committee's projector, at its start. */
		showOnScreen: async (event: Event) => {
			const paper = await findPaperForTheDais(event);

			if (paper === null) return refuse(PAPER_SCREEN_MESSAGES.notDais);

			const refusal = await showPaperOnScreen(
				event.locals.supabase,
				paper.committeeId,
				paper.paperId
			);

			if (refusal !== null) return refuse(refusal);

			setFlash(event.cookies, {
				tone: 'success',
				message: PAPER_SCREEN_MESSAGES.shown(paper.name)
			});
			redirect(303, paper.pageUrl);
		},

		/** "Take off screen": the projector goes back to the room, if it still shows this paper. */
		takeOffScreen: async (event: Event) => {
			const paper = await findPaperForTheDais(event);

			if (paper === null) return refuse(PAPER_SCREEN_MESSAGES.notDais);

			await takePaperOffScreen(event.locals.supabase, paper.committeeId, paper.paperId);

			setFlash(event.cookies, {
				tone: 'success',
				message: PAPER_SCREEN_MESSAGES.hidden(paper.name)
			});
			redirect(303, paper.pageUrl);
		},

		previousClause: step('previous'),
		nextClause: step('next')
	};
}
