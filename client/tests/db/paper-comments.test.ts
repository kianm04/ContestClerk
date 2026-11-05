import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addChair,
	addCommittee,
	addDelegation,
	addSeat,
	createOpenConferenceOwnedByMe,
	giveSeatTo,
	type ConferenceFixture
} from './conference-fixtures';
import {
	addCrisisStaff,
	addDaisMember,
	addSeatedDelegate,
	addVolunteer,
	approvePaper,
	canRead,
	createPaperCommittee,
	expectRefusal,
	expectSuccess,
	fixtureTextFor,
	franceSubmitsPaper,
	introducePaper,
	notificationsOf,
	paperLinkPath,
	startPaper,
	submitPaper,
	writePaper,
	type PaperCommittee,
	type PaperKind
} from './committee-paper-fixtures';

// Comment threads on papers, docs/committee-papers.md section 4 ("Comments
// and suggestions") with decisions 12 to 15: who may start a thread, on which
// part of which kind of paper, who reads it, replying, editing and deleting a
// comment, resolving and reopening a thread, who is told, and when a paper's
// threads close. Position papers share the tables and the functions, and
// their threads have a describe of their own. A suggestion is part of a
// paper's Yjs text, saved as any typing is, so only the thread that argues
// about one is here.
//
// Everything a person does goes through their own client, so a test only
// passes if the functions and policies let that person do it. A refused
// select comes back empty, so what was stored is read back past Row Level
// Security (storedThread and storedComments), and a refused function call is
// expected by its code and its words, which are what the page shows the
// person who pressed.
//
// The functions a person presses, which the describe titles name:
//
//   * `start_thread` opens a thread with its first comment, on a passage of
//     one part of a paper or on the whole paper, and tells the authors when
//     somebody outside them opens one;
//   * `reply_to_thread` adds a reply, opens a resolved thread again, and tells
//     the people in the thread, once until they have read it;
//   * `edit_comment` and `delete_comment` are for a comment's writer alone,
//     and an opening comment that has replies stays as "Comment deleted";
//   * `resolve_thread` and `reopen_thread` fold a thread away and bring it
//     back, for anybody who reads it.
//
// And behind them, named where a test reaches them:
//
//   * `may_read_thread` is section 4's reading rule, which both read policies
//     ask: the authors, whoever started the thread, and the whole dais for a
//     thread the dais started;
//   * `thread_accepts_comments` closes a committee paper's threads once it is
//     introduced or withdrawn, and a position paper's once its draft is gone;
//   * `checked_comment_body` holds a comment to 2,000 characters and refuses
//     a blank one;
//   * `holder_has_committee_permission` asks whether somebody in a dais thread
//     is still on the dais before telling them of a reply;
//   * `delete_position_paper_threads`, which the trigger
//     `position_paper_drafts_delete_threads` runs, deletes a position paper's
//     threads with its draft, whether the draft is deleted or its seat changes
//     hands.

/** What start_thread is told besides the words, by its own names: the paper, and where in it. */
type ThreadPlace = {
	committee_paper_id?: string;
	position_paper_seat_id?: string;
	anchor_fragment?: string;
	anchor_start?: string;
	anchor_end?: string;
	quoted_text?: string;
	suggestion_id?: string;
};

/** The words a fixture thread opens with, the answer it gets, and the note the dais leaves. */
const QUESTION = 'Should this name a deadline?';
const ANSWER = 'Yes, by 2030.';
const DAIS_NOTE = 'Give clause 1 a deadline.';

/**
 * A passage of one part of a paper, as the editor sends it for the words
 * somebody selected. The anchors are Yjs relative positions, encoded, which
 * the database keeps for the editor without reading them, so any two strings
 * will do here.
 */
function passageIn(fragment: string, quotedText: string): ThreadPlace {
	return {
		anchor_fragment: fragment,
		anchor_start: 'AQKBqI3dCAMA',
		anchor_end: 'AQKBqI3dCCMA',
		quoted_text: quotedText
	};
}

/** The first operative clause of the fixture draft resolution. */
const OPERATIVE_PASSAGE = passageIn('operative', 'Calls upon all Member States to:');

/** "Comment", and answers what start_thread answered, so a test can expect a refusal. */
function tryStartingThread(person: SignedInClient, place: ThreadPlace, body = QUESTION) {
	return person.supabase.rpc('start_thread', { body, ...place });
}

/** "Comment", failing the test if it is refused, and answers the new thread's id. */
async function startThread(
	person: SignedInClient,
	place: ThreadPlace,
	body = QUESTION
): Promise<string> {
	const { data, error } = await tryStartingThread(person, place, body);

	if (error || !data) throw new Error(`Could not start the fixture thread: ${error?.message}`);

	return data;
}

/** "Reply", and answers what reply_to_thread answered. */
function tryReplying(person: SignedInClient, threadId: string, body = ANSWER) {
	return person.supabase.rpc('reply_to_thread', { thread_id: threadId, body });
}

/** "Reply", failing the test if it is refused, and answers the new comment's id. */
async function reply(person: SignedInClient, threadId: string, body = ANSWER): Promise<string> {
	const { data, error } = await tryReplying(person, threadId, body);

	if (error || !data) throw new Error(`Could not reply in the fixture thread: ${error?.message}`);

	return data;
}

/** "Edit" on a comment, saved with these words. */
function editComment(person: SignedInClient, commentId: string, body: string) {
	return person.supabase.rpc('edit_comment', { comment_id: commentId, body });
}

/** "Delete" on a comment. */
function deleteComment(person: SignedInClient, commentId: string) {
	return person.supabase.rpc('delete_comment', { comment_id: commentId });
}

/** "Resolve" on a thread. */
function resolveThread(person: SignedInClient, threadId: string) {
	return person.supabase.rpc('resolve_thread', { thread_id: threadId });
}

/** "Reopen" on a resolved thread. */
function reopenThread(person: SignedInClient, threadId: string) {
	return person.supabase.rpc('reopen_thread', { thread_id: threadId });
}

/** A thread as the database holds it, read past Row Level Security, or null once it is gone. */
async function storedThread(threadId: string) {
	const { data, error } = await createServiceRoleClient()
		.from('paper_comment_threads')
		.select('*')
		.eq('id', threadId)
		.maybeSingle();

	if (error) throw new Error(`Could not read the stored thread: ${error.message}`);

	return data;
}

/** A thread's comments as the database holds them, read past Row Level Security, in the order written. */
async function storedComments(threadId: string) {
	const { data, error } = await createServiceRoleClient()
		.from('paper_comments')
		.select('*')
		.eq('thread_id', threadId)
		.order('created_at')
		.order('id');

	if (error) throw new Error(`Could not read the stored comments: ${error.message}`);

	return data;
}

/** The id of the comment a thread was started with. */
async function openingCommentOf(threadId: string): Promise<string> {
	const [opening] = await storedComments(threadId);

	return opening.id;
}

/**
 * Whether `reader` can read a thread. Its row and its comments come back
 * together or not at all, because both read policies ask may_read_thread,
 * and a page that showed a thread without its words would be broken.
 */
async function readsThread(reader: SignedInClient, threadId: string): Promise<boolean> {
	const { data: threads, error: threadError } = await reader.supabase
		.from('paper_comment_threads')
		.select('id')
		.eq('id', threadId);

	if (threadError) throw new Error(`Could not ask for the thread: ${threadError.message}`);

	const { data: comments, error: commentError } = await reader.supabase
		.from('paper_comments')
		.select('id')
		.eq('thread_id', threadId);

	if (commentError) throw new Error(`Could not ask for the comments: ${commentError.message}`);

	const isReadable = threads.length === 1;
	expect(comments.length > 0).toBe(isReadable);

	return isReadable;
}

