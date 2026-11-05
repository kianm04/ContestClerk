import { describe, expect, it } from 'vitest';
import {
	applyAmendment,
	clauseContentFromMarkdown,
	type AmendmentAction,
	type ClauseAmendment,
	type ClauseContent,
	type ClausePart
} from '$lib/paper-clauses';
import { addCommittee, addSeat, giveSeatTo } from './conference-fixtures';
import {
	addDaisMember,
	addSeatedDelegate,
	addVolunteer,
	approvePaper,
	closeVote,
	createPaperCommittee,
	expectRefusal,
	expectSuccess,
	FIXTURE_OPERATIVE,
	FIXTURE_PREAMBLE,
	fixtureTextFor,
	franceSubmitsPaper,
	introducePaper,
	notificationsOf,
	openVote,
	paperLinkPath,
	startPaper,
	storedPaper,
	storedVersions,
	submitPaper,
	tryOpeningVote,
	voteOn,
	writePaper,
	type PaperCommittee,
	type SeatedDelegate,
	type VoteSubject
} from './committee-paper-fixtures';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient,
	type SignedInClient
} from './supabase-test-client';

/*
 * Amendments to an introduced draft resolution, from docs/committee-papers.md section 3,
 * rules 9 and 10, and the amendments and amendment_seats tables of section 7. A delegate
 * proposes to add, change or strike a clause. Where the committee has friendly amendments,
 * the sponsors of the draft are asked whether it is friendly; an unfriendly one collects
 * support until it reaches the committee's setting. The dais orders the amendments waiting
 * for it and approves each one or rules it out of order: a friendly one it approves is
 * written in at once, an unfriendly one waits for its vote. The papers themselves are
 * tested in committee-papers.test.ts, with the same fixtures.
 *
 * As there, everybody acts through their own signed-in client, so it is the database's
 * own checks that decide what each person may do. What was stored is read with the service
 * role, past row-level security, and a refusal is expected by its code and its exact
 * words, because those words are what a delegate reads.
 *
 * The functions a person presses, which the describe titles name:
 *
 * - `propose_amendment`: a delegate proposes to add, change or strike a clause, or to
 *   change the words of an unfriendly amendment (an amendment of the "second degree").
 * - `answer_amendment`: a sponsor of the draft accepts the amendment as friendly or
 *   declines it.
 * - `make_amendment_unfriendly`: the proposer stops waiting for the sponsors.
 * - `sign_amendment`: a delegate supports an unfriendly amendment.
 * - `decide_amendment`: the dais approves an amendment or rules it out of order.
 * - `withdraw_amendment`: the proposer takes an amendment back before it is decided.
 * - `reorder_amendments`: the dais puts the amendments waiting for it in order.
 *
 * Behind them, which nobody signed in may call:
 *
 * - `lock_amendment` finds an amendment for whoever may read its draft, and locks the
 *   draft and then the amendment, so that two presses at once take turns.
 * - `route_unfriendly_amendment` counts the proposer and the signatories against the
 *   committee's support setting and, once they reach it, hands the amendment to
 *   `send_amendment_to_the_dais`, which puts it at the end of the one queue the dais keeps
 *   for the whole committee.
 * - `notify_amendment_proposer` tells the proposer what became of their amendment.
 * - `lapse_pending_children` lapses the amendments to an amendment that has ended.
 * - `apply_amendment_to_paper` writes an amendment into a new version of the draft with
 *   `apply_amendment_to_content`, which edits the list of clauses with `amend_clause_list`,
 *   and lapses the amendments still waiting whose clause the new version no longer has,
 *   which `paper_content_has_clause` looks for.
 * - On `votes`, `check_vote_paper` (the trigger `votes_check_paper`) decides whether a vote
 *   on an amendment may open, and `settle_vote_paper` (the trigger `votes_settle_paper`)
 *   settles the amendment when its vote closes.
 */

/** The words of an amendment, wherever a test does not care what they say. */
const AMENDMENT_TEXT = 'Requests the Secretary-General to report on autonomous weapons;';

/** The words an amendment to an amendment puts in place of the words of the one it changes. */
const SECOND_DEGREE_TEXT = 'Requests the Secretary-General to report on lethal autonomous weapons;';

/** The clauses of the fixture draft: p1 and p2, then o1 holding o1a and o1b, and o2. */
const FIXTURE_CONTENT = clauseContentFromMarkdown(FIXTURE_PREAMBLE, FIXTURE_OPERATIVE);

/**
 * Operative clauses three levels deep, as in paper-clauses.test.ts: o1 holds o1a, which
 * holds o1a1 and o1a2, and then o1b; o2 follows.
 */
const DEEP_CONTENT = clauseContentFromMarkdown(
	[
		'*Recalling* its resolutions 78/241 and 79/62,',
		'',
		'Alarmed by weapons that select and engage targets without human control,'
	].join('\n'),
	[
		'1. Calls upon all States to:',
		'   a. keep human control over the use of force;',
		'      i. in the selection of targets;',
		'      ii. in the decision to engage them;',
		'   b. review new weapons before they are used;',
		'2. Requests the Secretary-General to report at the eighty-first session.'
	].join('\n')
);

/** An id that belongs to nothing, for the calls that are refused before it is looked up. */
const UNKNOWN_ID = crypto.randomUUID();

/** What a delegate proposes; it is to the operative clauses unless the test says otherwise. */
type Proposal = {
	action: AmendmentAction;
	clauseId: string | null;
	part?: string | null;
	text?: string | null;
	parentAmendmentId?: string;
};

// A strike has no words; anything else says AMENDMENT_TEXT unless the test gives words.
function wordsOf(proposal: Proposal): string | null {
	if (proposal.text !== undefined) return proposal.text;

	return proposal.action === 'strike' ? null : AMENDMENT_TEXT;
}

function tryProposing(delegate: SignedInClient, paperId: string, proposal: Proposal) {
	return delegate.supabase.rpc('propose_amendment', {
		paper_id: paperId,
		action: proposal.action,
		// Null is a part a test may send on purpose, so only a missing part means operative.
		target_part: proposal.part === undefined ? 'operative' : proposal.part,
		target_clause_id: proposal.clauseId,
		text_markdown: wordsOf(proposal),
		parent_amendment_id: proposal.parentAmendmentId ?? null
	});
}

async function proposeAmendment(
	delegate: SignedInClient,
	paperId: string,
	proposal: Proposal
): Promise<string> {
	const { data, error } = await tryProposing(delegate, paperId, proposal);

	if (error || !data) throw new Error(`Could not propose the fixture amendment: ${error?.message}`);

	return data;
}

function answerAmendment(sponsor: SignedInClient, amendmentId: string, accepts: boolean | null) {
	return sponsor.supabase.rpc('answer_amendment', { amendment_id: amendmentId, accepts });
}

function makeUnfriendly(proposer: SignedInClient, amendmentId: string) {
	return proposer.supabase.rpc('make_amendment_unfriendly', { amendment_id: amendmentId });
}

function signAmendment(delegate: SignedInClient, amendmentId: string) {
	return delegate.supabase.rpc('sign_amendment', { amendment_id: amendmentId });
}

function decideAmendment(
	person: SignedInClient,
	amendmentId: string,
	decision: string | null,
	ruling: string | null = null
) {
	return person.supabase.rpc('decide_amendment', { amendment_id: amendmentId, decision, ruling });
}

async function approveAmendment(committee: PaperCommittee, amendmentId: string): Promise<void> {
	const { error } = await decideAmendment(committee.chair, amendmentId, 'approve');

	if (error) throw new Error(`Could not approve the fixture amendment: ${error.message}`);
}

function withdrawAmendment(person: SignedInClient, amendmentId: string) {
	return person.supabase.rpc('withdraw_amendment', { amendment_id: amendmentId });
}

function reorderAmendments(person: SignedInClient, committeeId: string, amendmentIds: string[]) {
	return person.supabase.rpc('reorder_amendments', {
		committee_id: committeeId,
		amendment_ids: amendmentIds
	});
}

function withdrawPaper(person: SignedInClient, paperId: string) {
	return person.supabase.rpc('withdraw_paper', { paper_id: paperId });
}

async function storedAmendment(amendmentId: string) {
	const { data, error } = await createServiceRoleClient()
		.from('amendments')
		.select('*')
		.eq('id', amendmentId)
		.single();

	if (error || !data) throw new Error(`Could not read the stored amendment: ${error?.message}`);

	return data;
}

/** An amendment that has ended has left the dais's queue and records when it ended. */
async function expectEnded(amendmentId: string, status: string): Promise<void> {
	const amendment = await storedAmendment(amendmentId);

	expect(amendment).toMatchObject({ status, queue_position: null });
	expect(amendment.decided_at).not.toBeNull();
}

async function queuePositions(amendmentIds: string[]): Promise<(number | null)[]> {
	const positions: (number | null)[] = [];

	for (const amendmentId of amendmentIds) {
		positions.push((await storedAmendment(amendmentId)).queue_position);
	}

	return positions;
}

