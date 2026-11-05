import { clauseContentFromMarkdown } from '../../src/lib/paper-clauses';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { seatDelegateAs } from './document-fixtures';
import { addScheduleCommittee, createScheduleConference } from './schedule-fixtures';
import { createTestUser, makeCommitteeChair, type TestUser } from './signed-in-user';

// What the browser tests of docs/committee-papers.md begin with: a conference
// with one committee, DISEC, on two topics, its chair, and three delegates
// seated in it, for France, Mexico and Ghana. Papers are written straight
// into the database, the way `start_paper` and `add_paper_author` leave them.
//
// The service-role client writes these rows. It arranges the state a test
// begins in and is never used to show that something is allowed, which is
// what `tests/db/supabase-test-client.ts` warns against: who may do what is
// `tests/db/committee-papers.test.ts`'s work.

/** The committee's agenda. Every paper written here is on the first topic. */
export const PAPER_TOPICS = ['Lethal autonomous weapons', 'Cyber security'];

/** One committee and the people in it, as `makePaperCommittee` makes them. */
export type PaperCommitteeRoom = {
	/** The committee's own page. */
	committeePath: string;
	/** The committee's papers, under "Resolutions". */
	papersPath: string;
	committeeId: string;
	chair: TestUser;
	/** The delegate of France, who starts the papers. */
	clara: TestUser;
	/** The delegate of Mexico. */
	daniel: TestUser;
	/** The delegate of Ghana, on none of the papers. */
	amara: TestUser;
	franceSeatId: string;
	mexicoSeatId: string;
	ghanaSeatId: string;
};

/** Make the conference, DISEC and its chair, and seat France, Mexico and Ghana. */
export async function makePaperCommittee(namePrefix: string): Promise<PaperCommitteeRoom> {
	const organiser = await createTestUser(`${namePrefix} Organiser`);
	const conference = await createScheduleConference({ owner: organiser, namePrefix });
	const committeeId = await addScheduleCommittee(conference.id, {
		name: 'Disarmament and International Security',
		abbreviation: 'DISEC'
	});
	const admin = createServiceRoleClient();

	const { data: committee, error } = await admin
		.from('committees')
		.update({ topics: PAPER_TOPICS })
		.eq('id', committeeId)
		.select('slug')
		.single();

	if (error || !committee) {
		throw new Error(`Could not give the test committee its topics: ${error?.message}`);
	}

	const [chair, clara, daniel, amara] = await Promise.all([
		createTestUser(`${namePrefix} Chair`),
		createTestUser('Clara Whitfield'),
		createTestUser('Daniel Osei'),
		createTestUser('Amara Mensah')
	]);
	await makeCommitteeChair(chair, committeeId);

	const franceSeatId = await seatDelegateAs(clara, committeeId, 'France');
	const mexicoSeatId = await seatDelegateAs(daniel, committeeId, 'Mexico');
	const ghanaSeatId = await seatDelegateAs(amara, committeeId, 'Ghana');
	// `seatDelegateAs` writes a seat without a country, and a paper's people draw a flag for one.
	await Promise.all([
		admin.from('seats').update({ country_code: 'FR' }).eq('id', franceSeatId),
		admin.from('seats').update({ country_code: 'MX' }).eq('id', mexicoSeatId),
		admin.from('seats').update({ country_code: 'GH' }).eq('id', ghanaSeatId)
	]);

	const committeePath = `/conferences/${conference.slug}/committees/${committee.slug}`;

	return {
		committeePath,
		papersPath: `${committeePath}/resolutions`,
		committeeId,
		chair,
		clara,
		daniel,
		amara,
		franceSeatId,
		mexicoSeatId,
		ghanaSeatId
	};
}

/** One working paper, as `addWorkingPaper` writes it. */
export type WorkingPaperSeed = {
	title: string;
	body: string;
	/** The seats that write it in the order they joined it. The first started it and leads. */
	authorSeatIds: string[];
	/**
	 * Whether the dais has approved it as Working Paper 1.1 and the committee
	 * has introduced it, which lets every delegate in the committee read it. A
	 * working paper is never open for signatures, so this is the first time
	 * anybody but its authors may.
	 */
	isIntroduced?: boolean;
};