/** Whether each of these people can read the thread, by the names a test gives them. */
async function whoReadsThread(
	threadId: string,
	readers: Record<string, SignedInClient>
): Promise<Record<string, boolean>> {
	const answers = await Promise.all(
		Object.entries(readers).map(
			async ([name, reader]) => [name, await readsThread(reader, threadId)] as const
		)
	);

	return Object.fromEntries(answers);
}

/** What somebody has been told about comments, oldest first. */
async function commentNotificationsOf(userId: string) {
	return (await notificationsOf(userId)).filter(
		(notification) =>
			notification.kind === 'paper_comment_thread' || notification.kind === 'paper_comment_reply'
	);
}

/**
 * Marks everything somebody has been told as read, through their own client.
 * A notification left unread is what keeps a second one about the same
 * thread from being sent.
 */
async function readNotifications(person: SignedInClient): Promise<void> {
	const { error } = await person.supabase
		.from('notifications')
		.update({ read_at: new Date().toISOString() })
		.eq('user_id', person.userId)
		.is('read_at', null);

	if (error) throw new Error(`Could not read the fixture notifications: ${error.message}`);
}

/** Where a delegate is sent for a thread: the paper's page, opened at the thread. */
function threadLinkPath(committee: PaperCommittee, paperId: string, threadId: string): string {
	return `${paperLinkPath(committee, paperId)}#thread-${threadId}`;
}

/** Where the dais is sent for a thread it started: the chair's page for the paper. */
function chairThreadLinkPath(committee: PaperCommittee, paperId: string, threadId: string): string {
	return `/conferences/${committee.conferenceSlug}/committees/${committee.committeeSlug}/chair/resolutions/${paperId}#thread-${threadId}`;
}

/** A paper France started and saved the fixture text of its kind into, still being written. */
async function franceWritesPaper(
	committee: PaperCommittee,
	kind: PaperKind = 'draft_resolution'
): Promise<string> {
	const paperId = await startPaper(committee.france, committee.committeeId, kind);
	await writePaper(committee.france, paperId, fixtureTextFor(kind));

	return paperId;
}

/** "Open for signatures", or closing them again, as an author. */
async function setSignaturesOpen(
	author: SignedInClient,
	paperId: string,
	isOpen = true
): Promise<void> {
	const { error } = await author.supabase.rpc('set_paper_signatures_open', {
		paper_id: paperId,
		is_open: isOpen
	});

	if (error) throw new Error(`Could not open the fixture paper for signatures: ${error.message}`);
}

/** "Sign", as a delegate of the committee. */
async function signPaper(delegate: SignedInClient, paperId: string): Promise<void> {
	const { error } = await delegate.supabase.rpc('sign_paper', { paper_id: paperId });

	if (error) throw new Error(`Could not sign the fixture paper: ${error.message}`);
}

/** "Add an author", as an author of the paper. */
async function addAuthor(author: SignedInClient, paperId: string, seatId: string): Promise<void> {
	const { error } = await author.supabase.rpc('add_paper_author', {
		paper_id: paperId,
		seat_id: seatId
	});

	if (error) throw new Error(`Could not add the fixture author: ${error.message}`);
}

/** "Return to the authors", as the dais. */
function returnPaper(chair: SignedInClient, paperId: string) {
	return chair.supabase.rpc('return_paper', {
		paper_id: paperId,
		comment: 'See the notes on clause 1.'
	});
}

/** "Withdraw", as whoever presses it. */
function withdrawPaper(person: SignedInClient, paperId: string) {
	return person.supabase.rpc('withdraw_paper', { paper_id: paperId });
}

/**
 * Takes every role somebody holds in the conference away, as its organiser,
 * so they hold no permission there any more.
 */
async function takeRolesAway(committee: PaperCommittee, person: SignedInClient): Promise<void> {
	const { data, error } = await committee.supabase
		.from('conference_role_members')
		.delete()
		.eq('conference_id', committee.conferenceId)
		.eq('user_id', person.userId)
		.select('role_id');

	if (error) throw new Error(`Could not take the fixture roles away: ${error.message}`);
	if (data.length === 0) throw new Error('The fixture person held no role to take away.');
}