/** Each sponsor's answer by seat: true accepts, false declines, null has not answered. */
async function sponsorAnswers(amendmentId: string): Promise<Record<string, boolean | null>> {
	const { data, error } = await createServiceRoleClient()
		.from('amendment_seats')
		.select('seat_id, accepts')
		.eq('amendment_id', amendmentId)
		.eq('role', 'sponsor_answer');

	if (error || !data) throw new Error(`Could not read the sponsors' answers: ${error?.message}`);

	return Object.fromEntries(data.map((row) => [row.seat_id, row.accepts]));
}

async function signatoriesOf(amendmentId: string): Promise<string[]> {
	const { data, error } = await createServiceRoleClient()
		.from('amendment_seats')
		.select('seat_id')
		.eq('amendment_id', amendmentId)
		.eq('role', 'signatory');

	if (error || !data) throw new Error(`Could not read the signatories: ${error?.message}`);

	return data.map((row) => row.seat_id).sort();
}

async function versionIdOf(paperId: string, versionNumber: number): Promise<string> {
	const { data, error } = await createServiceRoleClient()
		.from('committee_paper_versions')
		.select('id')
		.eq('paper_id', paperId)
		.eq('version_number', versionNumber)
		.single();

	if (error || !data) throw new Error(`Could not read the stored version: ${error?.message}`);

	return data.id;
}

async function notificationsOfKind(userId: string, kind: string) {
	const notifications = await notificationsOf(userId);

	return notifications.filter((notification) => notification.kind === kind);
}

/** The titles of what a proposer was told about their amendments, oldest first. */
async function outcomesToldTo(proposer: SignedInClient): Promise<string[]> {
	const notifications = await notificationsOfKind(proposer.userId, 'amendment_decided');

	return notifications.map((notification) => notification.title);
}

/** Where a notification about an amendment takes its reader: to the amendment on the draft. */
function amendmentLinkPath(committee: PaperCommittee, paperId: string, sequence: number): string {
	return `${paperLinkPath(committee, paperId)}#amendment-${sequence}`;
}

async function updateCommittee(
	committee: PaperCommittee,
	settings: Record<string, unknown>
): Promise<void> {
	const { error } = await committee.supabase
		.from('committees')
		.update(settings)
		.eq('id', committee.committeeId);

	if (error) throw new Error(`Could not change the fixture committee: ${error.message}`);
}

async function addAuthor(author: SignedInClient, paperId: string, seatId: string): Promise<void> {
	const { error } = await author.supabase.rpc('add_paper_author', {
		paper_id: paperId,
		seat_id: seatId
	});

	if (error) throw new Error(`Could not add the fixture author: ${error.message}`);
}

/**
 * The delegate leaves; the seat stays in the committee with nobody in it. The
 * organiser frees it with `revoke_seat`, as the allocation grid does.
 */
async function emptySeat(committee: PaperCommittee, seatId: string): Promise<void> {
	const { error } = await committee.supabase.rpc('revoke_seat', { seat_id: seatId });

	if (error) throw new Error(`Could not empty the fixture seat: ${error.message}`);
}

async function delegateOfAnotherCommittee(committee: PaperCommittee): Promise<SignedInClient> {
	const otherCommitteeId = await addCommittee(
		committee.supabase,
		committee.conferenceId,
		'General Assembly'
	);
	const otherSeatId = await addSeat(committee.supabase, otherCommitteeId, 'Brazil', 'BR');
	const otherCommitteeDelegate = await createSignedInClient('Delegate of Brazil');
	await giveSeatTo(committee.supabase, otherSeatId, otherCommitteeDelegate.userId);

	return otherCommitteeDelegate;
}

/** A draft resolution France leads with the given co-authors, approved and introduced. */
async function draftWithCoAuthors(
	committee: PaperCommittee,
	coAuthors: SeatedDelegate[]
): Promise<string> {
	const paperId = await startPaper(committee.france, committee.committeeId);

	for (const coAuthor of coAuthors) await addAuthor(committee.france, paperId, coAuthor.seatId);

	await writePaper(committee.france, paperId, fixtureTextFor('draft_resolution'));
	await submitPaper(committee.france, paperId);
	await approvePaper(committee.chair, paperId);
	await introducePaper(committee, paperId);

	return paperId;
}

/** A second draft resolution in the committee, which Germany writes alone. */
async function germanyIntroducesDraft(committee: PaperCommittee): Promise<string> {
	const paperId = await startPaper(committee.germany, committee.committeeId);
	await writePaper(committee.germany, paperId, fixtureTextFor('draft_resolution'));
	await submitPaper(committee.germany, paperId);
	await approvePaper(committee.chair, paperId);
	await introducePaper(committee, paperId);

	return paperId;
}

/**
 * What apply_amendment_to_content makes of some clauses. It is asked with the service
 * role, because it is an internal function that nobody signed in may call.
 */
async function contentAmendedInTheDatabase(
	content: ClauseContent,
	amendment: ClauseAmendment
): Promise<ClauseContent> {
	const { data, error } = await createServiceRoleClient().rpc('apply_amendment_to_content', {
		content,
		action: amendment.action,
		target_part: amendment.targetPart,
		target_clause_id: amendment.targetClauseId,
		text_markdown: amendment.textMarkdown,
		new_clause_id: `a${amendment.sequence}`
	});

	if (error) throw new Error(`Could not amend the clauses in the database: ${error.message}`);

	return data;
}

