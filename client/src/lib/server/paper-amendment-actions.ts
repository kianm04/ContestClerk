/**
 * The form actions behind the amendment cards (`docs/committee-papers.md`,
 * step 7): on the draft's page a sponsor's "Accept as friendly" and
 * "Decline", the proposer's "Collect support instead" and "Withdraw", and any
 * other seat's "Support"; on the dais's review "Approve" and "Rule out of
 * order". Each page spreads them into its own `actions`, saying how to find
 * its paper, the way `paperCommentActions` is shared.
 *
 * Every form names its amendment by id. The action finds it on the paper
 * first, for the number its toast names, and the database checks the rest.
 * Every answer comes back to the page at the amendment's card, so the cards
 * work the same with and without JavaScript.
 *
 * Files under `$lib/server` only ever run on the server.
 */

import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readRuling, RULING_REFUSAL } from '$lib/amendment-queue';
import type { Flash } from '$lib/flash';
import {
	AMENDMENT_MESSAGES,
	AMENDMENT_NOT_FOUND,
	type PaperAmendment
} from '$lib/paper-amendments';
import { setFlash } from './flash';
import {
	answerAmendment,
	decideAmendment,
	makeAmendmentUnfriendly,
	readPaperAmendments,
	supportAmendment,
	withdrawAmendment,
	type AmendmentChange
} from './paper-amendments';

/** The paper an action is on, and the page it comes back to. */
export type AmendedPaper = { paperId: string; pageUrl: string };

/** Refuse with a sentence as a toast, leaving the page as it was. */
function refuse(message: string) {
	return fail(400, { flash: { tone: 'error', message } satisfies Flash });
}

/** The page at an amendment's card, `…#amendment-3`, the address its notifications use too. */
export function atAmendment(pageUrl: string, sequence: number): string {
	return `${pageUrl}#amendment-${sequence}`;
}

/** The amendment a form names, on this paper, or `null`. */
async function findAmendment(
	supabase: SupabaseClient,
	paperId: string,
	formData: FormData
): Promise<PaperAmendment | null> {
	const amendmentId = formData.get('amendment');
	if (typeof amendmentId !== 'string' || amendmentId === '') return null;

	const amendments = await readPaperAmendments(supabase, paperId);

	return amendments.find((amendment) => amendment.id === amendmentId) ?? null;
}

/**
 * One button on a card: find the amendment, make the change, and come back
 * to the card with a toast, or refuse with the database's sentence.
 */
function cardAction<Event extends RequestEvent>(
	findPaper: (event: Event) => Promise<AmendedPaper>,
	change: (
		supabase: SupabaseClient,
		amendment: PaperAmendment,
		formData: FormData
	) => Promise<AmendmentChange | string>,
	message: (amendment: PaperAmendment) => string
) {
	return async (event: Event) => {
		const { paperId, pageUrl } = await findPaper(event);
		const formData = await event.request.formData();
		const amendment = await findAmendment(event.locals.supabase, paperId, formData);

		if (amendment === null) return refuse(AMENDMENT_NOT_FOUND);

		const result = await change(event.locals.supabase, amendment, formData);
		// A change answers with the database's refusal, or a sentence of its own for a form it could not read.
		const refusal = typeof result === 'string' ? result : result.refusal;

		if (refusal !== null) return refuse(refusal);

		setFlash(event.cookies, { tone: 'success', message: message(amendment) });
		redirect(303, atAmendment(pageUrl, amendment.sequence));
	};
}

/** The buttons on the cards of a draft's page, for the committee's seats. */
export function amendmentCardActions<Event extends RequestEvent>(
	findPaper: (event: Event) => Promise<AmendedPaper>
) {
	return {
		acceptAmendment: cardAction(
			findPaper,
			(supabase, amendment) => answerAmendment(supabase, amendment.id, true),
			(amendment) => AMENDMENT_MESSAGES.accepted(amendment.sequence)
		),
		declineAmendment: cardAction(
			findPaper,
			(supabase, amendment) => answerAmendment(supabase, amendment.id, false),
			(amendment) => AMENDMENT_MESSAGES.declined(amendment.sequence)
		),
		makeAmendmentUnfriendly: cardAction(
			findPaper,
			(supabase, amendment) => makeAmendmentUnfriendly(supabase, amendment.id),
			(amendment) => AMENDMENT_MESSAGES.madeUnfriendly(amendment.sequence)
		),
		supportAmendment: cardAction(
			findPaper,
			(supabase, amendment) => supportAmendment(supabase, amendment.id),
			(amendment) => AMENDMENT_MESSAGES.supported(amendment.sequence)
		),
		withdrawAmendment: cardAction(
			findPaper,
			(supabase, amendment) => withdrawAmendment(supabase, amendment.id),
			(amendment) => AMENDMENT_MESSAGES.withdrawn(amendment.sequence)
		)
	};
}

/** The dais's buttons on the review of an introduced draft. */
export function daisAmendmentActions<Event extends RequestEvent>(
	findPaper: (event: Event) => Promise<AmendedPaper>
) {
	return {
		approveAmendment: cardAction(
			findPaper,
			(supabase, amendment) => decideAmendment(supabase, amendment.id, { kind: 'approve' }),
			(amendment) => AMENDMENT_MESSAGES.approved(amendment.sequence, amendment.isFriendly)
		),
		ruleOutAmendment: cardAction(
			findPaper,
			async (supabase, amendment, formData) => {
				const ruling = readRuling(formData);
				if (ruling === null) return RULING_REFUSAL;

				return decideAmendment(supabase, amendment.id, { kind: 'out_of_order', ruling });
			},
			(amendment) => AMENDMENT_MESSAGES.ruledOut(amendment.sequence)
		)
	};
}