/** Write a working paper on the first topic, being written by its authors. Answers its id. */
export async function addWorkingPaper(
	committeeId: string,
	seed: WorkingPaperSeed
): Promise<string> {
	const admin = createServiceRoleClient();
	const [leadSeatId] = seed.authorSeatIds;

	const { data: paper, error } = await admin
		.from('committee_papers')
		.insert({
			committee_id: committeeId,
			kind: 'working_paper',
			title: seed.title,
			topic: PAPER_TOPICS[0],
			started_by_seat_id: leadSeatId,
			lead_seat_id: leadSeatId,
			body_markdown: seed.body
		})
		.select('id')
		.single();

	if (error || !paper) {
		throw new Error(`Could not write the test paper: ${error?.message}`);
	}

	// A minute apart, so which author joined first is never a tie.
	const firstJoinedAt = Date.now() - seed.authorSeatIds.length * 60_000;
	const { error: authorsError } = await admin.from('committee_paper_seats').insert(
		seed.authorSeatIds.map((seatId, index) => ({
			paper_id: paper.id,
			seat_id: seatId,
			role: 'author' as const,
			added_at: new Date(firstJoinedAt + index * 60_000).toISOString()
		}))
	);

	if (authorsError) {
		throw new Error(`Could not add the test paper's authors: ${authorsError.message}`);
	}

	// Last, because the database fixes a paper's authors once it is submitted.
	if (seed.isIntroduced) {
		const now = new Date().toISOString();
		const { error: introducedError } = await admin
			.from('committee_papers')
			.update({
				status: 'introduced',
				topic_number: 1,
				sequence: 1,
				submitted_at: now,
				decided_at: now,
				introduced_at: now
			})
			.eq('id', paper.id);

		if (introducedError) {
			throw new Error(`Could not introduce the test paper: ${introducedError.message}`);
		}
	}

	return paper.id;
}

/** The paper's text, who saved it last and which seat leads it, straight from the database. */
export async function readStoredPaper(paperId: string) {
	const { data, error } = await createServiceRoleClient()
		.from('committee_papers')
		.select('body_markdown, updated_by, lead_seat_id')
		.eq('id', paperId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the test paper: ${error?.message}`);
	}

	return data;
}

/** One draft resolution, as `addDraftResolution` writes it. */
export type DraftResolutionSeed = {
	title: string;
	/** The preambulatory clauses, a paragraph each. */
	preamble: string;
	/** The operative clauses, one numbered list. */
	operative: string;
	/** The seats that sponsor it in the order they joined it. The first started it and leads. */
	authorSeatIds: string[];
};

/** Write a draft resolution on the first topic, being written by its sponsors. Answers its id. */
export async function addDraftResolution(
	committeeId: string,
	seed: DraftResolutionSeed
): Promise<string> {
	const admin = createServiceRoleClient();
	const [leadSeatId] = seed.authorSeatIds;

	const { data: paper, error } = await admin
		.from('committee_papers')
		.insert({
			committee_id: committeeId,
			kind: 'draft_resolution',
			title: seed.title,
			topic: PAPER_TOPICS[0],
			started_by_seat_id: leadSeatId,
			lead_seat_id: leadSeatId,
			preamble_markdown: seed.preamble,
			operative_markdown: seed.operative
		})
		.select('id')
		.single();

	if (error || !paper) {
		throw new Error(`Could not write the test draft: ${error?.message}`);
	}

	const firstJoinedAt = Date.now() - seed.authorSeatIds.length * 60_000;
	const { error: authorsError } = await admin.from('committee_paper_seats').insert(
		seed.authorSeatIds.map((seatId, index) => ({
			paper_id: paper.id,
			seat_id: seatId,
			role: 'author' as const,
			added_at: new Date(firstJoinedAt + index * 60_000).toISOString()
		}))
	);

	if (authorsError) {
		throw new Error(`Could not add the test draft's sponsors: ${authorsError.message}`);
	}

	return paper.id;
}

/**
 * Send a paper to the dais as it stands, as `submit_paper` leaves it: status
 * submitted, the time it went, and version 1 of its text frozen. The checks
 * `submit_paper` makes first, such as enough support, are skipped, as the
 * tests that use this are about what the dais does next. `submittedAt`
 * fixes the time the page shows, for a screenshot to hold beside the board.
 */
export async function submitPaperAsIs(paperId: string, submittedAt = new Date()): Promise<void> {
	const admin = createServiceRoleClient();

	const { data: paper, error } = await admin
		.from('committee_papers')
		.update({ status: 'submitted', submitted_at: submittedAt.toISOString() })
		.eq('id', paperId)
		.select('body_markdown, preamble_markdown, operative_markdown')
		.single();

	if (error || !paper) {
		throw new Error(`Could not submit the test paper: ${error?.message}`);
	}

	// A draft resolution's text is its two parts; a working paper's is its body.
	const markdown =
		paper.preamble_markdown || paper.operative_markdown
			? [paper.preamble_markdown, paper.operative_markdown].join('\n\n')
			: paper.body_markdown;
	const { error: versionError } = await admin
		.from('committee_paper_versions')
		.insert({ paper_id: paperId, version_number: 1, content: { markdown } });

	if (versionError) {
		throw new Error(`Could not freeze the test paper's text: ${versionError.message}`);
	}
}