describe('propose_amendment', () => {
	it('numbers the amendments on each draft from 1 and bases each on the latest version', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const otherPaperId = await germanyIntroducesDraft(committee);

		const firstId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		const secondId = await proposeAmendment(committee.germany, paperId, {
			action: 'strike',
			clauseId: 'o2'
		});
		const onTheOtherDraftId = await proposeAmendment(committee.france, otherPaperId, {
			action: 'change',
			clauseId: 'o1a'
		});

		expect(await storedAmendment(firstId)).toMatchObject({
			paper_id: paperId,
			sequence: 1,
			proposed_by_seat_id: committee.france.seatId,
			action: 'change',
			target_part: 'operative',
			target_clause_id: 'o1a',
			text_markdown: AMENDMENT_TEXT,
			parent_amendment_id: null,
			based_on_version_id: await versionIdOf(paperId, 1)
		});
		expect(await storedAmendment(secondId)).toMatchObject({ sequence: 2, text_markdown: null });
		expect(await storedAmendment(onTheOtherDraftId)).toMatchObject({
			paper_id: otherPaperId,
			sequence: 1
		});

		// France leads the draft, so France's amendment is friendly and is written in at once.
		await approveAmendment(committee, firstId);
		const thirdId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1b'
		});

		expect(await storedAmendment(thirdId)).toMatchObject({
			sequence: 3,
			based_on_version_id: await versionIdOf(paperId, 2)
		});
	}, 60_000);

	it('trims the words, keeps none for a strike and takes up to 10,000 characters', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);

		const changeId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o1a',
			text: `  ${AMENDMENT_TEXT}  `
		});
		// A strike has no words, so words sent with one are dropped rather than refused.
		const strikeId = await proposeAmendment(committee.france, paperId, {
			action: 'strike',
			clauseId: 'o2',
			text: 'Words a strike does not need'
		});
		const longestId = await proposeAmendment(committee.france, paperId, {
			action: 'add',
			clauseId: 'o1',
			text: 'x'.repeat(10_000)
		});

		expect((await storedAmendment(changeId)).text_markdown).toBe(AMENDMENT_TEXT);
		expect((await storedAmendment(strikeId)).text_markdown).toBeNull();
		expect((await storedAmendment(longestId)).text_markdown).toHaveLength(10_000);
	});

	it('puts an added clause that follows no clause first among the operative clauses', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);

		const amendmentId = await proposeAmendment(committee.france, paperId, {
			action: 'add',
			clauseId: null
		});
		await approveAmendment(committee, amendmentId);

		const [, amended] = await storedVersions(paperId);
		const content: ClauseContent = amended.content;
		expect(content.operative.map((clause) => clause.id)).toEqual(['a1', 'o1', 'o2']);
		expect(content.operative[0]).toEqual({ id: 'a1', markdown: AMENDMENT_TEXT, children: [] });
	});

	it('amends the preamble only where the committee allows it', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const newPreamble = 'Deeply alarmed by the spread of autonomous weapons,';

		await expectRefusal(
			tryProposing(committee.france, paperId, {
				action: 'change',
				part: 'preamble',
				clauseId: 'p2'
			}),
			'22023',
			'This committee amends operative clauses only.'
		);

		await updateCommittee(committee, { preamble_amendable: true });
		const amendmentId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			part: 'preamble',
			clauseId: 'p2',
			text: newPreamble
		});
		await approveAmendment(committee, amendmentId);

		const [original, amended] = await storedVersions(paperId);
		expect(amended.content.preamble).toEqual([
			original.content.preamble[0],
			{ id: 'p2', markdown: newPreamble }
		]);
	});

	it('is for a delegate of the committee, and not for an observer', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const observer = await addSeatedDelegate(committee, 'Holy See', 'VA', 'observer');
		const volunteer = await addVolunteer(committee);
		const stranger = await createSignedInClient('Stranger');
		const otherCommitteeDelegate = await delegateOfAnotherCommittee(committee);
		const proposal: Proposal = { action: 'change', clauseId: 'o1a' };

		// The chair and the conference team may read the draft, but hold no seat to propose from.
		for (const person of [committee.chair, volunteer]) {
			await expectRefusal(
				tryProposing(person, paperId, proposal),
				'42501',
				'Only a delegate of this committee can propose an amendment.'
			);
		}

		await expectRefusal(
			tryProposing(observer, paperId, proposal),
			'42501',
			'An observer may sign an amendment but not propose one.'
		);

		// Somebody who may not read the draft is told what they would be told of no draft at all.
		for (const person of [stranger, otherCommitteeDelegate]) {
			await expectRefusal(
				tryProposing(person, paperId, proposal),
				'P0002',
				'That paper does not exist.'
			);
		}
		await expectRefusal(
			tryProposing(committee.france, UNKNOWN_ID, proposal),
			'P0002',
			'That paper does not exist.'
		);
	});

	it('is for a draft resolution the committee has introduced', async () => {
		const committee = await createPaperCommittee();
		const approvedPaperId = await franceSubmitsPaper(committee, 'draft_resolution', 'approved');
		const workingPaperId = await franceSubmitsPaper(committee, 'working_paper');
		const passedPaperId = await franceSubmitsPaper(committee);
		await voteOn(committee, { paperId: passedPaperId }, true);
		const withdrawnPaperId = await franceSubmitsPaper(committee);
		await expectSuccess(withdrawPaper(committee.chair, withdrawnPaperId));

		for (const paperId of [approvedPaperId, workingPaperId, passedPaperId, withdrawnPaperId]) {
			await expectRefusal(
				tryProposing(committee.france, paperId, { action: 'change', clauseId: 'o1a' }),
				'22023',
				'Amendments are proposed to a draft resolution once it is introduced.'
			);
		}

		// Until it is introduced, a draft is for its authors and the dais, not the committee.
		await expectRefusal(
			tryProposing(committee.germany, approvedPaperId, { action: 'change', clauseId: 'o1a' }),
			'P0002',
			'That paper does not exist.'
		);
	}, 60_000);

	it('needs the preamble or the operative clauses, and a clause the draft has', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);

		for (const part of [null, 'heading']) {
			await expectRefusal(
				tryProposing(committee.france, paperId, { action: 'change', part, clauseId: 'o1a' }),
				'22023',
				'An amendment changes the preamble or the operative clauses.'
			);
		}

		// Only an addition may follow no clause, which puts it first.
		const proposalsWithoutTheirClause: Proposal[] = [
			{ action: 'change', clauseId: 'o9' },
			{ action: 'change', clauseId: 'p1' },
			{ action: 'add', clauseId: 'o9' },
			{ action: 'change', clauseId: null },
			{ action: 'strike', clauseId: null }
		];
		for (const proposal of proposalsWithoutTheirClause) {
			await expectRefusal(
				tryProposing(committee.france, paperId, proposal),
				'22023',
				'That clause is not in the draft.'
			);
		}
	});

	it('needs the words of a change or an addition, in at most 10,000 characters', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);

		for (const text of [null, '   ', 'x'.repeat(10_001)]) {
			for (const action of ['change', 'add'] as const) {
				await expectRefusal(
					tryProposing(committee.france, paperId, { action, clauseId: 'o1a', text }),
					'22023',
					'Write the words of the amendment, in at most 10,000 characters.'
				);
			}
		}
	});

	it('follows the clauses of the latest version of the draft', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);

		const strikeId = await proposeAmendment(committee.france, paperId, {
			action: 'strike',
			clauseId: 'o2'
		});
		await approveAmendment(committee, strikeId);
		const additionId = await proposeAmendment(committee.france, paperId, {
			action: 'add',
			clauseId: 'o1'
		});
		await approveAmendment(committee, additionId);

		await expectRefusal(
			tryProposing(committee.germany, paperId, { action: 'change', clauseId: 'o2' }),
			'22023',
			'That clause is not in the draft.'
		);

		// Amendment 2 added the clause a2, which a later amendment may change in its turn.
		const changeOfTheAdditionId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'a2'
		});
		expect((await storedAmendment(changeOfTheAdditionId)).based_on_version_id).toBe(
			await versionIdOf(paperId, 3)
		);
	});

	it('takes an amendment to an amendment only where the committee allows it, and only to a pending unfriendly amendment', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const otherPaperId = await germanyIntroducesDraft(committee);

		// An author's own amendment is friendly at once. Germany's wait for France's answer,
		// until Germany stops waiting for it.
		const friendlyId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		const awaitingId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1b'
		});
		const unfriendlyId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o2'
		});
		await expectSuccess(makeUnfriendly(committee.germany, unfriendlyId));
		const strikeId = await proposeAmendment(committee.germany, paperId, {
			action: 'strike',
			clauseId: 'o1b'
		});
		await expectSuccess(makeUnfriendly(committee.germany, strikeId));
		const onTheOtherDraftId = await proposeAmendment(committee.germany, otherPaperId, {
			action: 'change',
			clauseId: 'o1a'
		});

		await expectRefusal(
			tryProposing(committee.france, paperId, {
				action: 'change',
				clauseId: 'o2',
				parentAmendmentId: unfriendlyId
			}),
			'22023',
			'This committee does not amend amendments.'
		);

		await updateCommittee(committee, { has_second_degree_amendments: true });

		await expectRefusal(
			tryProposing(committee.france, paperId, {
				action: 'change',
				clauseId: 'o1a',
				parentAmendmentId: onTheOtherDraftId
			}),
			'22023',
			'That amendment is not on this draft.'
		);
		for (const parentAmendmentId of [friendlyId, awaitingId]) {
			await expectRefusal(
				tryProposing(committee.france, paperId, {
					action: 'change',
					clauseId: 'o1a',
					parentAmendmentId
				}),
				'22023',
				'Only an unfriendly amendment waiting for its vote can be amended.'
			);
		}
		await expectRefusal(
			tryProposing(committee.france, paperId, {
				action: 'change',
				clauseId: 'o1b',
				parentAmendmentId: strikeId
			}),
			'22023',
			'An amendment that strikes a clause has no words to amend.'
		);
		for (const action of ['add', 'strike'] as const) {
			await expectRefusal(
				tryProposing(committee.france, paperId, {
					action,
					clauseId: 'o2',
					parentAmendmentId: unfriendlyId
				}),
				'22023',
				'An amendment to an amendment changes its words.'
			);
		}

		// An amendment to an amendment changes the same clause, whatever it was sent with,
		// and never waits for the sponsors.
		const secondDegreeId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			part: 'preamble',
			clauseId: 'p1',
			text: SECOND_DEGREE_TEXT,
			parentAmendmentId: unfriendlyId
		});
		expect(await storedAmendment(secondDegreeId)).toMatchObject({
			parent_amendment_id: unfriendlyId,
			target_part: 'operative',
			target_clause_id: 'o2',
			text_markdown: SECOND_DEGREE_TEXT,
			status: 'with_the_dais',
			is_friendly: false
		});

		await expectRefusal(
			tryProposing(committee.france, paperId, {
				action: 'change',
				clauseId: 'o2',
				parentAmendmentId: secondDegreeId
			}),
			'22023',
			'An amendment to an amendment is not amended again.'
		);
	}, 60_000);

	it('takes no amendment to an amendment the committee is voting on', async () => {
		const committee = await createPaperCommittee();
		await updateCommittee(committee, {
			has_friendly_amendments: false,
			has_second_degree_amendments: true
		});
		const paperId = await franceSubmitsPaper(committee);
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o2'
		});
		await approveAmendment(committee, amendmentId);
		await openVote(committee, { amendmentId });

		await expectRefusal(
			tryProposing(committee.france, paperId, {
				action: 'change',
				clauseId: 'o2',
				text: SECOND_DEGREE_TEXT,
				parentAmendmentId: amendmentId
			}),
			'22023',
			'The committee is already voting on that amendment.'
		);
	});
});

