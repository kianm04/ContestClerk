import type { PostgrestError } from '@supabase/supabase-js';
import { expect } from 'vitest';
import type { Database } from '$lib/database.types';
import { clauseContentFromMarkdown } from '$lib/paper-clauses';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addRole,
	addSeat,
	addStaff,
	createCommitteeRoom,
	giveRole,
	giveSeatTo,
	type CommitteeRoomFixture
} from './conference-fixtures';

// The committees, people and papers that the database tests of
// docs/committee-papers.md are written about: committee-papers.test.ts and
// the files beside it. As in conference-fixtures.ts, every step goes through
// the client of the person who would press the button, so a fixture only
// builds while the functions and policies let that person do it.

/** The kinds of paper, as the database spells them. */
export type PaperKind = Database['public']['Enums']['paper_kind'];

/** The kinds of seat; an observer's seat signs papers but never writes them. */
type SeatKind = Database['public']['Enums']['seat_kind'];

/** A delegate, and the seat of the committee they hold. */
export type SeatedDelegate = SignedInClient & { seatId: string };

/**
 * A committee with its chair and two delegates. A paper needs at least two:
 * one to write it, and one it is kept from until its authors show it.
 */
export type PaperCommittee = CommitteeRoomFixture & {
	/** The room's own delegate, in France, who writes most papers in the tests. */
	france: SeatedDelegate;
	germany: SeatedDelegate;
	/** The committee's address, which every notification about its papers links into. */
	committeeSlug: string;
};

/** A standard committee, or with `format: 'crisis'` a crisis committee, with France and Germany seated. */
export async function createPaperCommittee(
	options: { format?: 'standard' | 'crisis' } = {}
): Promise<PaperCommittee> {
	const room = await createCommitteeRoom();

	if (options.format === 'crisis') {
		const { error } = await room.supabase
			.from('committees')
			.update({ format: 'crisis' })
			.eq('id', room.committeeId);

		if (error) throw new Error(`Could not make the fixture committee a crisis: ${error.message}`);
	}

	const { data: committee, error } = await room.supabase
		.from('committees')
		.select('slug')
		.eq('id', room.committeeId)
		.single();

	if (error || !committee)
		throw new Error(`Could not read the fixture committee: ${error?.message}`);

	const germany = await addSeatedDelegate(room, 'Germany', 'DE');

	return {
		...room,
		france: { ...room.delegate, seatId: room.seatId },
		germany,
		committeeSlug: committee.slug
	};
}

/** A new seat of the committee with a new delegate in it, through the organiser's client. */
export async function addSeatedDelegate(
	committee: CommitteeRoomFixture,
	seatName: string,
	countryCode: string,
	kind: SeatKind = 'country'
): Promise<SeatedDelegate> {
	const seatId = await addSeat(committee.supabase, committee.committeeId, seatName, countryCode);

	if (kind !== 'country') {
		const { error } = await committee.supabase.from('seats').update({ kind }).eq('id', seatId);

		if (error) throw new Error(`Could not make the fixture seat an ${kind}: ${error.message}`);
	}

	const delegate = await createSignedInClient(`Delegate of ${seatName}`);
	await giveSeatTo(committee.supabase, seatId, delegate.userId);

	return { ...delegate, seatId };
}

/**
 * Somebody on the crisis staff: a role over the whole conference that holds
 * answer_directives and nothing else, so they answer directives in every
 * committee but run no room.
 */
export async function addCrisisStaff(committee: CommitteeRoomFixture): Promise<SignedInClient> {
	const crisisStaff = await createSignedInClient('Crisis Staff');
	const roleId = await addRole(committee.supabase, committee.conferenceId, {
		name: 'Crisis staff',
		permissions: ['answer_directives']
	});
	await giveRole(committee.supabase, committee.conferenceId, crisisStaff.userId, roleId);

	return crisisStaff;
}

/**
 * A member of the dais who does not answer directives: a role over the whole
 * conference that holds run_room alone. The Chair preset answers directives
 * as well, so the tests of what the dais does without that permission need
 * this person rather than the room's chair.
 */
export async function addDaisMember(committee: CommitteeRoomFixture): Promise<SignedInClient> {
	const daisMember = await createSignedInClient('Dais Member');
	const roleId = await addRole(committee.supabase, committee.conferenceId, {
		name: 'Dais',
		permissions: ['run_room']
	});
	await giveRole(committee.supabase, committee.conferenceId, daisMember.userId, roleId);

	return daisMember;
}