/**
 * Approve a submitted paper as the dais does, numbering it on the first
 * topic: "Working paper 1.1", or 1.2 with `sequence` 2. It then waits for a
 * motion to introduce it.
 */
export async function approvePaperAsIs(paperId: string, sequence = 1): Promise<void> {
	const { error } = await createServiceRoleClient()
		.from('committee_papers')
		.update({
			status: 'approved',
			topic_number: 1,
			sequence,
			decided_at: new Date().toISOString()
		})
		.eq('id', paperId);

	if (error) throw new Error(`Could not approve the test paper: ${error.message}`);
}

/**
 * Introduce an approved paper as a passed motion does, and put it on the
 * committee's projector, as `introduce_paper` leaves both.
 */
export async function introducePaperAsIs(committeeId: string, paperId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('committee_papers')
		.update({ status: 'introduced', introduced_at: new Date().toISOString() })
		.eq('id', paperId);

	if (error) throw new Error(`Could not introduce the test paper: ${error.message}`);

	const { error: stateError } = await admin
		.from('committee_state')
		.update({ displayed_paper_id: paperId })
		.eq('committee_id', committeeId);

	if (stateError) throw new Error(`Could not show the test paper: ${stateError.message}`);
}

/** A thread on words of a paper, as `start_thread` leaves one, with its first comment. */
export async function startThreadAsIs(
	paperId: string,
	thread: { writer: TestUser; seatId: string; quotedText: string; body: string }
): Promise<void> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('paper_comment_threads')
		.insert({
			committee_paper_id: paperId,
			quoted_text: thread.quotedText,
			started_by: thread.writer.id,
			started_by_seat_id: thread.seatId
		})
		.select('id')
		.single();

	if (error || !data) throw new Error(`Could not start the test thread: ${error?.message}`);

	const { error: commentError } = await admin
		.from('paper_comments')
		.insert({ thread_id: data.id, written_by: thread.writer.id, body: thread.body });

	if (commentError) throw new Error(`Could not write the test comment: ${commentError.message}`);
}

// What `paper-votes.spec.ts` adds for step 8, "Voting on papers, and the
// record": debate closed, and a draft voted on, straight in the database.

/** The committee's running session, which a motion and a vote belong to. */
async function runningSessionIdOf(committeeId: string): Promise<string> {
	const { data, error } = await createServiceRoleClient()
		.from('committee_state')
		.select('current_session_id')
		.eq('committee_id', committeeId)
		.single();

	if (error || !data?.current_session_id) {
		throw new Error(`The test committee has no running session: ${error?.message}`);
	}

	return data.current_session_id;
}

/**
 * Pass a motion to close debate in the running session, as the dais does
 * before voting procedure. The vote form lists the introduced drafts from then on.
 */
export async function closeDebateAsIs(committeeId: string): Promise<void> {
	const { error } = await createServiceRoleClient()
		.from('motions')
		.insert({
			committee_id: committeeId,
			session_id: await runningSessionIdOf(committeeId),
			kind: 'close_debate',
			status: 'passed',
			started_without_vote: true
		});

	if (error) throw new Error(`Could not close debate: ${error.message}`);
}

/**
 * Vote on an introduced draft in the running session and close the vote with
 * these counts, as the chair's "Close vote" does. The database's
 * `settle_vote_paper` then marks the draft passed or failed, as for real.
 */
export async function voteOnPaperAsIs(
	committeeId: string,
	paperId: string,
	counts: { for: number; against: number; abstain: number }
): Promise<void> {
	const admin = createServiceRoleClient();

	const { data: vote, error } = await admin
		.from('votes')
		.insert({
			committee_id: committeeId,
			session_id: await runningSessionIdOf(committeeId),
			paper_id: paperId,
			kind: 'substantive',
			method: 'show_of_hands',
			majority: 'simple',
			status: 'open',
			opened_at: new Date().toISOString()
		})
		.select('id')
		.single();

	if (error || !vote) throw new Error(`Could not open the test vote: ${error?.message}`);

	const { error: closeError } = await admin
		.from('votes')
		.update({
			votes_for: counts.for,
			votes_against: counts.against,
			votes_abstain: counts.abstain,
			passed: counts.for > counts.against,
			status: 'closed',
			closed_at: new Date().toISOString()
		})
		.eq('id', vote.id);

	if (closeError) throw new Error(`Could not close the test vote: ${closeError.message}`);
}

/** An introduced draft resolution, as `addIntroducedDraft` writes it. */
export type IntroducedDraftSeed = DraftResolutionSeed & {
	/** When it was introduced, which the page's facts line shows. Now by default. */
	introducedAt?: Date;
};

/**
 * Write a draft resolution and take it to the floor as Draft resolution 1.1:
 * submitted, approved and introduced. `submit_paper` freezes a draft's text as
 * clauses with ids, which the amendments point at, so version 1 is written
 * that way here too, rather than as `submitPaperAsIs` leaves a working paper.
 * Answers its id.
 */