describe('start_thread', () => {
	it('keeps where a comment on a passage is, the words it quoted and who started it', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);

		const threadId = await startThread(
			committee.france,
			{ committee_paper_id: paperId, ...OPERATIVE_PASSAGE, suggestion_id: 'suggestion-1' },
			`  ${QUESTION}  `
		);

		expect(await storedThread(threadId)).toMatchObject({
			committee_paper_id: paperId,
			position_paper_seat_id: null,
			anchor_fragment: 'operative',
			anchor_start: OPERATIVE_PASSAGE.anchor_start,
			anchor_end: OPERATIVE_PASSAGE.anchor_end,
			quoted_text: 'Calls upon all Member States to:',
			started_by: committee.france.userId,
			started_by_seat_id: committee.france.seatId,
			is_from_dais: false,
			suggestion_id: 'suggestion-1',
			resolved_at: null,
			resolved_by: null
		});
		// The thread opens with its first comment, without the spaces around it.
		expect(await storedComments(threadId)).toMatchObject([
			{ written_by: committee.france.userId, body: QUESTION, edited_at: null, deleted_at: null }
		]);
	});

	it('puts a comment on a draft resolution in its preamble or its operative clauses', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);

		const preambleThreadId = await startThread(committee.france, {
			committee_paper_id: paperId,
			...passageIn('preamble', 'Recalling the Charter of the United Nations,')
		});
		const operativeThreadId = await startThread(committee.france, {
			committee_paper_id: paperId,
			...OPERATIVE_PASSAGE
		});

		expect(await storedThread(preambleThreadId)).toMatchObject({ anchor_fragment: 'preamble' });
		expect(await storedThread(operativeThreadId)).toMatchObject({ anchor_fragment: 'operative' });
		await expectRefusal(
			tryStartingThread(committee.france, {
				committee_paper_id: paperId,
				...passageIn('body', 'Recalling the Charter')
			}),
			'22023',
			'That part is not in this paper.'
		);
	});

	it('puts a comment on the whole paper in no part of it, quoting nothing', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);

		const threadId = await startThread(committee.france, {
			committee_paper_id: paperId,
			quoted_text: 'Recalling the Charter'
		});

		expect(await storedThread(threadId)).toMatchObject({
			anchor_fragment: 'body',
			anchor_start: null,
			anchor_end: null,
			quoted_text: null
		});
		await expectRefusal(
			tryStartingThread(committee.france, {
				committee_paper_id: paperId,
				anchor_fragment: 'operative'
			}),
			'22023',
			'That part is not in this paper.'
		);
	});

	it('puts a comment on a working paper in its body', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee, 'working_paper');

		const threadId = await startThread(committee.france, {
			committee_paper_id: paperId,
			...passageIn('body', 'a register of autonomous weapons')
		});

		expect(await storedThread(threadId)).toMatchObject({ anchor_fragment: 'body' });
		for (const fragment of ['preamble', 'operative']) {
			await expectRefusal(
				tryStartingThread(committee.france, {
					committee_paper_id: paperId,
					...passageIn(fragment, 'a register')
				}),
				'22023',
				'That part is not in this paper.'
			);
		}
	});

	it('puts a comment on a committee directive in its operative clauses', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const paperId = await franceWritesPaper(committee, 'committee_directive');

		const threadId = await startThread(committee.france, {
			committee_paper_id: paperId,
			...OPERATIVE_PASSAGE
		});

		expect(await storedThread(threadId)).toMatchObject({ anchor_fragment: 'operative' });
		for (const fragment of ['preamble', 'body']) {
			await expectRefusal(
				tryStartingThread(committee.france, {
					committee_paper_id: paperId,
					...passageIn(fragment, 'Calls upon')
				}),
				'22023',
				'That part is not in this paper.'
			);
		}
	});

	it('keeps at most 10,000 characters of the words a comment quotes', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);

		const threadId = await startThread(committee.france, {
			committee_paper_id: paperId,
			...passageIn('operative', 'q'.repeat(10_050))
		});

		expect(await storedThread(threadId)).toMatchObject({ quoted_text: 'q'.repeat(10_000) });
	});

	it('puts a comment on exactly one paper', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);

		await expectRefusal(
			tryStartingThread(committee.france, {}),
			'22023',
			'A comment is on one paper.'
		);
		await expectRefusal(
			tryStartingThread(committee.france, {
				committee_paper_id: paperId,
				position_paper_seat_id: committee.france.seatId
			}),
			'22023',
			'A comment is on one paper.'
		);
	});

	it('puts a comment on a passage with both its ends, each at most 1,000 characters', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		const { anchor_start: start, anchor_end: end } = OPERATIVE_PASSAGE;

		for (const ends of [
			{ anchor_start: start },
			{ anchor_end: end },
			{ anchor_start: 'A'.repeat(1001), anchor_end: end }
		]) {
			await expectRefusal(
				tryStartingThread(committee.france, {
					committee_paper_id: paperId,
					anchor_fragment: 'operative',
					...ends
				}),
				'22023',
				'A comment is on a passage, with its start and end, or on the whole paper.'
			);
		}
	});

	it('keeps the id of the suggestion a thread argues about to 100 characters', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);

		await expectRefusal(
			tryStartingThread(committee.france, {
				committee_paper_id: paperId,
				...OPERATIVE_PASSAGE,
				suggestion_id: 's'.repeat(101)
			}),
			'23514',
			'new row for relation "paper_comment_threads" violates check constraint "paper_comment_threads_suggestion_id_length"'
		);
	});

	it('tells nobody of a thread an author starts, not even the other authors', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		await addAuthor(committee.france, paperId, committee.germany.seatId);

		await startThread(committee.germany, { committee_paper_id: paperId, ...OPERATIVE_PASSAGE });
		await startThread(committee.france, { committee_paper_id: paperId });

		expect(await commentNotificationsOf(committee.france.userId)).toEqual([]);
		expect(await commentNotificationsOf(committee.germany.userId)).toEqual([]);
	});

	it('lets a delegate ask the authors a question while the paper is open for signatures, and tells every author of each one', async () => {
		const committee = await createPaperCommittee();
		const chile = await addSeatedDelegate(committee, 'Chile', 'CL');
		const brazil = await addSeatedDelegate(committee, 'Brazil', 'BR');
		const paperId = await franceWritesPaper(committee);
		await addAuthor(committee.france, paperId, brazil.seatId);
		await setSignaturesOpen(committee.france, paperId);

		const firstThreadId = await startThread(committee.germany, {
			committee_paper_id: paperId,
			...OPERATIVE_PASSAGE
		});
		const secondThreadId = await startThread(
			committee.germany,
			{ committee_paper_id: paperId },
			'Would you take a co-submitter?'
		);
		const chileThreadId = await startThread(chile, { committee_paper_id: paperId });

		expect(await storedThread(firstThreadId)).toMatchObject({
			started_by: committee.germany.userId,
			started_by_seat_id: committee.germany.seatId,
			is_from_dais: false
		});
		// One notification per thread, each opening the paper at its thread.
		const newThread = (threadId: string) => ({
			kind: 'paper_comment_thread',
			title: 'New comment on “Autonomous weapons”',
			link_path: threadLinkPath(committee, paperId, threadId)
		});
		const toldOfEachThread = [
			newThread(firstThreadId),
			newThread(secondThreadId),
			newThread(chileThreadId)
		];
		expect(await commentNotificationsOf(committee.france.userId)).toEqual(toldOfEachThread);
		expect(await commentNotificationsOf(brazil.userId)).toEqual(toldOfEachThread);
		expect(await commentNotificationsOf(committee.germany.userId)).toEqual([]);
	});

	it('lets a delegate outside the authors start a thread only while the paper is open for signatures', async () => {
		const committee = await createPaperCommittee();
		const chile = await addSeatedDelegate(committee, 'Chile', 'CL');
		const paperId = await franceWritesPaper(committee);

		// Before it opens, the paper is the authors' alone.
		await expectRefusal(
			tryStartingThread(committee.germany, { committee_paper_id: paperId }),
			'P0002',
			'That paper does not exist.'
		);

		await setSignaturesOpen(committee.france, paperId);
		await signPaper(chile, paperId);
		await setSignaturesOpen(committee.france, paperId, false);

		// A signatory still reads the paper once signatures close, but the
		// time for questions before signing is over.
		await expectRefusal(
			tryStartingThread(chile, { committee_paper_id: paperId }),
			'42501',
			'You cannot comment on this paper.'
		);
		await expectRefusal(
			tryStartingThread(committee.germany, { committee_paper_id: paperId }),
			'P0002',
			'That paper does not exist.'
		);
	});

	it('lets the dais comment only once the paper is submitted', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);

		await expectRefusal(
			tryStartingThread(committee.chair, { committee_paper_id: paperId }),
			'P0002',
			'That paper does not exist.'
		);

		// Open for signatures, the dais reads the paper, but the questions are
		// the committee's to ask.
		await setSignaturesOpen(committee.france, paperId);
		for (const dais of [committee.chair, committee]) {
			await expectRefusal(
				tryStartingThread(dais, { committee_paper_id: paperId }),
				'42501',
				'You cannot comment on this paper.'
			);
		}
	});

	it('lets the dais comment on a submitted paper, as the dais, and tells the authors', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee, 'draft_resolution', 'submitted');

		const threadId = await startThread(
			committee.chair,
			{ committee_paper_id: paperId, ...OPERATIVE_PASSAGE },
			DAIS_NOTE
		);

		// The chair sits in no seat, and the thread is the dais's.
		expect(await storedThread(threadId)).toMatchObject({
			started_by: committee.chair.userId,
			started_by_seat_id: null,
			is_from_dais: true
		});
		expect(await commentNotificationsOf(committee.france.userId)).toEqual([
			{
				kind: 'paper_comment_thread',
				title: 'New comment on “Autonomous weapons”',
				link_path: threadLinkPath(committee, paperId, threadId)
			}
		]);
		expect(await commentNotificationsOf(committee.chair.userId)).toEqual([]);
	});

	it('lets the rest of the dais comment on an approved paper, and names the paper by its number', async () => {
		const committee = await createPaperCommittee();
		const daisMember = await addDaisMember(committee);
		const paperId = await franceSubmitsPaper(committee, 'draft_resolution', 'approved');

		const threadId = await startThread(daisMember, { committee_paper_id: paperId }, DAIS_NOTE);

		expect(await storedThread(threadId)).toMatchObject({
			started_by: daisMember.userId,
			is_from_dais: true
		});
		expect(await commentNotificationsOf(committee.france.userId)).toEqual([
			{
				kind: 'paper_comment_thread',
				title: 'New comment on Draft resolution 1.1',
				link_path: threadLinkPath(committee, paperId, threadId)
			}
		]);
	});

	it('lets neither the crisis staff nor the chair comment on a personal directive', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const crisisStaff = await addCrisisStaff(committee);
		const paperId = await franceSubmitsPaper(committee, 'personal_directive', 'submitted');

		// Both read it, to answer it, and the answer is how they reply.
		for (const person of [crisisStaff, committee.chair]) {
			expect(await canRead(person, paperId)).toBe(true);
			await expectRefusal(
				tryStartingThread(person, { committee_paper_id: paperId }),
				'42501',
				'You cannot comment on this paper.'
			);
		}
	});
});