/** Somebody on the conference's team with the Volunteer role, which holds no permission. */
export async function addVolunteer(committee: CommitteeRoomFixture): Promise<SignedInClient> {
	const volunteer = await createSignedInClient('Volunteer');
	await addStaff(committee.supabase, committee.conferenceId, volunteer.userId);

	return volunteer;
}

/** The title a fixture paper is started with. */
export const FIXTURE_PAPER_TITLE = 'Autonomous weapons';

/**
 * The text of the fixture draft resolution, in the Markdown the editor
 * writes: two preambulatory clauses, then two operative clauses, the first
 * with two sub-clauses. clauseContentFromMarkdown gives them the ids p1 and
 * p2, and o1, o1a, o1b and o2.
 */
export const FIXTURE_PREAMBLE =
	'Recalling the Charter of the United Nations,\n\nAlarmed by the spread of autonomous weapons,';
export const FIXTURE_OPERATIVE = [
	'1. Calls upon all Member States to:',
	'   1. declare their autonomous weapons programmes;',
	'   2. keep a person in control of every use of force;',
	'2. Decides to remain actively seized of the matter.'
].join('\n');

/** The text of every other kind of fixture paper, which is one piece of Markdown. */
export const FIXTURE_BODY = 'France proposes a register of autonomous weapons.';

/** What start_paper is told besides the committee and the kind. */
export type PaperOptions = { title?: string; topic?: string | null; sourcePaperIds?: string[] };

/** Starts a paper as `author` through start_paper, and answers its id. */
export async function startPaper(
	author: SignedInClient,
	committeeId: string,
	kind: PaperKind = 'draft_resolution',
	options: PaperOptions = {}
): Promise<string> {
	const { data, error } = await author.supabase.rpc('start_paper', {
		committee_id: committeeId,
		kind,
		title: options.title ?? FIXTURE_PAPER_TITLE,
		topic: options.topic ?? null,
		source_paper_ids: options.sourcePaperIds ?? []
	});

	if (error || !data) throw new Error(`Could not start the fixture paper: ${error?.message}`);

	return data;
}

/** What a save may change, by the names the page uses. A part left out is not sent. */
export type PaperText = { title?: string; body?: string; preamble?: string; operative?: string };

/** The fixture text of a paper of this kind, in the parts the kind has. */
export function fixtureTextFor(kind: PaperKind): PaperText {
	if (kind === 'draft_resolution') {
		return { preamble: FIXTURE_PREAMBLE, operative: FIXTURE_OPERATIVE };
	}

	if (kind === 'committee_directive') {
		return { operative: FIXTURE_OPERATIVE };
	}

	return { body: FIXTURE_BODY };
}

/**
 * The columns a save writes. Only the parts given go in the update, the way
 * the editor saves the fragment that changed.
 */
function columnsOf(text: PaperText) {
	return {
		...(text.title === undefined ? {} : { title: text.title }),
		...(text.body === undefined ? {} : { body_markdown: text.body }),
		...(text.preamble === undefined ? {} : { preamble_markdown: text.preamble }),
		...(text.operative === undefined ? {} : { operative_markdown: text.operative })
	};
}

/**
 * Saves text into a paper as `author`, through the update policy the live
 * writer saves with, and answers the revision the save left the paper at.
 */
export async function writePaper(
	author: SignedInClient,
	paperId: string,
	text: PaperText
): Promise<number> {
	const { data, error } = await author.supabase
		.from('committee_papers')
		.update(columnsOf(text))
		.eq('id', paperId)
		.select('revision')
		.single();

	if (error || !data) throw new Error(`Could not save the fixture paper: ${error?.message}`);

	return data.revision;
}

/**
 * Submits a paper the way the page does: reads its text and the revision it
 * read it at, turns the text of a draft resolution or a committee directive
 * into clauses with clauseContentFromMarkdown, and submits at that revision.
 * Answers what submit_paper answered, so a test can expect a refusal.
 */
export async function trySubmittingPaper(author: SignedInClient, paperId: string) {
	const { data: paper, error } = await author.supabase
		.from('committee_papers')
		.select('kind, revision, preamble_markdown, operative_markdown')
		.eq('id', paperId)
		.single();

	if (error || !paper) throw new Error(`Could not read the fixture paper: ${error?.message}`);

	const isInClauses = paper.kind === 'draft_resolution' || paper.kind === 'committee_directive';

	return author.supabase.rpc('submit_paper', {
		paper_id: paperId,
		expected_revision: paper.revision,
		content: isInClauses
			? clauseContentFromMarkdown(paper.preamble_markdown ?? '', paper.operative_markdown ?? '')
			: null
	});
}