export async function addIntroducedDraft(
	committeeId: string,
	seed: IntroducedDraftSeed
): Promise<string> {
	const paperId = await addDraftResolution(committeeId, seed);
	await submitPaperAsIs(paperId);
	await approvePaperAsIs(paperId);
	await introducePaperAsIs(committeeId, paperId);

	const admin = createServiceRoleClient();
	const { error } = await admin
		.from('committee_paper_versions')
		.update({ content: clauseContentFromMarkdown(seed.preamble, seed.operative) })
		.eq('paper_id', paperId)
		.eq('version_number', 1);

	if (error) throw new Error(`Could not freeze the test draft's clauses: ${error.message}`);

	if (seed.introducedAt) {
		const { error: dateError } = await admin
			.from('committee_papers')
			.update({ introduced_at: seed.introducedAt.toISOString() })
			.eq('id', paperId);

		if (dateError) throw new Error(`Could not date the test draft: ${dateError.message}`);
	}

	return paperId;
}

/** The committee's rules for amendments, as its chair sets them in the committee's settings. */
export type AmendmentRulesSeed = Partial<{
	has_friendly_amendments: boolean;
	amendment_support_minimum: number;
	amendment_support_unit: 'seats' | 'percent';
	preamble_amendable: boolean;
	has_second_degree_amendments: boolean;
}>;

/** Change the committee's rules for amendments. */
export async function setAmendmentRules(
	committeeId: string,
	rules: AmendmentRulesSeed
): Promise<void> {
	const { error } = await createServiceRoleClient()
		.from('committees')
		.update(rules)
		.eq('id', committeeId);

	if (error)
		throw new Error(`Could not set the test committee's amendment rules: ${error.message}`);
}

/** One amendment, as `addAmendmentAsIs` writes it. */
export type AmendmentSeed = {
	/** "Amendment 1" is 1. */
	sequence: number;
	proposedBySeatId: string;
	action: 'add' | 'change' | 'strike';
	/** The clause changed or struck, such as `o2`, or the one an addition follows. */
	clauseId: string;
	/** The words, or nothing for a strike. */
	text?: string;
	status: 'awaiting_sponsors' | 'collecting_support' | 'with_the_dais' | 'approved';
	isFriendly?: boolean;
	/** Its place in the dais's queue, for an amendment with the dais. */
	queuePosition?: number;
	/** The amendment this one amends. */
	parentId?: string;
	/** The sponsors asked whether it is friendly, none of whom has answered yet. */
	askedSponsorSeatIds?: string[];
};

/**
 * Write an amendment to the operative clauses of an introduced draft, as
 * `propose_amendment` and the answers after it leave one, based on the
 * draft's first version. Answers its id.
 */
export async function addAmendmentAsIs(paperId: string, seed: AmendmentSeed): Promise<string> {
	const admin = createServiceRoleClient();

	const { data: version, error: versionError } = await admin
		.from('committee_paper_versions')
		.select('id')
		.eq('paper_id', paperId)
		.eq('version_number', 1)
		.single();

	if (versionError || !version) {
		throw new Error(`Could not find the test draft's text: ${versionError?.message}`);
	}

	const { data: amendment, error } = await admin
		.from('amendments')
		.insert({
			paper_id: paperId,
			sequence: seed.sequence,
			proposed_by_seat_id: seed.proposedBySeatId,
			action: seed.action,
			target_part: 'operative',
			target_clause_id: seed.clauseId,
			text_markdown: seed.action === 'strike' ? null : (seed.text ?? null),
			parent_amendment_id: seed.parentId ?? null,
			status: seed.status,
			is_friendly: seed.isFriendly ?? false,
			queue_position: seed.status === 'with_the_dais' ? (seed.queuePosition ?? 1) : null,
			based_on_version_id: version.id
		})
		.select('id')
		.single();

	if (error || !amendment) throw new Error(`Could not write the test amendment: ${error?.message}`);

	const asked = seed.askedSponsorSeatIds ?? [];
	if (asked.length > 0) {
		const { error: askedError } = await admin.from('amendment_seats').insert(
			asked.map((seatId) => ({
				amendment_id: amendment.id,
				seat_id: seatId,
				role: 'sponsor_answer'
			}))
		);

		if (askedError) throw new Error(`Could not ask the test sponsors: ${askedError.message}`);
	}

	return amendment.id;
}

/** An amendment's status and ruling, straight from the database. */
export async function readStoredAmendment(amendmentId: string) {
	const { data, error } = await createServiceRoleClient()
		.from('amendments')
		.select('status, is_friendly, ruling, queue_position')
		.eq('id', amendmentId)
		.single();

	if (error || !data) throw new Error(`Could not read the test amendment: ${error?.message}`);

	return data;
}