describe('answer_amendment', () => {
	it('asks every other sponsor of the draft, and tells each of them', async () => {
		const committee = await createPaperCommittee();
		const spain = await addSeatedDelegate(committee, 'Spain', 'ES');
		const paperId = await draftWithCoAuthors(committee, [spain]);

		const fromGermanyId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});

		expect((await storedAmendment(fromGermanyId)).status).toBe('awaiting_sponsors');
		expect(await sponsorAnswers(fromGermanyId)).toEqual({
			[committee.france.seatId]: null,
			[spain.seatId]: null
		});
		for (const sponsor of [committee.france, spain]) {
			expect(await notificationsOfKind(sponsor.userId, 'amendment_awaits_answer')).toEqual([
				{
					kind: 'amendment_awaits_answer',
					title: 'Amendment 1 to Draft resolution 1.1 waits for your answer',
					link_path: amendmentLinkPath(committee, paperId, 1)
				}
			]);
		}

		// A sponsor who proposes an amendment is not asked about it.
		const fromSpainId = await proposeAmendment(spain, paperId, {
			action: 'change',
			clauseId: 'o2'
		});
		expect(await sponsorAnswers(fromSpainId)).toEqual({ [committee.france.seatId]: null });
		expect(await notificationsOfKind(spain.userId, 'amendment_awaits_answer')).toHaveLength(1);
	});

	// send_amendment_to_the_dais puts the amendment at the end of the queue, and
	// notify_amendment_proposer tells the proposer the sponsors accepted it.
	it('makes the amendment friendly and sends it to the dais once every sponsor accepts', async () => {
		const committee = await createPaperCommittee();
		const spain = await addSeatedDelegate(committee, 'Spain', 'ES');
		const paperId = await draftWithCoAuthors(committee, [spain]);
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});

		await expectSuccess(answerAmendment(committee.france, amendmentId, true));
		expect((await storedAmendment(amendmentId)).status).toBe('awaiting_sponsors');

		await expectSuccess(answerAmendment(spain, amendmentId, true));

		expect(await storedAmendment(amendmentId)).toMatchObject({
			status: 'with_the_dais',
			is_friendly: true,
			queue_position: 1
		});
		expect(await sponsorAnswers(amendmentId)).toEqual({
			[committee.france.seatId]: true,
			[spain.seatId]: true
		});
		expect(await notificationsOfKind(committee.germany.userId, 'amendment_decided')).toEqual([
			{
				kind: 'amendment_decided',
				title: 'Amendment 1 to Draft resolution 1.1 was accepted by the sponsors',
				link_path: amendmentLinkPath(committee, paperId, 1)
			}
		]);
	});

	it('makes the amendment unfriendly at the first decline', async () => {
		const committee = await createPaperCommittee();
		const spain = await addSeatedDelegate(committee, 'Spain', 'ES');
		const paperId = await draftWithCoAuthors(committee, [spain]);
		// Two seats must support an unfriendly amendment here, so a declined one collects support.
		await updateCommittee(committee, {
			amendment_support_unit: 'seats',
			amendment_support_minimum: 2
		});
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});

		await expectSuccess(answerAmendment(committee.france, amendmentId, false));

		expect(await storedAmendment(amendmentId)).toMatchObject({
			status: 'collecting_support',
			is_friendly: false,
			queue_position: null
		});
		expect(await outcomesToldTo(committee.germany)).toEqual([
			'Amendment 1 to Draft resolution 1.1 was declined by a sponsor'
		]);
		await expectRefusal(
			answerAmendment(spain, amendmentId, true),
			'22023',
			'This amendment is no longer waiting for the sponsors.'
		);
	});

	it('lets a sponsor change their answer while the amendment still waits', async () => {
		const committee = await createPaperCommittee();
		const spain = await addSeatedDelegate(committee, 'Spain', 'ES');
		const paperId = await draftWithCoAuthors(committee, [spain]);
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});

		await expectSuccess(answerAmendment(committee.france, amendmentId, true));
		await expectSuccess(answerAmendment(committee.france, amendmentId, false));

		expect(await sponsorAnswers(amendmentId)).toEqual({
			[committee.france.seatId]: false,
			[spain.seatId]: null
		});
		// Ten per cent of the three seated delegates rounds up to one seat: the proposer's.
		expect(await storedAmendment(amendmentId)).toMatchObject({
			status: 'with_the_dais',
			is_friendly: false
		});
	});

	// lock_amendment gives the same answer for an amendment the caller may not read as for
	// one that does not exist, so a stranger learns nothing from the refusal.
	it('is for the sponsors of the draft, with an answer, while the amendment waits for them', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const stranger = await createSignedInClient('Stranger');
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});

		for (const person of [committee.germany, committee.chair]) {
			await expectRefusal(
				answerAmendment(person, amendmentId, true),
				'42501',
				'Only a sponsor of the draft answers whether an amendment is friendly.'
			);
		}
		await expectRefusal(
			answerAmendment(stranger, amendmentId, true),
			'P0002',
			'That amendment does not exist.'
		);
		await expectRefusal(
			answerAmendment(committee.france, UNKNOWN_ID, true),
			'P0002',
			'That amendment does not exist.'
		);
		await expectRefusal(
			answerAmendment(committee.france, amendmentId, null),
			'22023',
			'Accept or decline the amendment.'
		);

		await expectSuccess(answerAmendment(committee.france, amendmentId, true));
		await expectRefusal(
			answerAmendment(committee.france, amendmentId, false),
			'22023',
			'This amendment is no longer waiting for the sponsors.'
		);
	});

	it('asks nobody when no other sponsor holds a seat, or the committee has no friendly amendments', async () => {
		const committee = await createPaperCommittee();
		const spain = await addSeatedDelegate(committee, 'Spain', 'ES');
		const paperId = await draftWithCoAuthors(committee, [spain]);
		// Spain stays a sponsor of the draft, but an empty seat has nobody to answer for it.
		await emptySeat(committee, spain.seatId);

		const fromFranceId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		expect(await storedAmendment(fromFranceId)).toMatchObject({
			status: 'with_the_dais',
			is_friendly: true
		});
		expect(await sponsorAnswers(fromFranceId)).toEqual({});

		await updateCommittee(committee, { has_friendly_amendments: false });
		const fromGermanyId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o2'
		});
		expect(await storedAmendment(fromGermanyId)).toMatchObject({
			status: 'with_the_dais',
			is_friendly: false
		});
		expect(await sponsorAnswers(fromGermanyId)).toEqual({});
		expect(await notificationsOfKind(committee.france.userId, 'amendment_awaits_answer')).toEqual(
			[]
		);
	});
});

describe('make_amendment_unfriendly', () => {
	it('stops waiting for the sponsors and collects support, keeping their answers', async () => {
		const committee = await createPaperCommittee();
		const spain = await addSeatedDelegate(committee, 'Spain', 'ES');
		const paperId = await draftWithCoAuthors(committee, [spain]);
		await updateCommittee(committee, {
			amendment_support_unit: 'seats',
			amendment_support_minimum: 2
		});
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		await expectSuccess(answerAmendment(committee.france, amendmentId, true));

		await expectSuccess(makeUnfriendly(committee.germany, amendmentId));

		expect(await storedAmendment(amendmentId)).toMatchObject({
			status: 'collecting_support',
			is_friendly: false
		});
		expect(await sponsorAnswers(amendmentId)).toEqual({
			[committee.france.seatId]: true,
			[spain.seatId]: null
		});
		// The proposer chose this, so there is nobody to tell.
		expect(await outcomesToldTo(committee.germany)).toEqual([]);
	});

	it('sends the amendment to the dais at once when the proposer is support enough', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});

		await expectSuccess(makeUnfriendly(committee.germany, amendmentId));

		// Ten per cent of the two seated delegates rounds up to one seat: the proposer's.
		expect(await storedAmendment(amendmentId)).toMatchObject({
			status: 'with_the_dais',
			is_friendly: false,
			queue_position: 1
		});
	});

	it('is for the proposer, while the amendment waits for the sponsors', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const stranger = await createSignedInClient('Stranger');
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});

		for (const person of [committee.france, committee.chair]) {
			await expectRefusal(
				makeUnfriendly(person, amendmentId),
				'42501',
				'Only the delegate who proposed an amendment can do that.'
			);
		}
		await expectRefusal(
			makeUnfriendly(stranger, amendmentId),
			'P0002',
			'That amendment does not exist.'
		);

		await expectSuccess(makeUnfriendly(committee.germany, amendmentId));
		await expectRefusal(
			makeUnfriendly(committee.germany, amendmentId),
			'22023',
			'This amendment is no longer waiting for the sponsors.'
		);
	});
});