describe('who reads a thread (may_read_thread)', () => {
	it('lets only the authors read a thread an author started, not a signatory, another delegate or the dais', async () => {
		const committee = await createPaperCommittee();
		const chile = await addSeatedDelegate(committee, 'Chile', 'CL');
		const brazil = await addSeatedDelegate(committee, 'Brazil', 'BR');
		const paperId = await franceWritesPaper(committee);
		await addAuthor(committee.france, paperId, chile.seatId);
		const threadId = await startThread(committee.france, {
			committee_paper_id: paperId,
			...OPERATIVE_PASSAGE
		});
		await setSignaturesOpen(committee.france, paperId);
		await signPaper(committee.germany, paperId);

		// Open for signatures, the paper is read by the committee and the
		// dais, which is when the authors' notes to each other would show.
		for (const reader of [committee.germany, brazil, committee.chair]) {
			expect(await canRead(reader, paperId)).toBe(true);
		}
		expect(
			await whoReadsThread(threadId, {
				france: committee.france,
				chile,
				signatory: committee.germany,
				delegate: brazil,
				chair: committee.chair,
				organiser: committee
			})
		).toEqual({
			france: true,
			chile: true,
			signatory: false,
			delegate: false,
			chair: false,
			organiser: false
		});
	});

	it("lets a would-be signatory's question be read by them and the authors, not by another delegate or the dais", async () => {
		const committee = await createPaperCommittee();
		const chile = await addSeatedDelegate(committee, 'Chile', 'CL');
		const paperId = await franceWritesPaper(committee);
		await setSignaturesOpen(committee.france, paperId);

		const threadId = await startThread(committee.germany, { committee_paper_id: paperId });

		expect(await canRead(chile, paperId)).toBe(true);
		expect(
			await whoReadsThread(threadId, {
				france: committee.france,
				germany: committee.germany,
				chile,
				chair: committee.chair,
				organiser: committee
			})
		).toEqual({ france: true, germany: true, chile: false, chair: false, organiser: false });
	});

	it("hides a would-be signatory's question from them while the paper is with the dais, and shows it again once it is introduced", async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		await setSignaturesOpen(committee.france, paperId);
		const threadId = await startThread(committee.germany, { committee_paper_id: paperId });
		const readers = {
			france: committee.france,
			germany: committee.germany,
			chair: committee.chair
		};

		// With the dais, the paper is hidden from the committee's delegates,
		// and the threads on it go with it.
		await submitPaper(committee.france, paperId);
		expect(await whoReadsThread(threadId, readers)).toEqual({
			france: true,
			germany: false,
			chair: false
		});

		await approvePaper(committee.chair, paperId);
		await introducePaper(committee, paperId);
		expect(await whoReadsThread(threadId, readers)).toEqual({
			france: true,
			germany: true,
			chair: false
		});
	});

	it('lets the whole dais and the authors read a thread the dais started, and nobody else in the committee or on the team', async () => {
		const committee = await createPaperCommittee();
		const daisMember = await addDaisMember(committee);
		const volunteer = await addVolunteer(committee);
		const paperId = await franceSubmitsPaper(committee, 'draft_resolution', 'submitted');

		const threadId = await startThread(
			committee.chair,
			{ committee_paper_id: paperId, ...OPERATIVE_PASSAGE },
			DAIS_NOTE
		);

		expect(
			await whoReadsThread(threadId, {
				chair: committee.chair,
				daisMember,
				organiser: committee,
				france: committee.france,
				germany: committee.germany,
				volunteer
			})
		).toEqual({
			chair: true,
			daisMember: true,
			organiser: true,
			france: true,
			germany: false,
			volunteer: false
		});
		// The helper the policies ask answers the same when asked directly.
		const { data: daisMemberMayRead } = await daisMember.supabase.rpc('may_read_thread', {
			thread_id: threadId
		});
		const { data: germanyMayRead } = await committee.germany.supabase.rpc('may_read_thread', {
			thread_id: threadId
		});
		expect(daisMemberMayRead).toBe(true);
		expect(germanyMayRead).toBe(false);
	});

	it("keeps the authors' threads and the dais's from the committee and the team once the paper is introduced", async () => {
		const committee = await createPaperCommittee();
		const volunteer = await addVolunteer(committee);
		const paperId = await franceWritesPaper(committee);
		const authorsThreadId = await startThread(committee.france, {
			committee_paper_id: paperId,
			...OPERATIVE_PASSAGE
		});
		await submitPaper(committee.france, paperId);
		const daisThreadId = await startThread(
			committee.chair,
			{ committee_paper_id: paperId },
			DAIS_NOTE
		);
		await approvePaper(committee.chair, paperId);
		await introducePaper(committee, paperId);
		const readers = {
			france: committee.france,
			germany: committee.germany,
			chair: committee.chair,
			volunteer
		};

		// Introduced, the paper itself is read by the whole committee and team.
		for (const reader of [committee.germany, volunteer]) {
			expect(await canRead(reader, paperId)).toBe(true);
		}
		expect(await whoReadsThread(authorsThreadId, readers)).toEqual({
			france: true,
			germany: false,
			chair: false,
			volunteer: false
		});
		expect(await whoReadsThread(daisThreadId, readers)).toEqual({
			france: true,
			germany: false,
			chair: true,
			volunteer: false
		});
	});
});

