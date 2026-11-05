import { describe, expect, it } from 'vitest';
import {
	addSeatedDelegate,
	approvePaper,
	createPaperCommittee,
	fixtureTextFor,
	introducePaper,
	startPaper,
	submitPaper,
	writePaper,
	type PaperCommittee,
	type SeatedDelegate
} from './committee-paper-fixtures';
import type { SignedInClient } from './supabase-test-client';

/*
 * amendment_seats left the realtime publication in 20261022142000 (security
 * review L22): a realtime delete carries only the row's key and reaches every
 * signed-in subscriber whatever their policies say, so the table told every
 * signed-in person which answer went on which amendment, in every committee.
 * The proposer of an amendment still hears each sponsor's answer as it
 * arrives (docs/committee-papers.md, step 7), because the answer touches the
 * amendment's own row (amendment_seats_touch_amendment), and the amendments
 * page listens to the draft's amendments the way `$lib/paper-amendments-live.ts`
 * does.
 *
 * The publication cannot be read through PostgREST, so it is checked the way
 * committee-room.test.ts checks roll_calls: the proposer listens, filtered on
 * the paper, and hears the amendment change when a sponsor accepts. Only a
 * published table is heard at all, and the listener's own read policy still
 * decides whether it may see the row.
 */

/** How long a test waits to hear the answer. */
const REALTIME_TIMEOUT_MS = 10_000;

/** How often the sponsor answers again until the answer is heard; see `answerUntilHeard`. */
const REALTIME_RETRY_MS = 1_000;

/** A draft resolution France leads with Spain as co-author, approved and introduced. */
async function draftWithSpain(committee: PaperCommittee, spain: SeatedDelegate): Promise<string> {
	const paperId = await startPaper(committee.france, committee.committeeId);
	const { error } = await committee.france.supabase.rpc('add_paper_author', {
		paper_id: paperId,
		seat_id: spain.seatId
	});

	if (error) throw new Error(`Could not add the fixture author: ${error.message}`);

	await writePaper(committee.france, paperId, fixtureTextFor('draft_resolution'));
	await submitPaper(committee.france, paperId);
	await approvePaper(committee.chair, paperId);
	await introducePaper(committee, paperId);

	return paperId;
}

async function proposeChange(delegate: SignedInClient, paperId: string): Promise<string> {
	const { data, error } = await delegate.supabase.rpc('propose_amendment', {
		paper_id: paperId,
		action: 'change',
		target_part: 'operative',
		target_clause_id: 'o1a',
		text_markdown: 'to keep human control over every use of force;',
		parent_amendment_id: null
	});

	if (error || !data) throw new Error(`Could not propose the fixture amendment: ${error?.message}`);

	return data;
}

/** What the listener heard of the amendment's row. */
type HeardAmendment = { amendmentId: string; status: string };

/** When the amendment last changed, as a number of milliseconds, read through `reader`'s own client. */
async function amendmentChangedAt(reader: SignedInClient, amendmentId: string): Promise<number> {
	const { data, error } = await reader.supabase
		.from('amendments')
		.select('updated_at')
		.eq('id', amendmentId)
		.single();

	if (error || !data) throw new Error(`Could not read the fixture amendment: ${error?.message}`);

	return new Date(data.updated_at).getTime();
}

/**
 * Listen as `listener` to the draft's amendments until one changes after
 * `notBefore`, while `answer` runs. The listener hears the row the way the
 * amendments page does: the `amendments` table, filtered on the paper.
 *
 * Proposing the amendment touched its row a moment ago too (each sponsor
 * asked is a row of amendment_seats), and Realtime may still hand those
 * changes to a listener that joins straight after, so only a change later
 * than the row was last seen counts.
 */
function hearAmendmentChange(
	listener: SignedInClient,
	paperId: string,
	notBefore: number,
	answer: () => Promise<void>
): Promise<HeardAmendment> {
	return new Promise((resolve, reject) => {
		let lastStatus = 'not subscribed yet';
		let retry: ReturnType<typeof setInterval> | undefined;
		const giveUp = setTimeout(
			() => stop(new Error(`No change was heard (channel: ${lastStatus}).`)),
			REALTIME_TIMEOUT_MS
		);

		/** Stop listening, and fail the test when there is a reason to. */
		function stop(failure: Error | null) {
			clearTimeout(giveUp);
			clearInterval(retry);
			void listener.supabase.removeChannel(channel);
			if (failure) reject(failure);
		}

		function answerOnce() {
			answer().catch((error: Error) => stop(error));
		}

		// The first listener after `pnpm db:reset` can be told "SUBSCRIBED" a
		// moment before Realtime reads the database's changes, so the sponsor
		// accepts again every second until it is heard. A sponsor may accept
		// again while the others have still to answer.
		function answerUntilHeard() {
			answerOnce();
			retry = setInterval(answerOnce, REALTIME_RETRY_MS);
		}

		const channel = listener.supabase
			.channel(`paper-amendments-${paperId}`, {
				config: { postgres_changes_options: { wait: true } }
			})
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'amendments',
					filter: `paper_id=eq.${paperId}`
				},
				(change) => {
					if (new Date(String(change.new.updated_at)).getTime() <= notBefore) return;

					stop(null);
					resolve({ amendmentId: String(change.new.id), status: String(change.new.status) });
				}
			)
			.subscribe((status, error) => {
				lastStatus = error ? `${status}: ${error.message}` : status;

				if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
					stop(new Error(`The proposer could not listen (${lastStatus}).`));
					return;
				}

				if (status === 'SUBSCRIBED') answerUntilHeard();
			});
	});
}

describe('amendment_seats, heard through the amendment (amendment_seats_touch_amendment)', () => {
	it('tells the proposer of a sponsor’s answer before the others have answered', async () => {
		const committee = await createPaperCommittee();
		const spain = await addSeatedDelegate(committee, 'Spain', 'ES');
		const paperId = await draftWithSpain(committee, spain);
		const amendmentId = await proposeChange(committee.germany, paperId);
		const proposedAt = await amendmentChangedAt(committee.germany, amendmentId);

		const heard = await hearAmendmentChange(committee.germany, paperId, proposedAt, async () => {
			const { error } = await committee.france.supabase.rpc('answer_amendment', {
				amendment_id: amendmentId,
				accepts: true
			});

			if (error) throw new Error(`France could not answer: ${error.message}`);
		});

		// France's answer alone moves nothing on: Spain has still to answer. The
		// amendment is heard all the same, because the answer touched its row.
		expect(heard).toEqual({ amendmentId, status: 'awaiting_sponsors' });

		const { data: answers } = await committee.germany.supabase
			.from('amendment_seats')
			.select('seat_id, accepts')
			.eq('amendment_id', amendmentId)
			.eq('role', 'sponsor_answer')
			.eq('seat_id', committee.france.seatId);

		expect(answers).toEqual([{ seat_id: committee.france.seatId, accepts: true }]);
	});
});