describe('sign_amendment', () => {
	// route_unfriendly_amendment counts the proposer with the signatories, and sends the
	// amendment on once they reach the committee's setting.
	it('counts each seat once, with the proposer, and sends the amendment to the dais at the minimum', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const spain = await addSeatedDelegate(committee, 'Spain', 'ES');
		await updateCommittee(committee, {
			has_friendly_amendments: false,
			amendment_support_unit: 'seats',
			amendment_support_minimum: 3
		});
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});

		await expectSuccess(signAmendment(committee.france, amendmentId));
		// Signing again changes nothing: France's seat counts once.
		await expectSuccess(signAmendment(committee.france, amendmentId));
		expect(await signatoriesOf(amendmentId)).toEqual([committee.france.seatId]);
		expect(await storedAmendment(amendmentId)).toMatchObject({
			status: 'collecting_support',
			queue_position: null
		});

		await expectSuccess(signAmendment(spain, amendmentId));

		expect(await signatoriesOf(amendmentId)).toEqual(
			[committee.france.seatId, spain.seatId].sort()
		);
		expect(await storedAmendment(amendmentId)).toMatchObject({
			status: 'with_the_dais',
			is_friendly: false,
			queue_position: 1
		});
	});

	it('takes a percentage of the seated delegates, rounded up', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const moreCountries: [string, string][] = [
			['Spain', 'ES'],
			['Italy', 'IT'],
			['Poland', 'PL']
		];
		for (const [seatName, countryCode] of moreCountries) {
			await addSeatedDelegate(committee, seatName, countryCode);
		}
		// Two seats nobody holds, which count for nothing.
		await addSeat(committee.supabase, committee.committeeId, 'Chile', 'CL');
		await addSeat(committee.supabase, committee.committeeId, 'Kenya', 'KE');
		await updateCommittee(committee, {
			has_friendly_amendments: false,
			amendment_support_minimum: 30
		});

		// Thirty per cent of five seated delegates is 1.5, so two seats: the proposer and one
		// more. Counting the empty seats would make it three; rounding down, one.
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		expect((await storedAmendment(amendmentId)).status).toBe('collecting_support');

		await expectSuccess(signAmendment(committee.france, amendmentId));

		expect((await storedAmendment(amendmentId)).status).toBe('with_the_dais');
	});

	it('sends an unfriendly amendment to the dais at once where the committee asks for no support', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		await updateCommittee(committee, {
			has_friendly_amendments: false,
			amendment_support_unit: 'seats',
			amendment_support_minimum: 0
		});

		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});

		expect(await storedAmendment(amendmentId)).toMatchObject({
			status: 'with_the_dais',
			is_friendly: false,
			queue_position: 1
		});
		expect(await signatoriesOf(amendmentId)).toEqual([]);
	});

	it('lets an observer sign', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const observer = await addSeatedDelegate(committee, 'Holy See', 'VA', 'observer');
		await updateCommittee(committee, {
			has_friendly_amendments: false,
			amendment_support_unit: 'seats',
			amendment_support_minimum: 2
		});
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});

		await expectSuccess(signAmendment(observer, amendmentId));

		expect(await signatoriesOf(amendmentId)).toEqual([observer.seatId]);
		expect((await storedAmendment(amendmentId)).status).toBe('with_the_dais');
	});

	it('is for a delegate other than the proposer, while the amendment collects support', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const volunteer = await addVolunteer(committee);
		const stranger = await createSignedInClient('Stranger');
		await updateCommittee(committee, {
			has_friendly_amendments: false,
			amendment_support_unit: 'seats',
			amendment_support_minimum: 2
		});
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});

		for (const person of [committee.chair, volunteer]) {
			await expectRefusal(
				signAmendment(person, amendmentId),
				'42501',
				'Only a delegate of this committee can sign an amendment.'
			);
		}
		await expectRefusal(
			signAmendment(stranger, amendmentId),
			'P0002',
			'That amendment does not exist.'
		);
		await expectRefusal(
			signAmendment(committee.germany, amendmentId),
			'22023',
			"The proposer's support is counted already."
		);

		await expectSuccess(signAmendment(committee.france, amendmentId));
		const spain = await addSeatedDelegate(committee, 'Spain', 'ES');
		await expectRefusal(
			signAmendment(spain, amendmentId),
			'22023',
			'This amendment is not collecting signatures.'
		);
	});
});

describe('decide_amendment', () => {
	it('writes a friendly amendment the dais approves into a new version of the draft at once', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const amendmentId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		const updatedBefore = (await storedPaper(paperId)).updated_at;

		await expectSuccess(decideAmendment(committee.chair, amendmentId, 'approve'));

		// apply_amendment_to_paper writes the version. The editor shows an amendment with
		// applyAmendment, so the two have to agree clause for clause.
		const [original, amended] = await storedVersions(paperId);
		expect(amended).toMatchObject({ version_number: 2, amendment_id: amendmentId });
		expect(amended.content).toEqual(
			applyAmendment(original.content, {
				action: 'change',
				targetPart: 'operative',
				targetClauseId: 'o1a',
				textMarkdown: AMENDMENT_TEXT,
				sequence: 1
			})
		);
		await expectEnded(amendmentId, 'written_in');
		expect(Date.parse((await storedPaper(paperId)).updated_at)).toBeGreaterThan(
			Date.parse(updatedBefore)
		);
		expect(await notificationsOfKind(committee.france.userId, 'amendment_decided')).toEqual([
			{
				kind: 'amendment_decided',
				title: 'Amendment 1 to Draft resolution 1.1 was approved and written in',
				link_path: amendmentLinkPath(committee, paperId, 1)
			}
		]);
	});

	it('leaves an unfriendly amendment the dais approves waiting for its vote', async () => {
		const committee = await createPaperCommittee();
		await updateCommittee(committee, { has_friendly_amendments: false });
		const paperId = await franceSubmitsPaper(committee);
		const daisMember = await addDaisMember(committee);
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});

		// Whoever runs the room decides, not only the chair.
		await expectSuccess(decideAmendment(daisMember, amendmentId, 'approve'));

		expect(await storedAmendment(amendmentId)).toMatchObject({
			status: 'approved',
			queue_position: null,
			decided_at: null
		});
		expect(await storedVersions(paperId)).toHaveLength(1);
		expect(await outcomesToldTo(committee.germany)).toEqual([
			'Amendment 1 to Draft resolution 1.1 was approved and waits for its vote'
		]);
	});

	it('rules an amendment out of order with a reason, and lapses the amendments to it', async () => {
		const committee = await createPaperCommittee();
		await updateCommittee(committee, {
			has_friendly_amendments: false,
			has_second_degree_amendments: true
		});
		const paperId = await franceSubmitsPaper(committee);
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		const secondDegreeId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o1a',
			text: SECOND_DEGREE_TEXT,
			parentAmendmentId: amendmentId
		});

		await expectSuccess(
			decideAmendment(
				committee.chair,
				amendmentId,
				'out_of_order',
				'  The amendment is not germane to the draft.  '
			)
		);

		await expectEnded(amendmentId, 'out_of_order');
		expect((await storedAmendment(amendmentId)).ruling).toBe(
			'The amendment is not germane to the draft.'
		);
		await expectEnded(secondDegreeId, 'lapsed');
		expect(await outcomesToldTo(committee.germany)).toEqual([
			'Amendment 1 to Draft resolution 1.1 was ruled out of order'
		]);
	});

	it('is for the dais, with a decision and a reason for ruling out of order, while the amendment waits for it', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const stranger = await createSignedInClient('Stranger');
		const amendmentId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		const awaitingId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o2'
		});

		await expectRefusal(
			decideAmendment(committee.france, amendmentId, 'approve'),
			'42501',
			'Only the dais of this committee decides an amendment.'
		);
		await expectRefusal(
			decideAmendment(stranger, amendmentId, 'approve'),
			'P0002',
			'That amendment does not exist.'
		);
		await expectRefusal(
			decideAmendment(committee.chair, awaitingId, 'approve'),
			'22023',
			'This amendment is not waiting for the dais.'
		);
		for (const decision of ['reject', null]) {
			await expectRefusal(
				decideAmendment(committee.chair, amendmentId, decision),
				'22023',
				'An amendment is approved or ruled out of order.'
			);
		}
		for (const ruling of [null, '   ', 'x'.repeat(2_001)]) {
			await expectRefusal(
				decideAmendment(committee.chair, amendmentId, 'out_of_order', ruling),
				'22023',
				'Say in at most 2,000 characters why the amendment is out of order.'
			);
		}

		await expectSuccess(
			decideAmendment(committee.chair, amendmentId, 'out_of_order', 'x'.repeat(2_000))
		);
		await expectRefusal(
			decideAmendment(committee.chair, amendmentId, 'approve'),
			'22023',
			'This amendment is not waiting for the dais.'
		);
	});

	it('writes in no friendly amendment while the committee votes on the draft or another of its amendments', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const friendlyId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		const unfriendlyId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o2'
		});
		await expectSuccess(makeUnfriendly(committee.germany, unfriendlyId));
		await approveAmendment(committee, unfriendlyId);
		const voteSubjects: VoteSubject[] = [{ paperId }, { amendmentId: unfriendlyId }];

		for (const about of voteSubjects) {
			const voteId = await openVote(committee, about);
			await expectRefusal(
				decideAmendment(committee.chair, friendlyId, 'approve'),
				'22023',
				'Close the open vote on this draft first.'
			);
			// A vote still open may be cancelled, which makes way for the next one.
			await expectSuccess(committee.chair.supabase.from('votes').delete().eq('id', voteId));
		}

		expect((await storedAmendment(friendlyId)).status).toBe('with_the_dais');
		expect(await storedVersions(paperId)).toHaveLength(1);
	});
});