/** Submits a paper as `author`, failing the test if it is refused. */
export async function submitPaper(author: SignedInClient, paperId: string): Promise<void> {
	const { error } = await trySubmittingPaper(author, paperId);

	if (error) throw new Error(`Could not submit the fixture paper: ${error.message}`);
}

/** Approves a submitted paper as `chair`, under the number the dais would give it. */
export async function approvePaper(chair: SignedInClient, paperId: string): Promise<void> {
	const { error } = await chair.supabase.rpc('approve_paper', { paper_id: paperId });

	if (error) throw new Error(`Could not approve the fixture paper: ${error.message}`);
}

/**
 * The session the room is in, started by its chair when none is running.
 * Motions and votes happen in a session, so introducing a paper and voting
 * on it need one.
 */
export async function sessionInProgress(committee: CommitteeRoomFixture): Promise<string> {
	const { data: room, error: roomError } = await committee.chair.supabase
		.from('committee_state')
		.select('current_session_id')
		.eq('committee_id', committee.committeeId)
		.single();

	if (roomError || !room) throw new Error(`Could not read the fixture room: ${roomError?.message}`);

	if (room.current_session_id) return room.current_session_id;

	const { data: sessionId, error } = await committee.chair.supabase.rpc('start_committee_session', {
		committee_id: committee.committeeId,
		name: 'Session 1'
	});

	if (error || !sessionId)
		throw new Error(`Could not start the fixture session: ${error?.message}`);

	return sessionId;
}

/** Writes down a motion to introduce a paper, as the chair, and answers the motion's id. */
export async function proposeIntroduction(
	committee: CommitteeRoomFixture,
	paperId: string
): Promise<string> {
	const sessionId = await sessionInProgress(committee);
	const { data, error } = await committee.chair.supabase
		.from('motions')
		.insert({
			committee_id: committee.committeeId,
			session_id: sessionId,
			kind: 'introduce_document',
			paper_id: paperId
		})
		.select('id')
		.single();

	if (error || !data) throw new Error(`Could not write down the fixture motion: ${error?.message}`);

	return data.id;
}

/** The chair's "Pass" on a motion, which is apply_passed_motion. */
export function passMotion(chair: SignedInClient, motionId: string) {
	return chair.supabase.rpc('apply_passed_motion', { motion_id: motionId });
}

/**
 * Introduces an approved paper the way the room does, by a motion to
 * introduce it that the chair passes. Answers the motion's id.
 */
export async function introducePaper(
	committee: CommitteeRoomFixture,
	paperId: string
): Promise<string> {
	const motionId = await proposeIntroduction(committee, paperId);
	const { error } = await passMotion(committee.chair, motionId);

	if (error) throw new Error(`Could not introduce the fixture paper: ${error.message}`);

	return motionId;
}

/**
 * A paper of France's with the fixture text, submitted, approved and, unless
 * `stopAt` says otherwise, introduced: a draft resolution on the floor, where
 * amendments are proposed and votes are taken. Answers its id.
 */
export async function franceSubmitsPaper(
	committee: PaperCommittee,
	kind: PaperKind = 'draft_resolution',
	stopAt: 'submitted' | 'approved' | 'introduced' = 'introduced'
): Promise<string> {
	const paperId = await startPaper(committee.france, committee.committeeId, kind);
	await writePaper(committee.france, paperId, fixtureTextFor(kind));
	await submitPaper(committee.france, paperId);

	if (stopAt === 'submitted') return paperId;

	await approvePaper(committee.chair, paperId);

	if (stopAt === 'approved') return paperId;

	await introducePaper(committee, paperId);

	return paperId;
}

/** What a vote is about: a paper, or an amendment to one. */
export type VoteSubject = { paperId: string } | { amendmentId: string };

/** Opens a substantive vote as the chair, and answers what the insert answered. */
export async function tryOpeningVote(committee: CommitteeRoomFixture, about: VoteSubject) {
	const sessionId = await sessionInProgress(committee);

	return committee.chair.supabase
		.from('votes')
		.insert({
			committee_id: committee.committeeId,
			session_id: sessionId,
			kind: 'substantive',
			paper_id: 'paperId' in about ? about.paperId : null,
			amendment_id: 'amendmentId' in about ? about.amendmentId : null
		})
		.select('id, subject')
		.single();
}