describe('reply_to_thread', () => {
	it('adds replies in the order they are written, and opens a resolved thread again', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		await addAuthor(committee.france, paperId, committee.germany.seatId);
		const threadId = await startThread(committee.france, {
			committee_paper_id: paperId,
			...OPERATIVE_PASSAGE
		});
		await expectSuccess(resolveThread(committee.france, threadId));

		// Somebody replying to a resolved thread is saying it is not settled.
		const firstReplyId = await reply(committee.germany, threadId, `  ${ANSWER}  `);
		const secondReplyId = await reply(committee.france, threadId, 'Agreed.');

		expect(await storedComments(threadId)).toMatchObject([
			{ written_by: committee.france.userId, body: QUESTION },
			{ id: firstReplyId, written_by: committee.germany.userId, body: ANSWER },
			{ id: secondReplyId, written_by: committee.france.userId, body: 'Agreed.' }
		]);
		expect(await storedThread(threadId)).toMatchObject({ resolved_at: null, resolved_by: null });
	});

	it('tells the people in a thread of replies once, until they have read what they were told', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		await setSignaturesOpen(committee.france, paperId);
		const threadId = await startThread(committee.germany, { committee_paper_id: paperId });
		const newReply = {
			kind: 'paper_comment_reply',
			title: 'New reply on “Autonomous weapons”',
			link_path: threadLinkPath(committee, paperId, threadId)
		};

		await reply(committee.france, threadId, ANSWER);
		await reply(committee.france, threadId, 'Or by 2035 at the latest.');
		expect(await commentNotificationsOf(committee.germany.userId)).toEqual([newReply]);

		await readNotifications(committee.germany);
		await reply(committee.france, threadId, 'We have written 2030 in.');
		expect(await commentNotificationsOf(committee.germany.userId)).toEqual([newReply, newReply]);

		// France wrote every reply, and is told of none of them.
		expect(await commentNotificationsOf(committee.france.userId)).toEqual([
			{
				kind: 'paper_comment_thread',
				title: 'New comment on “Autonomous weapons”',
				link_path: threadLinkPath(committee, paperId, threadId)
			}
		]);
	});

	it('tells a delegate who asked before signing nothing once signatures close, unless they signed', async () => {
		const committee = await createPaperCommittee();
		const chile = await addSeatedDelegate(committee, 'Chile', 'CL');
		const paperId = await franceWritesPaper(committee);
		await setSignaturesOpen(committee.france, paperId);
		const germanyThreadId = await startThread(committee.germany, { committee_paper_id: paperId });
		const chileThreadId = await startThread(chile, { committee_paper_id: paperId });
		await signPaper(chile, paperId);
		await setSignaturesOpen(committee.france, paperId, false);

		await reply(committee.france, germanyThreadId);
		await reply(committee.france, chileThreadId);

		// Germany no longer reads the paper, so hears nothing of it.
		expect(await readsThread(committee.germany, germanyThreadId)).toBe(false);
		expect(await commentNotificationsOf(committee.germany.userId)).toEqual([]);
		expect(await commentNotificationsOf(chile.userId)).toEqual([
			{
				kind: 'paper_comment_reply',
				title: 'New reply on “Autonomous weapons”',
				link_path: threadLinkPath(committee, paperId, chileThreadId)
			}
		]);
	});

	it("tells the author answered in the authors' own thread, and no other author", async () => {
		const committee = await createPaperCommittee();
		const chile = await addSeatedDelegate(committee, 'Chile', 'CL');
		const paperId = await franceWritesPaper(committee);
		await addAuthor(committee.france, paperId, committee.germany.seatId);
		await addAuthor(committee.france, paperId, chile.seatId);
		const threadId = await startThread(chile, {
			committee_paper_id: paperId,
			...OPERATIVE_PASSAGE
		});

		await reply(committee.france, threadId);

		expect(await commentNotificationsOf(chile.userId)).toEqual([
			{
				kind: 'paper_comment_reply',
				title: 'New reply on “Autonomous weapons”',
				link_path: threadLinkPath(committee, paperId, threadId)
			}
		]);
		// Germany reads the thread as an author, but has not written in it.
		expect(await commentNotificationsOf(committee.germany.userId)).toEqual([]);
		expect(await commentNotificationsOf(committee.france.userId)).toEqual([]);
	});

	it("tells the authors at their page and the dais at the dais's page in a thread the dais started", async () => {
		const committee = await createPaperCommittee();
		const daisMember = await addDaisMember(committee);
		const paperId = await franceSubmitsPaper(committee, 'draft_resolution', 'submitted');
		const threadId = await startThread(committee.chair, { committee_paper_id: paperId }, DAIS_NOTE);
		const atTheChairsPage = {
			kind: 'paper_comment_reply',
			title: 'New reply on “Autonomous weapons”',
			link_path: chairThreadLinkPath(committee, paperId, threadId)
		};

		await reply(committee.france, threadId, 'Clause 1 now says by 2030.');

		expect(await commentNotificationsOf(committee.chair.userId)).toEqual([atTheChairsPage]);
		// The rest of the dais reads the thread, but has not written in it.
		expect(await commentNotificationsOf(daisMember.userId)).toEqual([]);

		await reply(daisMember, threadId, 'Thank you.');

		expect(await commentNotificationsOf(committee.france.userId)).toEqual([
			{
				kind: 'paper_comment_thread',
				title: 'New comment on “Autonomous weapons”',
				link_path: threadLinkPath(committee, paperId, threadId)
			},
			{
				kind: 'paper_comment_reply',
				title: 'New reply on “Autonomous weapons”',
				link_path: threadLinkPath(committee, paperId, threadId)
			}
		]);
		// The chair has not read the first yet, so the second reply adds nothing for them.
		expect(await commentNotificationsOf(committee.chair.userId)).toEqual([atTheChairsPage]);
	});

	it('tells the dais of replies in a thread it started only while they are on the dais (holder_has_committee_permission)', async () => {
		const committee = await createPaperCommittee();
		const daisMember = await addDaisMember(committee);
		const paperId = await franceSubmitsPaper(committee, 'draft_resolution', 'submitted');
		const threadId = await startThread(committee.chair, { committee_paper_id: paperId }, DAIS_NOTE);
		const atTheChairsPage = {
			kind: 'paper_comment_reply',
			title: 'New reply on “Autonomous weapons”',
			link_path: chairThreadLinkPath(committee, paperId, threadId)
		};

		await reply(daisMember, threadId, 'And a date in clause 2.');
		await reply(committee.france, threadId, 'Both have dates now.');
		expect(await commentNotificationsOf(committee.chair.userId)).toEqual([atTheChairsPage]);
		expect(await commentNotificationsOf(daisMember.userId)).toEqual([atTheChairsPage]);

		await takeRolesAway(committee, daisMember);
		await readNotifications(committee.chair);
		await readNotifications(daisMember);
		await reply(committee.france, threadId, 'And clause 3 says who keeps the register.');

		expect(await commentNotificationsOf(committee.chair.userId)).toEqual([
			atTheChairsPage,
			atTheChairsPage
		]);
		// Off the dais, they wrote in the thread but may no longer read it, so hear no more of it.
		expect(await readsThread(daisMember, threadId)).toBe(false);
		expect(await commentNotificationsOf(daisMember.userId)).toEqual([atTheChairsPage]);
	});

	it('keeps a thread the dais started open to the dais and the authors after a return, though the dais starts no new one', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee, 'draft_resolution', 'submitted');
		const threadId = await startThread(
			committee.chair,
			{ committee_paper_id: paperId, ...OPERATIVE_PASSAGE },
			DAIS_NOTE
		);

		// The return comment is the summary; the notes on the clauses stay
		// with the authors while they fix them.
		await expectSuccess(returnPaper(committee.chair, paperId));
		await reply(committee.france, threadId, 'Clause 1 now says by 2030.');
		await reply(committee.chair, threadId, 'Thank you.');

		expect((await storedComments(threadId)).map((comment) => comment.body)).toEqual([
			DAIS_NOTE,
			'Clause 1 now says by 2030.',
			'Thank you.'
		]);
		await expectRefusal(
			tryStartingThread(committee.chair, { committee_paper_id: paperId }),
			'42501',
			'You cannot comment on this paper.'
		);
	});

	it('lets nobody reply to a thread they cannot read, or to one that does not exist', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		const threadId = await startThread(committee.france, { committee_paper_id: paperId });
		await setSignaturesOpen(committee.france, paperId);

		// Both read the paper now that it is open, but not the authors' thread on it.
		for (const person of [committee.germany, committee.chair]) {
			await expectRefusal(tryReplying(person, threadId), 'P0002', 'That comment does not exist.');
		}
		await expectRefusal(
			tryReplying(committee.france, crypto.randomUUID()),
			'P0002',
			'That comment does not exist.'
		);
		expect(await storedComments(threadId)).toHaveLength(1);
	});
});