describe('withdraw_amendment', () => {
	it('takes an amendment back at any point before it is decided', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const awaitingId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		await updateCommittee(committee, {
			has_friendly_amendments: false,
			amendment_support_unit: 'seats',
			amendment_support_minimum: 2
		});
		const collectingId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1b'
		});
		await updateCommittee(committee, { amendment_support_minimum: 1 });
		const withTheDaisId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o2'
		});
		const approvedId = await proposeAmendment(committee.germany, paperId, {
			action: 'strike',
			clauseId: 'o2'
		});
		await approveAmendment(committee, approvedId);
		const waitingIds = [awaitingId, collectingId, withTheDaisId, approvedId];

		const statuses: string[] = [];
		for (const amendmentId of waitingIds) {
			statuses.push((await storedAmendment(amendmentId)).status);
		}
		expect(statuses).toEqual([
			'awaiting_sponsors',
			'collecting_support',
			'with_the_dais',
			'approved'
		]);

		for (const amendmentId of waitingIds) {
			await expectSuccess(withdrawAmendment(committee.germany, amendmentId));
			await expectEnded(amendmentId, 'withdrawn');
		}
	}, 60_000);

	// lapse_pending_children ends the amendments to it that were still waiting.
	it('lapses the amendments to the amendment withdrawn', async () => {
		const committee = await createPaperCommittee();
		await updateCommittee(committee, {
			has_friendly_amendments: false,
			has_second_degree_amendments: true
		});
		const paperId = await franceSubmitsPaper(committee);
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		const secondDegreeId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o1a',
			text: SECOND_DEGREE_TEXT,
			parentAmendmentId: amendmentId
		});

		await expectSuccess(withdrawAmendment(committee.germany, amendmentId));

		await expectEnded(amendmentId, 'withdrawn');
		await expectEnded(secondDegreeId, 'lapsed');
	});

	it('is for the proposer, before the amendment is decided and while nobody votes on it', async () => {
		const committee = await createPaperCommittee();
		await updateCommittee(committee, { has_friendly_amendments: false });
		const paperId = await franceSubmitsPaper(committee);
		const stranger = await createSignedInClient('Stranger');
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});

		for (const person of [committee.france, committee.chair]) {
			await expectRefusal(
				withdrawAmendment(person, amendmentId),
				'42501',
				'Only the delegate who proposed an amendment can withdraw it.'
			);
		}
		await expectRefusal(
			withdrawAmendment(stranger, amendmentId),
			'P0002',
			'That amendment does not exist.'
		);

		await approveAmendment(committee, amendmentId);
		const voteId = await openVote(committee, { amendmentId });
		await expectRefusal(
			withdrawAmendment(committee.germany, amendmentId),
			'22023',
			'Close the open vote on this amendment first.'
		);

		await expectSuccess(closeVote(committee.chair, voteId, false));
		await expectRefusal(
			withdrawAmendment(committee.germany, amendmentId),
			'22023',
			'This amendment can no longer be withdrawn.'
		);
	});

	// Rule 10: a vote belongs to what it is on, and closing it settles it. Withdrawing the
	// amendment that an amendment to an amendment changes would lapse the second one in the
	// middle of its vote, and closing that vote would then settle nothing.
	it('is refused while the committee votes on an amendment to the amendment', async () => {
		const committee = await createPaperCommittee();
		await updateCommittee(committee, {
			has_friendly_amendments: false,
			has_second_degree_amendments: true
		});
		const paperId = await franceSubmitsPaper(committee);
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		const secondDegreeId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o1a',
			text: SECOND_DEGREE_TEXT,
			parentAmendmentId: amendmentId
		});
		await approveAmendment(committee, amendmentId);
		await approveAmendment(committee, secondDegreeId);
		const voteId = await openVote(committee, { amendmentId: secondDegreeId });

		await expectRefusal(
			withdrawAmendment(committee.germany, amendmentId),
			'22023',
			'Close the open vote on the amendment to this amendment first.'
		);
		await expectSuccess(closeVote(committee.chair, voteId, true));
		await expectEnded(secondDegreeId, 'passed');
		expect(await storedAmendment(amendmentId)).toMatchObject({
			status: 'approved',
			text_markdown: SECOND_DEGREE_TEXT
		});
	});
});

describe('reorder_amendments', () => {
	it('orders the amendments waiting for the dais across the drafts of the committee', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const otherPaperId = await germanyIntroducesDraft(committee);
		// An author's own amendment is friendly at once, so each joins the dais's one queue.
		const firstId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		const secondId = await proposeAmendment(committee.germany, otherPaperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		const thirdId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o2'
		});
		expect(await queuePositions([firstId, secondId, thirdId])).toEqual([1, 2, 3]);

		await expectSuccess(
			reorderAmendments(committee.chair, committee.committeeId, [thirdId, secondId, firstId])
		);
		expect(await queuePositions([firstId, secondId, thirdId])).toEqual([3, 2, 1]);

		// The amendments left out keep their order, after the ones named.
		await expectSuccess(reorderAmendments(committee.chair, committee.committeeId, [firstId]));
		expect(await queuePositions([firstId, secondId, thirdId])).toEqual([1, 3, 2]);

		// A new amendment joins at the end.
		const fourthId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o1b'
		});
		expect(await queuePositions([fourthId])).toEqual([4]);
	}, 60_000);

	it('leaves alone the amendments of other committees and those not waiting for the dais', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const otherCommittee = await createPaperCommittee();
		const otherPaperId = await franceSubmitsPaper(otherCommittee);
		const firstId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		const secondId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o2'
		});
		const awaitingId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1b'
		});
		const elsewhereFirstId = await proposeAmendment(otherCommittee.france, otherPaperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		const elsewhereSecondId = await proposeAmendment(otherCommittee.france, otherPaperId, {
			action: 'change',
			clauseId: 'o2'
		});

		await expectSuccess(
			reorderAmendments(committee.chair, committee.committeeId, [
				elsewhereSecondId,
				awaitingId,
				secondId,
				firstId
			])
		);

		expect(await queuePositions([firstId, secondId, awaitingId])).toEqual([2, 1, null]);
		expect((await storedAmendment(awaitingId)).status).toBe('awaiting_sponsors');
		expect(await queuePositions([elsewhereFirstId, elsewhereSecondId])).toEqual([1, 2]);
	}, 60_000);

	it('is for the dais of the committee', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const daisMember = await addDaisMember(committee);
		const stranger = await createSignedInClient('Stranger');
		const firstId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		const secondId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o2'
		});

		for (const person of [committee.france, stranger]) {
			await expectRefusal(
				reorderAmendments(person, committee.committeeId, [secondId, firstId]),
				'42501',
				'Only the dais of this committee orders its amendments.'
			);
		}
		expect(await queuePositions([firstId, secondId])).toEqual([1, 2]);

		await expectSuccess(reorderAmendments(daisMember, committee.committeeId, [secondId, firstId]));
		expect(await queuePositions([firstId, secondId])).toEqual([2, 1]);
	});
});