/** Opens a substantive vote as the chair, and answers its id. */
export async function openVote(
	committee: CommitteeRoomFixture,
	about: VoteSubject
): Promise<string> {
	const { data, error } = await tryOpeningVote(committee, about);

	if (error || !data) throw new Error(`Could not open the fixture vote: ${error?.message}`);

	return data.id;
}

/** Closes a vote as the chair with its result, the one write the room's "Close vote" makes. */
export function closeVote(chair: SignedInClient, voteId: string, passed: boolean) {
	return chair.supabase
		.from('votes')
		.update({
			votes_for: passed ? 3 : 1,
			votes_against: passed ? 1 : 3,
			votes_abstain: 0,
			passed,
			status: 'closed',
			closed_at: new Date().toISOString()
		})
		.eq('id', voteId)
		.select('id');
}

/** Opens a vote and closes it with this result. */
export async function voteOn(
	committee: CommitteeRoomFixture,
	about: VoteSubject,
	passed: boolean
): Promise<void> {
	const voteId = await openVote(committee, about);
	const { error } = await closeVote(committee.chair, voteId, passed);

	if (error) throw new Error(`Could not close the fixture vote: ${error.message}`);
}

/** A paper as the database holds it, read past Row Level Security. */
export async function storedPaper(paperId: string) {
	const { data, error } = await createServiceRoleClient()
		.from('committee_papers')
		.select('*')
		.eq('id', paperId)
		.single();

	if (error || !data) throw new Error(`Could not read the stored paper: ${error?.message}`);

	return data;
}

/** The seats on a paper and what each does, read past Row Level Security, in the order they joined. */
export async function storedPaperSeats(
	paperId: string
): Promise<{ seat_id: string; role: string }[]> {
	const { data, error } = await createServiceRoleClient()
		.from('committee_paper_seats')
		.select('seat_id, role')
		.eq('paper_id', paperId)
		.order('added_at');

	if (error || !data) throw new Error(`Could not read the stored seats: ${error?.message}`);

	return data;
}

/** A paper's frozen versions, read past Row Level Security, oldest first. */
export async function storedVersions(paperId: string) {
	const { data, error } = await createServiceRoleClient()
		.from('committee_paper_versions')
		.select('version_number, content, amendment_id')
		.eq('paper_id', paperId)
		.order('version_number');

	if (error || !data) throw new Error(`Could not read the stored versions: ${error?.message}`);

	return data;
}

/** What somebody has been told, read past Row Level Security, oldest first. */
export async function notificationsOf(
	userId: string
): Promise<{ kind: string; title: string; link_path: string | null }[]> {
	const { data, error } = await createServiceRoleClient()
		.from('notifications')
		.select('kind, title, link_path')
		.eq('user_id', userId)
		.order('created_at');

	if (error || !data) throw new Error(`Could not read the stored notifications: ${error?.message}`);

	return data;
}

/** Where a paper of the committee is read, which its notifications link to. */
export function paperLinkPath(committee: PaperCommittee, paperId: string): string {
	return `/conferences/${committee.conferenceSlug}/committees/${committee.committeeSlug}/resolutions/${paperId}`;
}

/** Whether `reader` can open the paper at all: its row comes back, or nothing does. */
export async function canRead(reader: SignedInClient, paperId: string): Promise<boolean> {
	const { data, error } = await reader.supabase
		.from('committee_papers')
		.select('id')
		.eq('id', paperId);

	if (error) throw new Error(`Could not ask whether the paper is readable: ${error.message}`);

	return data.length === 1;
}

/**
 * Expects a call to be refused with this SQLSTATE code and these words. The
 * functions raise 42501 for "not you", P0002 for "no such thing", 22023 for
 * "not like that" and 40001 for "somebody got there first", and their words
 * are the ones the page shows the person who pressed.
 */
export async function expectRefusal(
	call: PromiseLike<{ error: PostgrestError | null }>,
	code: string,
	message: string
): Promise<void> {
	const { error } = await call;

	expect(error).toMatchObject({ code, message });
}

/** Expects a call to succeed, showing its error in the failure when it does not. */
export async function expectSuccess(
	call: PromiseLike<{ error: PostgrestError | null }>
): Promise<void> {
	const { error } = await call;

	expect(error).toBeNull();
}