describe('edit_comment', () => {
	it('lets the writer change their comment, which then says it was edited, unless the words are the same', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		const threadId = await startThread(committee.france, { committee_paper_id: paperId });
		const commentId = await openingCommentOf(threadId);

		// The same words with spaces around them are no change at all.
		await expectSuccess(editComment(committee.france, commentId, `  ${QUESTION}  `));
		expect(await storedComments(threadId)).toMatchObject([{ body: QUESTION, edited_at: null }]);

		await expectSuccess(
			editComment(committee.france, commentId, '  Should this name a deadline, say 2030?  ')
		);
		const [edited] = await storedComments(threadId);
		expect(edited.body).toBe('Should this name a deadline, say 2030?');
		expect(edited.edited_at).not.toBeNull();
	});

	it('lets nobody but its writer change a comment', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		await addAuthor(committee.france, paperId, committee.germany.seatId);
		const threadId = await startThread(committee.france, { committee_paper_id: paperId });
		const replyId = await reply(committee.germany, threadId);

		await expectRefusal(
			editComment(committee.germany, await openingCommentOf(threadId), 'Changed by Germany.'),
			'42501',
			'Only the person who wrote a comment can change it.'
		);
		await expectRefusal(
			editComment(committee.france, replyId, 'Changed by France.'),
			'42501',
			'Only the person who wrote a comment can change it.'
		);
		expect(await storedComments(threadId)).toMatchObject([
			{ body: QUESTION, edited_at: null },
			{ body: ANSWER, edited_at: null }
		]);
	});

	it('changes no comment that was deleted, or that the person cannot read', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		await addAuthor(committee.france, paperId, committee.germany.seatId);
		const threadId = await startThread(committee.france, { committee_paper_id: paperId });
		const openingId = await openingCommentOf(threadId);
		const replyId = await reply(committee.germany, threadId);
		await expectSuccess(deleteComment(committee.france, openingId));

		await expectRefusal(
			editComment(committee.france, openingId, 'Brought back.'),
			'P0002',
			'That comment does not exist.'
		);
		await expectRefusal(
			editComment(committee.chair, replyId, 'Changed by the dais.'),
			'P0002',
			'That comment does not exist.'
		);
		await expectRefusal(
			editComment(committee.france, crypto.randomUUID(), 'Changed.'),
			'P0002',
			'That comment does not exist.'
		);
	});
});

describe('delete_comment', () => {
	it('takes the thread with a comment that is alone in it', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		const threadId = await startThread(committee.france, { committee_paper_id: paperId });

		await expectSuccess(deleteComment(committee.france, await openingCommentOf(threadId)));

		expect(await storedThread(threadId)).toBeNull();
		expect(await storedComments(threadId)).toEqual([]);
	});

	it('leaves "Comment deleted" in place of an opening comment that has replies, and takes the thread with its last reply', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		await addAuthor(committee.france, paperId, committee.germany.seatId);
		const threadId = await startThread(committee.france, { committee_paper_id: paperId });
		const openingId = await openingCommentOf(threadId);
		const replyId = await reply(committee.germany, threadId);

		await expectSuccess(deleteComment(committee.france, openingId));

		// The words go, the comment stays, so the reply still answers something.
		const [opening, answer] = await storedComments(threadId);
		expect(opening).toMatchObject({ id: openingId, body: '' });
		expect(opening.deleted_at).not.toBeNull();
		expect(answer).toMatchObject({ id: replyId, body: ANSWER, deleted_at: null });

		await expectSuccess(deleteComment(committee.germany, replyId));

		expect(await storedThread(threadId)).toBeNull();
	});

	it('takes a deleted reply away and leaves the rest of the thread', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		await addAuthor(committee.france, paperId, committee.germany.seatId);
		const threadId = await startThread(committee.france, { committee_paper_id: paperId });
		const firstReplyId = await reply(committee.germany, threadId, ANSWER);
		await reply(committee.germany, threadId, 'Or by 2035 at the latest.');

		await expectSuccess(deleteComment(committee.germany, firstReplyId));

		expect((await storedComments(threadId)).map((comment) => comment.body)).toEqual([
			QUESTION,
			'Or by 2035 at the latest.'
		]);
	});

	it('lets nobody but its writer delete a comment', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		await addAuthor(committee.france, paperId, committee.germany.seatId);
		const threadId = await startThread(committee.france, { committee_paper_id: paperId });
		const replyId = await reply(committee.germany, threadId);

		await expectRefusal(
			deleteComment(committee.germany, await openingCommentOf(threadId)),
			'42501',
			'Only the person who wrote a comment can delete it.'
		);
		await expectRefusal(
			deleteComment(committee.france, replyId),
			'42501',
			'Only the person who wrote a comment can delete it.'
		);
		expect(await storedComments(threadId)).toMatchObject([
			{ body: QUESTION, deleted_at: null },
			{ body: ANSWER, deleted_at: null }
		]);
	});

	it('deletes no comment that was deleted already, or that the person cannot read', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		await addAuthor(committee.france, paperId, committee.germany.seatId);
		const threadId = await startThread(committee.france, { committee_paper_id: paperId });
		const openingId = await openingCommentOf(threadId);
		const replyId = await reply(committee.germany, threadId);
		await expectSuccess(deleteComment(committee.france, openingId));

		await expectRefusal(
			deleteComment(committee.france, openingId),
			'P0002',
			'That comment does not exist.'
		);
		await expectRefusal(
			deleteComment(committee.chair, replyId),
			'P0002',
			'That comment does not exist.'
		);
		await expectRefusal(
			deleteComment(committee.france, crypto.randomUUID()),
			'P0002',
			'That comment does not exist.'
		);
		expect(await storedComments(threadId)).toHaveLength(2);
	});
});

describe('resolve_thread and reopen_thread', () => {
	it('lets anybody who reads a thread resolve it and reopen it, and keeps who resolved it first', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		await setSignaturesOpen(committee.france, paperId);
		const threadId = await startThread(committee.germany, { committee_paper_id: paperId });

		await expectSuccess(resolveThread(committee.france, threadId));
		const resolved = await storedThread(threadId);
		expect(resolved).toMatchObject({ resolved_by: committee.france.userId });
		expect(resolved.resolved_at).not.toBeNull();

		// Resolving it again changes nothing: France folded it away, and when.
		await expectSuccess(resolveThread(committee.germany, threadId));
		expect(await storedThread(threadId)).toMatchObject({
			resolved_at: resolved.resolved_at,
			resolved_by: committee.france.userId
		});

		await expectSuccess(reopenThread(committee.germany, threadId));
		expect(await storedThread(threadId)).toMatchObject({ resolved_at: null, resolved_by: null });
	});

	it('lets nobody resolve or reopen a thread they cannot read, or one that does not exist', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		const threadId = await startThread(committee.france, { committee_paper_id: paperId });

		for (const person of [committee.germany, committee.chair, committee]) {
			await expectRefusal(resolveThread(person, threadId), 'P0002', 'That comment does not exist.');
			await expectRefusal(reopenThread(person, threadId), 'P0002', 'That comment does not exist.');
		}
		await expectRefusal(
			resolveThread(committee.france, crypto.randomUUID()),
			'P0002',
			'That comment does not exist.'
		);
		expect(await storedThread(threadId)).toMatchObject({ resolved_at: null });
	});
});