// check_vote_paper (the trigger votes_check_paper) and settle_vote_paper (the trigger
// votes_settle_paper), for votes on amendments; votes on papers are in
// committee-papers.test.ts.
describe('check_vote_paper and settle_vote_paper on an amendment', () => {
	it('names the amendment, and writes it into the draft when it passes', async () => {
		const committee = await createPaperCommittee();
		await updateCommittee(committee, { has_friendly_amendments: false });
		const paperId = await franceSubmitsPaper(committee);
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'add',
			clauseId: 'o1'
		});
		await approveAmendment(committee, amendmentId);

		const { data: vote } = await tryOpeningVote(committee, { amendmentId });
		expect(vote?.subject).toBe('Amendment 1 to Draft resolution 1.1');
		await expectSuccess(closeVote(committee.chair, vote!.id, true));

		const [original, amended] = await storedVersions(paperId);
		expect(amended).toMatchObject({ version_number: 2, amendment_id: amendmentId });
		expect(amended.content).toEqual(
			applyAmendment(original.content, {
				action: 'add',
				targetPart: 'operative',
				targetClauseId: 'o1',
				textMarkdown: AMENDMENT_TEXT,
				sequence: 1
			})
		);
		await expectEnded(amendmentId, 'passed');
		expect(await outcomesToldTo(committee.germany)).toEqual([
			'Amendment 1 to Draft resolution 1.1 was approved and waits for its vote',
			'Amendment 1 to Draft resolution 1.1 passed'
		]);
	});

	it('lapses the amendments to an amendment that fails', async () => {
		const committee = await createPaperCommittee();
		await updateCommittee(committee, {
			has_friendly_amendments: false,
			has_second_degree_amendments: true,
			amendment_support_unit: 'seats',
			amendment_support_minimum: 2
		});
		const paperId = await franceSubmitsPaper(committee);
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		await expectSuccess(signAmendment(committee.france, amendmentId));
		await approveAmendment(committee, amendmentId);
		// An amendment to it that has not found its support yet does not hold up the vote.
		const secondDegreeId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o1a',
			text: SECOND_DEGREE_TEXT,
			parentAmendmentId: amendmentId
		});
		expect((await storedAmendment(secondDegreeId)).status).toBe('collecting_support');

		await voteOn(committee, { amendmentId }, false);

		await expectEnded(amendmentId, 'failed');
		await expectEnded(secondDegreeId, 'lapsed');
		expect(await storedVersions(paperId)).toHaveLength(1);
		expect(await outcomesToldTo(committee.germany)).toContain(
			'Amendment 1 to Draft resolution 1.1 failed'
		);
	});

	it('rewrites the amendment an amendment to an amendment changes, which then has its own vote', async () => {
		const committee = await createPaperCommittee();
		await updateCommittee(committee, {
			has_friendly_amendments: false,
			has_second_degree_amendments: true
		});
		const paperId = await franceSubmitsPaper(committee);
		const spain = await addSeatedDelegate(committee, 'Spain', 'ES');
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		const secondDegreeId = await proposeAmendment(spain, paperId, {
			action: 'change',
			clauseId: 'o1a',
			text: SECOND_DEGREE_TEXT,
			parentAmendmentId: amendmentId
		});
		await approveAmendment(committee, amendmentId);
		await approveAmendment(committee, secondDegreeId);

		await expectRefusal(
			tryOpeningVote(committee, { amendmentId }),
			'22023',
			'Vote on the amendment to this amendment first.'
		);

		const { data: vote } = await tryOpeningVote(committee, { amendmentId: secondDegreeId });
		expect(vote?.subject).toBe('Amendment 2 to Draft resolution 1.1');
		await expectSuccess(closeVote(committee.chair, vote!.id, true));

		// It changed words, not the draft, so the draft has no new version yet.
		await expectEnded(secondDegreeId, 'passed');
		expect(await storedAmendment(amendmentId)).toMatchObject({
			status: 'approved',
			text_markdown: SECOND_DEGREE_TEXT
		});
		expect(await storedVersions(paperId)).toHaveLength(1);
		expect(await outcomesToldTo(spain)).toEqual([
			'Amendment 2 to Draft resolution 1.1 was approved and waits for its vote',
			'Amendment 2 to Draft resolution 1.1 passed'
		]);

		await voteOn(committee, { amendmentId }, true);

		const [original, amended] = await storedVersions(paperId);
		expect(amended.content).toEqual(
			applyAmendment(original.content, {
				action: 'change',
				targetPart: 'operative',
				targetClauseId: 'o1a',
				textMarkdown: SECOND_DEGREE_TEXT,
				sequence: 1
			})
		);
		await expectEnded(amendmentId, 'passed');
	}, 60_000);

	it('opens only on an amendment the dais has approved, after the amendment it changes', async () => {
		const committee = await createPaperCommittee();
		await updateCommittee(committee, {
			has_friendly_amendments: false,
			has_second_degree_amendments: true
		});
		const paperId = await franceSubmitsPaper(committee);
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		const secondDegreeId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o1a',
			text: SECOND_DEGREE_TEXT,
			parentAmendmentId: amendmentId
		});

		await expectRefusal(
			tryOpeningVote(committee, { amendmentId }),
			'22023',
			'Only an amendment the dais has approved is voted on.'
		);

		// The dais may approve the amendment to an amendment first, but its vote waits.
		await approveAmendment(committee, secondDegreeId);
		await expectRefusal(
			tryOpeningVote(committee, { amendmentId: secondDegreeId }),
			'22023',
			'Approve the amendment it changes first.'
		);
	});

	// Rule 9: an amendment to an amendment is voted on before it. One that has found its
	// support and waits for the dais would otherwise lapse, unanswered, in the vote on the
	// amendment it changes.
	it('waits for the dais to decide an amendment to the amendment that has its support', async () => {
		const committee = await createPaperCommittee();
		await updateCommittee(committee, {
			has_friendly_amendments: false,
			has_second_degree_amendments: true
		});
		const paperId = await franceSubmitsPaper(committee);
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		await approveAmendment(committee, amendmentId);
		const secondDegreeId = await proposeAmendment(committee.france, paperId, {
			action: 'change',
			clauseId: 'o1a',
			text: SECOND_DEGREE_TEXT,
			parentAmendmentId: amendmentId
		});
		expect((await storedAmendment(secondDegreeId)).status).toBe('with_the_dais');

		await expectRefusal(
			tryOpeningVote(committee, { amendmentId }),
			'22023',
			'Decide the amendment to this amendment first.'
		);

		// Ruled out of order, it no longer holds the vote up.
		await expectSuccess(
			decideAmendment(
				committee.chair,
				secondDegreeId,
				'out_of_order',
				'It changes nothing the amendment says.'
			)
		);
		await expectSuccess(tryOpeningVote(committee, { amendmentId }));
	});

	it('is one at a time on a draft and its amendments', async () => {
		const committee = await createPaperCommittee();
		await updateCommittee(committee, { has_friendly_amendments: false });
		const paperId = await franceSubmitsPaper(committee);
		const firstId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		const secondId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o2'
		});
		await approveAmendment(committee, firstId);
		await approveAmendment(committee, secondId);
		const voteId = await openVote(committee, { amendmentId: firstId });
		const voteSubjects: VoteSubject[] = [{ paperId }, { amendmentId: secondId }];

		for (const about of voteSubjects) {
			await expectRefusal(
				tryOpeningVote(committee, about),
				'22023',
				'Close the open vote on this draft first.'
			);
		}
		// Nor is the draft withdrawn from under the vote.
		await expectRefusal(
			withdrawPaper(committee.chair, paperId),
			'22023',
			'Close the open vote first.'
		);

		await expectSuccess(closeVote(committee.chair, voteId, false));
		await expectSuccess(tryOpeningVote(committee, { amendmentId: secondId }));
	});
});

// apply_amendment_to_paper lapses the waiting amendments whose clause the new version no
// longer has, which it asks paper_content_has_clause; settle_vote_paper and withdraw_paper
// lapse them all when the draft itself is decided.
describe('Amendments that lapse', () => {
	it('lapse when the clause they change, or the clause they follow, is struck', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		// Germany's amendments wait for France's answer; France's own is friendly at once.
		const subClauseId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		const followingId = await proposeAmendment(committee.germany, paperId, {
			action: 'add',
			clauseId: 'o1'
		});
		const otherClauseId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o2'
		});
		const atTheStartId = await proposeAmendment(committee.germany, paperId, {
			action: 'add',
			clauseId: null
		});
		const strikeId = await proposeAmendment(committee.france, paperId, {
			action: 'strike',
			clauseId: 'o1'
		});

		await approveAmendment(committee, strikeId);

		await expectEnded(subClauseId, 'lapsed');
		await expectEnded(followingId, 'lapsed');
		for (const amendmentId of [otherClauseId, atTheStartId]) {
			expect((await storedAmendment(amendmentId)).status).toBe('awaiting_sponsors');
		}
	});

	const DRAFT_ENDINGS: [string, (committee: PaperCommittee, paperId: string) => Promise<void>][] = [
		['passes', (committee, paperId) => voteOn(committee, { paperId }, true)],
		['fails', (committee, paperId) => voteOn(committee, { paperId }, false)],
		['is withdrawn', (committee, paperId) => expectSuccess(withdrawPaper(committee.chair, paperId))]
	];

	// it.each runs the test once for each row, with the row's values as its arguments and
	// the first of them in its name.
	it.each(DRAFT_ENDINGS)(
		'lapse, every one still waiting, when the draft %s',
		async (_ending, endTheDraft) => {
			const committee = await createPaperCommittee();
			const paperId = await franceSubmitsPaper(committee);
			const awaitingId = await proposeAmendment(committee.germany, paperId, {
				action: 'change',
				clauseId: 'o1a'
			});
			const withTheDaisId = await proposeAmendment(committee.france, paperId, {
				action: 'change',
				clauseId: 'o1b'
			});
			const approvedId = await proposeAmendment(committee.germany, paperId, {
				action: 'change',
				clauseId: 'o2'
			});
			await expectSuccess(makeUnfriendly(committee.germany, approvedId));
			await approveAmendment(committee, approvedId);
			const outOfOrderId = await proposeAmendment(committee.france, paperId, {
				action: 'strike',
				clauseId: 'o2'
			});
			await expectSuccess(
				decideAmendment(committee.chair, outOfOrderId, 'out_of_order', 'The draft needs it.')
			);

			await endTheDraft(committee, paperId);

			for (const amendmentId of [awaitingId, withTheDaisId, approvedId]) {
				await expectEnded(amendmentId, 'lapsed');
			}
			// An amendment already decided keeps its decision.
			expect((await storedAmendment(outOfOrderId)).status).toBe('out_of_order');
		},
		60_000
	);
});

describe('Who reads amendments', () => {
	it('shows the amendments to a draft, and their seats, to whoever may read the draft', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const observer = await addSeatedDelegate(committee, 'Holy See', 'VA', 'observer');
		const daisMember = await addDaisMember(committee);
		const volunteer = await addVolunteer(committee);
		const stranger = await createSignedInClient('Stranger');
		const otherCommitteeDelegate = await delegateOfAnotherCommittee(committee);
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});
		const readers = {
			author: committee.france,
			proposer: committee.germany,
			observer,
			chair: committee.chair,
			daisMember,
			volunteer,
			stranger,
			otherCommitteeDelegate
		};

		// How many amendments, and how many of their seats, each reader is shown.
		const shown: Record<string, [number, number]> = {};
		for (const [name, reader] of Object.entries(readers)) {
			const { data: amendments } = await reader.supabase
				.from('amendments')
				.select('id')
				.eq('paper_id', paperId);
			const { data: seats } = await reader.supabase
				.from('amendment_seats')
				.select('seat_id')
				.eq('amendment_id', amendmentId);
			shown[name] = [amendments?.length ?? 0, seats?.length ?? 0];
		}

		expect(shown).toEqual({
			author: [1, 1],
			proposer: [1, 1],
			observer: [1, 1],
			chair: [1, 1],
			daisMember: [1, 1],
			volunteer: [1, 1],
			stranger: [0, 0],
			otherCommitteeDelegate: [0, 0]
		});
	});

	it('shows a visitor neither table', async () => {
		const visitor = createVisitorClient();

		for (const table of ['amendments', 'amendment_seats']) {
			const { error } = await visitor.from(table).select('*');

			expect(error?.code).toBe('42501');
		}
	});

	it('lets nobody write either table except through the functions', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const amendmentId = await proposeAmendment(committee.germany, paperId, {
			action: 'change',
			clauseId: 'o1a'
		});

		const { error: insertError } = await committee.germany.supabase.from('amendments').insert({
			paper_id: paperId,
			sequence: 2,
			proposed_by_seat_id: committee.germany.seatId,
			action: 'strike',
			target_part: 'operative',
			target_clause_id: 'o2',
			status: 'with_the_dais',
			is_friendly: true,
			queue_position: 1
		});
		expect(insertError?.message).toContain('row-level security');

		const { error: signatureError } = await committee.france.supabase
			.from('amendment_seats')
			.insert({ amendment_id: amendmentId, seat_id: committee.france.seatId, role: 'signatory' });
		expect(signatureError?.message).toContain('row-level security');

		// The chair cannot skip the sponsors, and the proposer cannot erase the amendment.
		const { data: updated } = await committee.chair.supabase
			.from('amendments')
			.update({ status: 'with_the_dais', queue_position: 1 })
			.eq('id', amendmentId)
			.select('id');
		expect(updated).toEqual([]);
		const { data: deleted } = await committee.germany.supabase
			.from('amendments')
			.delete()
			.eq('id', amendmentId)
			.select('id');
		expect(deleted).toEqual([]);

		expect(await storedAmendment(amendmentId)).toMatchObject({
			status: 'awaiting_sponsors',
			queue_position: null
		});
	});
});

/** An amendment as the editor describes it, numbered 7 on its draft. */
function clauseAmendment(
	action: AmendmentAction,
	targetPart: ClausePart,
	targetClauseId: string | null
): ClauseAmendment {
	const textMarkdown = action === 'strike' ? null : AMENDMENT_TEXT;

	return { action, targetPart, targetClauseId, textMarkdown, sequence: 7 };
}

const CLAUSE_EDITS: [string, ClauseContent, ClauseAmendment][] = [
	[
		'changes a clause and keeps its sub-clauses',
		DEEP_CONTENT,
		clauseAmendment('change', 'operative', 'o1a')
	],
	[
		'changes a clause at the third level',
		DEEP_CONTENT,
		clauseAmendment('change', 'operative', 'o1a1')
	],
	[
		'strikes a clause with its sub-clauses',
		DEEP_CONTENT,
		clauseAmendment('strike', 'operative', 'o1')
	],
	[
		'strikes a clause at the third level',
		DEEP_CONTENT,
		clauseAmendment('strike', 'operative', 'o1a2')
	],
	[
		'adds a clause after another at its level',
		DEEP_CONTENT,
		clauseAmendment('add', 'operative', 'o1')
	],
	[
		'adds a clause after one at the third level',
		DEEP_CONTENT,
		clauseAmendment('add', 'operative', 'o1a1')
	],
	[
		'adds a clause first among the operative clauses',
		FIXTURE_CONTENT,
		clauseAmendment('add', 'operative', null)
	],
	['changes a preambulatory clause', FIXTURE_CONTENT, clauseAmendment('change', 'preamble', 'p2')],
	['strikes a preambulatory clause', FIXTURE_CONTENT, clauseAmendment('strike', 'preamble', 'p1')],
	[
		'adds a preambulatory clause after another',
		DEEP_CONTENT,
		clauseAmendment('add', 'preamble', 'p1')
	],
	['adds a clause first in the preamble', FIXTURE_CONTENT, clauseAmendment('add', 'preamble', null)]
];

// The editor shows an amendment with applyAmendment, and the database writes it in with
// apply_amendment_to_content and amend_clause_list, so the two must make the same clauses.
describe('apply_amendment_to_content', () => {
	it.each(CLAUSE_EDITS)('%s as the editor does', async (_edit, content, amendment) => {
		const amendedInTheDatabase = await contentAmendedInTheDatabase(content, amendment);

		expect(amendedInTheDatabase).toEqual(applyAmendment(content, amendment));
		expect(amendedInTheDatabase).not.toEqual(content);
	});

	it('leaves the clauses as they are when the clause is not there, as the editor does', async () => {
		const amendment = clauseAmendment('change', 'operative', 'o9');

		expect(await contentAmendedInTheDatabase(FIXTURE_CONTENT, amendment)).toEqual(FIXTURE_CONTENT);
		expect(applyAmendment(FIXTURE_CONTENT, amendment)).toEqual(FIXTURE_CONTENT);
	});
});

const CLAUSES_LOOKED_FOR: [ClausePart, string, boolean][] = [
	['operative', 'o1a1', true],
	['operative', 'o2', true],
	['preamble', 'p2', true],
	['preamble', 'o1', false],
	['operative', 'p1', false],
	['operative', 'o9', false]
];

describe('paper_content_has_clause', () => {
	it.each(CLAUSES_LOOKED_FOR)(
		'looks in the %s, at every level, for clause %s (%s)',
		async (part, clauseId, isThere) => {
			const { data, error } = await createServiceRoleClient().rpc('paper_content_has_clause', {
				content: DEEP_CONTENT,
				part,
				clause_id: clauseId
			});

			expect(error).toBeNull();
			expect(data).toBe(isThere);
		}
	);
});

/** Each function a person presses, with arguments it would take. */
const PRESSED_FUNCTIONS: [string, Record<string, unknown>][] = [
	[
		'propose_amendment',
		{
			paper_id: UNKNOWN_ID,
			action: 'change',
			target_part: 'operative',
			target_clause_id: 'o1a',
			text_markdown: AMENDMENT_TEXT
		}
	],
	['answer_amendment', { amendment_id: UNKNOWN_ID, accepts: true }],
	['make_amendment_unfriendly', { amendment_id: UNKNOWN_ID }],
	['sign_amendment', { amendment_id: UNKNOWN_ID }],
	['decide_amendment', { amendment_id: UNKNOWN_ID, decision: 'approve' }],
	['withdraw_amendment', { amendment_id: UNKNOWN_ID }],
	['reorder_amendments', { committee_id: UNKNOWN_ID, amendment_ids: [UNKNOWN_ID] }]
];

/** Each function behind them, with arguments it would take. */
const INTERNAL_FUNCTIONS: [string, Record<string, unknown>][] = [
	['lock_amendment', { amendment_id: UNKNOWN_ID }],
	['notify_amendment_proposer', { amendment_id: UNKNOWN_ID, outcome: 'passed' }],
	['send_amendment_to_the_dais', { amendment_id: UNKNOWN_ID, is_friendly: true }],
	['route_unfriendly_amendment', { amendment_id: UNKNOWN_ID }],
	['lapse_pending_children', { amendment_id: UNKNOWN_ID }],
	['apply_amendment_to_paper', { amendment_id: UNKNOWN_ID, final_status: 'written_in' }],
	[
		'apply_amendment_to_content',
		{
			content: FIXTURE_CONTENT,
			action: 'strike',
			target_part: 'operative',
			target_clause_id: 'o2',
			text_markdown: null,
			new_clause_id: 'a1'
		}
	],
	[
		'amend_clause_list',
		{
			clauses: FIXTURE_CONTENT.operative,
			action: 'strike',
			target_clause_id: 'o2',
			text_markdown: null,
			new_clause: null
		}
	],
	['paper_content_has_clause', { content: FIXTURE_CONTENT, part: 'operative', clause_id: 'o2' }]
];

describe('Who may call the functions', () => {
	it.each(PRESSED_FUNCTIONS)('a visitor may not call %s', async (name, args) => {
		const { error } = await createVisitorClient().rpc(name, args);

		expect(error?.code).toBe('42501');
	});

	// The functions behind the ones a person presses trust their caller to have checked who
	// is asking, so nobody signed in may call them directly.
	it.each(INTERNAL_FUNCTIONS)('nobody signed in may call %s', async (name, args) => {
		const delegate = await createSignedInClient('Curious Delegate');
		const { error } = await delegate.supabase.rpc(name, args);

		expect(error).toMatchObject({
			code: '42501',
			message: `permission denied for function ${name}`
		});
	});
});