describe("when a paper's threads close (thread_accepts_comments)", () => {
	it('keeps the threads of an introduced paper for their readers, and takes no comment, edit, deletion, resolving or reopening', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		const threadId = await startThread(committee.france, {
			committee_paper_id: paperId,
			...OPERATIVE_PASSAGE
		});
		const replyId = await reply(committee.france, threadId, 'And a date for the register.');
		await submitPaper(committee.france, paperId);
		const daisThreadId = await startThread(
			committee.chair,
			{ committee_paper_id: paperId },
			DAIS_NOTE
		);
		await approvePaper(committee.chair, paperId);
		await introducePaper(committee, paperId);

		// From here on the paper changes only by amendment, in front of the room.
		for (const person of [committee.france, committee.chair]) {
			await expectRefusal(
				tryStartingThread(person, { committee_paper_id: paperId }),
				'22023',
				'Comments on this paper are closed.'
			);
		}
		for (const refusedCall of [
			tryReplying(committee.france, threadId),
			tryReplying(committee.chair, daisThreadId),
			editComment(committee.france, replyId, 'And a date.'),
			deleteComment(committee.france, replyId),
			resolveThread(committee.france, threadId),
			reopenThread(committee.chair, daisThreadId)
		]) {
			await expectRefusal(refusedCall, '22023', 'Comments on this paper are closed.');
		}

		expect(await readsThread(committee.france, threadId)).toBe(true);
		expect(await readsThread(committee.chair, daisThreadId)).toBe(true);
		expect((await storedComments(threadId)).map((comment) => comment.body)).toEqual([
			QUESTION,
			'And a date for the register.'
		]);
	});

	it('takes no new thread or reply on a withdrawn paper', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		const threadId = await startThread(committee.france, { committee_paper_id: paperId });

		await expectSuccess(withdrawPaper(committee.france, paperId));

		await expectRefusal(
			tryStartingThread(committee.france, { committee_paper_id: paperId }),
			'22023',
			'Comments on this paper are closed.'
		);
		await expectRefusal(
			tryReplying(committee.france, threadId),
			'22023',
			'Comments on this paper are closed.'
		);
	});
});

describe('comment bodies (checked_comment_body)', () => {
	it('refuses a blank comment and one over 2,000 characters, wherever it is written', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		const threadId = await startThread(committee.france, { committee_paper_id: paperId });
		const commentId = await openingCommentOf(threadId);

		for (const body of [' \n\t ', 'a'.repeat(2001)]) {
			for (const refusedCall of [
				tryStartingThread(committee.france, { committee_paper_id: paperId }, body),
				tryReplying(committee.france, threadId, body),
				editComment(committee.france, commentId, body)
			]) {
				await expectRefusal(refusedCall, '22023', 'Write a comment of at most 2,000 characters.');
			}
		}

		expect(await storedComments(threadId)).toMatchObject([{ body: QUESTION }]);
	});

	it('takes a comment of 2,000 characters, not counting the spaces around it', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		const longest = 'a'.repeat(2000);

		const threadId = await startThread(
			committee.france,
			{ committee_paper_id: paperId },
			`  ${longest}  `
		);
		await reply(committee.france, threadId, `  ${longest}  `);

		expect((await storedComments(threadId)).map((comment) => comment.body)).toEqual([
			longest,
			longest
		]);
	});
});

/**
 * A position paper and the people who may write it: its seat's delegate, and
 * the head and another member of the delegation they came with, who
 * may_edit_paper_draft lets work on it too.
 */
type PositionPaperFixture = ConferenceFixture & {
	committeeId: string;
	committeeSlug: string;
	seatId: string;
	delegationId: string;
	/** The delegation's head, who made it. */
	head: SignedInClient;
	/** The delegate in the seat, whose position paper it is. */
	writer: SignedInClient;
	/** Another member of the delegation, who sits in no seat of this committee. */
	helper: SignedInClient;
};

/**
 * Puts somebody in a delegation as a member. Joining is by invitation, which
 * the delegation tests cover, so the row is written past Row Level Security.
 */
async function addMember(delegationId: string, userId: string): Promise<void> {
	const { error } = await createServiceRoleClient()
		.from('delegation_members')
		.insert({ delegation_id: delegationId, user_id: userId, role: 'member' });

	if (error) throw new Error(`Could not add the fixture member: ${error.message}`);
}

/** A seat in a Security Council, France, held by a delegate of St Aidan's, with no draft yet. */
async function createPositionPaper(): Promise<PositionPaperFixture> {
	// A delegation is only made while the conference takes applications.
	const conference = await createOpenConferenceOwnedByMe();
	const committeeId = await addCommittee(conference.supabase, conference.conferenceId);
	const seatId = await addSeat(conference.supabase, committeeId, 'France', 'FR');

	const head = await createSignedInClient('Rachel Morgan');
	const writer = await createSignedInClient('Tom Price');
	const helper = await createSignedInClient('Aisha Bello');
	const delegationId = await addDelegation(head.supabase, conference.conferenceId, "St Aidan's");
	await addMember(delegationId, writer.userId);
	await addMember(delegationId, helper.userId);
	await giveSeatTo(conference.supabase, seatId, writer.userId);

	const { data: committee, error } = await conference.supabase
		.from('committees')
		.select('slug')
		.eq('id', committeeId)
		.single();

	if (error || !committee)
		throw new Error(`Could not read the fixture committee: ${error?.message}`);

	return {
		...conference,
		committeeId,
		committeeSlug: committee.slug,
		seatId,
		delegationId,
		head,
		writer,
		helper
	};
}

/** The delegate starts writing, which is when the paper takes comments. */
async function startDraft(paper: PositionPaperFixture): Promise<void> {
	const { error } = await paper.writer.supabase
		.from('position_paper_drafts')
		.insert({ seat_id: paper.seatId, body_markdown: 'France **supports** the treaty.' });

	if (error) throw new Error(`Could not start the fixture draft: ${error.message}`);
}

/** Where the delegate is sent for a thread: their own position paper, in the writer. */
function writerThreadLinkPath(paper: PositionPaperFixture, threadId: string): string {
	return `/conferences/${paper.conferenceSlug}/committees/${paper.committeeSlug}/position-paper?way=write#thread-${threadId}`;
}

/** Where the rest of the delegation is sent: the delegation's copy of the paper. */
function delegationThreadLinkPath(paper: PositionPaperFixture, threadId: string): string {
	return `/delegations/${paper.delegationId}/papers/${paper.seatId}#thread-${threadId}`;
}

describe('position paper threads', () => {
	it('lets everybody who may write a position paper comment on it and read every thread on it, telling nobody', async () => {
		const paper = await createPositionPaper();
		await startDraft(paper);

		const writerThreadId = await startThread(paper.writer, {
			position_paper_seat_id: paper.seatId,
			...passageIn('body', 'supports')
		});
		const helperThreadId = await startThread(paper.helper, {
			position_paper_seat_id: paper.seatId
		});
		const headThreadId = await startThread(paper.head, { position_paper_seat_id: paper.seatId });

		expect(await storedThread(writerThreadId)).toMatchObject({
			committee_paper_id: null,
			position_paper_seat_id: paper.seatId,
			anchor_fragment: 'body',
			quoted_text: 'supports',
			started_by: paper.writer.userId,
			started_by_seat_id: paper.seatId,
			is_from_dais: false
		});
		// The head and the helper sit in no seat of the committee.
		expect(await storedThread(helperThreadId)).toMatchObject({ started_by_seat_id: null });
		expect(await storedThread(headThreadId)).toMatchObject({ started_by_seat_id: null });

		// All of them count as its authors (decision 15).
		const delegation = { writer: paper.writer, helper: paper.helper, head: paper.head };
		for (const threadId of [writerThreadId, helperThreadId, headThreadId]) {
			expect(await whoReadsThread(threadId, delegation)).toEqual({
				writer: true,
				helper: true,
				head: true
			});
		}
		for (const person of Object.values(delegation)) {
			expect(await commentNotificationsOf(person.userId)).toEqual([]);
		}
	});

	it('puts every comment on a position paper in its one text', async () => {
		const paper = await createPositionPaper();
		await startDraft(paper);

		for (const place of [passageIn('operative', 'supports'), { anchor_fragment: 'preamble' }]) {
			await expectRefusal(
				tryStartingThread(paper.writer, { position_paper_seat_id: paper.seatId, ...place }),
				'22023',
				'That part is not in this paper.'
			);
		}
	});

	it('keeps the chair, the organiser, another delegation and another delegate out of its threads', async () => {
		const paper = await createPositionPaper();
		await startDraft(paper);
		const threadId = await startThread(paper.writer, { position_paper_seat_id: paper.seatId });

		const chair = await createSignedInClient('Fixture Chair');
		await addChair(paper.supabase, paper.committeeId, chair.userId);
		const otherHead = await createSignedInClient('Lena Vogel');
		await addDelegation(otherHead.supabase, paper.conferenceId, 'Another school');
		const chile = await createSignedInClient('Delegate of Chile');
		const chileSeatId = await addSeat(paper.supabase, paper.committeeId, 'Chile', 'CL');
		await giveSeatTo(paper.supabase, chileSeatId, chile.userId);

		// A chair's review of a position paper stays as it is, outside the threads.
		for (const outsider of [chair, paper, otherHead, chile]) {
			await expectRefusal(
				tryStartingThread(outsider, { position_paper_seat_id: paper.seatId }),
				'42501',
				'You cannot comment on this paper.'
			);
			await expectRefusal(tryReplying(outsider, threadId), 'P0002', 'That comment does not exist.');
			expect(await readsThread(outsider, threadId)).toBe(false);
		}
	});

	it('takes no comment on a position paper before its draft is started', async () => {
		const paper = await createPositionPaper();

		await expectRefusal(
			tryStartingThread(paper.writer, { position_paper_seat_id: paper.seatId }),
			'22023',
			'Comments on this paper are closed.'
		);
	});

	it("tells the delegate of a reply at their own position paper, and the rest of the delegation at the delegation's copy", async () => {
		const paper = await createPositionPaper();
		await startDraft(paper);
		const threadId = await startThread(paper.writer, { position_paper_seat_id: paper.seatId });

		await reply(paper.helper, threadId);
		expect(await commentNotificationsOf(paper.writer.userId)).toEqual([
			{
				kind: 'paper_comment_reply',
				title: 'New reply on your position paper for Security Council',
				link_path: writerThreadLinkPath(paper, threadId)
			}
		]);

		await reply(paper.writer, threadId, 'Thank you.');
		expect(await commentNotificationsOf(paper.helper.userId)).toEqual([
			{
				kind: 'paper_comment_reply',
				title: 'New reply on the position paper for France in Security Council',
				link_path: delegationThreadLinkPath(paper, threadId)
			}
		]);
		// The head may read the thread, but has not written in it.
		expect(await commentNotificationsOf(paper.head.userId)).toEqual([]);
	});

	it('deletes the threads with the draft (delete_position_paper_threads, position_paper_drafts_delete_threads)', async () => {
		const paper = await createPositionPaper();
		await startDraft(paper);
		const threadId = await startThread(paper.writer, { position_paper_seat_id: paper.seatId });
		await reply(paper.helper, threadId);

		const { data: deletedDrafts, error } = await paper.writer.supabase
			.from('position_paper_drafts')
			.delete()
			.eq('seat_id', paper.seatId)
			.select('seat_id');

		expect(error).toBeNull();
		expect(deletedDrafts).toHaveLength(1);
		expect(await storedThread(threadId)).toBeNull();
		expect(await storedComments(threadId)).toEqual([]);
	});

	it('deletes the threads when the seat changes hands, with the draft they were on', async () => {
		const paper = await createPositionPaper();
		await startDraft(paper);
		const threadId = await startThread(paper.writer, { position_paper_seat_id: paper.seatId });
		const stranger = await createSignedInClient('Sam Okafor');

		await giveSeatTo(paper.supabase, paper.seatId, stranger.userId);

		expect(await storedThread(threadId)).toBeNull();
	});

	it('leaves a member who leaves the delegation out of its threads, and tells them nothing more', async () => {
		const paper = await createPositionPaper();
		await startDraft(paper);
		const threadId = await startThread(paper.writer, { position_paper_seat_id: paper.seatId });
		await reply(paper.helper, threadId);

		const { data: leavingMembers, error } = await paper.helper.supabase
			.from('delegation_members')
			.delete()
			.eq('delegation_id', paper.delegationId)
			.eq('user_id', paper.helper.userId)
			.select('user_id');
		expect(error).toBeNull();
		expect(leavingMembers).toHaveLength(1);

		await expectRefusal(
			tryReplying(paper.helper, threadId),
			'P0002',
			'That comment does not exist.'
		);
		expect(await readsThread(paper.helper, threadId)).toBe(false);

		await reply(paper.writer, threadId, 'Thank you.');
		expect(await commentNotificationsOf(paper.helper.userId)).toEqual([]);
	});
});

describe('paper_comment_threads and paper_comments', () => {
	it('shows a visitor nothing', async () => {
		const visitor = createVisitorClient();

		await expectRefusal(
			visitor.from('paper_comment_threads').select('id'),
			'42501',
			'permission denied for table paper_comment_threads'
		);
		await expectRefusal(
			visitor.from('paper_comments').select('id'),
			'42501',
			'permission denied for table paper_comments'
		);
	});

	it('takes no write from the browser, only through the functions', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		const threadId = await startThread(committee.france, { committee_paper_id: paperId });
		const commentId = await openingCommentOf(threadId);
		const browser = committee.france.supabase;

		await expectRefusal(
			browser.from('paper_comment_threads').insert({ committee_paper_id: paperId }),
			'42501',
			'new row violates row-level security policy for table "paper_comment_threads"'
		);
		await expectRefusal(
			browser.from('paper_comments').insert({ thread_id: threadId, body: 'Written past them.' }),
			'42501',
			'new row violates row-level security policy for table "paper_comments"'
		);

		// No policy lets an update or a delete through, so they find no row.
		await expectSuccess(
			browser
				.from('paper_comment_threads')
				.update({ resolved_at: new Date().toISOString(), resolved_by: committee.france.userId })
				.eq('id', threadId)
		);
		await expectSuccess(
			browser.from('paper_comments').update({ body: 'Changed past them.' }).eq('id', commentId)
		);
		await expectSuccess(browser.from('paper_comments').delete().eq('id', commentId));
		await expectSuccess(browser.from('paper_comment_threads').delete().eq('id', threadId));

		expect(await storedThread(threadId)).toMatchObject({ resolved_at: null });
		expect(await storedComments(threadId)).toMatchObject([{ id: commentId, body: QUESTION }]);
	});

	it('lets nobody call the helpers behind the functions (thread_accepts_comments, checked_comment_body, holder_has_committee_permission)', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceWritesPaper(committee);
		const threadId = await startThread(committee.france, { committee_paper_id: paperId });

		await expectRefusal(
			committee.france.supabase.rpc('thread_accepts_comments', { thread_id: threadId }),
			'42501',
			'permission denied for function thread_accepts_comments'
		);
		await expectRefusal(
			committee.france.supabase.rpc('checked_comment_body', { body: QUESTION }),
			'42501',
			'permission denied for function checked_comment_body'
		);
		// Who else is on the dais is the functions' to know, not a delegate's.
		await expectRefusal(
			committee.france.supabase.rpc('holder_has_committee_permission', {
				committee_id: committee.committeeId,
				user_id: committee.chair.userId,
				permission: 'run_room'
			}),
			'42501',
			'permission denied for function holder_has_committee_permission'
		);
	});
});
