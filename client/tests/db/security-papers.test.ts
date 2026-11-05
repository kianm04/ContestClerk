import { describe, expect, it } from 'vitest';
import { clauseContentFromMarkdown } from '$lib/paper-clauses';
import {
	openPaperDocument,
	paperDocumentState,
	seedPaperDocument,
	writeMarkdownIntoPaperDocument
} from '$lib/paper-document';
import { committeePaperStore } from '$lib/server/committee-paper-writing';
import { saveLivePaper } from '$lib/server/paper-live-drafts';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient,
	type SignedInClient
} from './supabase-test-client';
import { addSeat, giveSeatTo } from './conference-fixtures';
import {
	addSeatedDelegate,
	createPaperCommittee,
	expectRefusal,
	expectSuccess,
	FIXTURE_OPERATIVE,
	FIXTURE_PREAMBLE,
	fixtureTextFor,
	franceSubmitsPaper,
	notificationsOf,
	startPaper,
	storedPaper,
	storedPaperSeats,
	storedVersions,
	submitPaper,
	writePaper,
	type PaperCommittee,
	type PaperKind
} from './committee-paper-fixtures';

// The findings of the security review of 10 October 2026 about committee
// papers (docs/security-review-2026-10-10.md, M12, L17, L53, L54 and L55),
// closed by supabase/migrations/20261022143000_committee_papers_security.sql:
//
//   * `submit_paper` freezes the clauses the database itself reads out of the
//     paper's Markdown (`paper_clauses_from_markdown`, with
//     `paper_preamble_clauses`, `paper_operative_clauses`,
//     `paper_list_items_from_markdown`, `paper_nest_list_items`,
//     `paper_clauses_without_empty`, `paper_clauses_with_ids`,
//     `paper_position_letters`, `paper_clause_words` and
//     `paper_clause_whitespace` behind it) and refuses clauses the page sends
//     that are not that text, so a version is never words nobody approved.
//     The splitter's helpers run in a time that grows with the text, not its
//     square, and only the database's own functions may call them.
//   * the live Yjs document moved from `committee_papers.document_state` to
//     `committee_paper_documents`, which only the paper's authors read, and
//     the dais once the paper is with it; a save writes it through
//     `save_committee_paper_text` (`protect_committee_papers_columns` and
//     `stamp_committee_paper_save` no longer know the column).
//   * `committee_paper_documents` is read by those people and written by no
//     one but the database's own functions.
//   * `start_paper` caps the papers a seat has started and still writes, and
//     `add_paper_author` the "added to a paper" notifications, by the log in
//     `paper_author_notices`, which outlasts the paper, so starting, adding
//     and deleting again cannot be turned into a notification hose.
//   * `propose_amendment` caps the amendments a seat has waiting on one draft
//     and those it proposes to it in a day; `start_thread` the threads one
//     person has open on a paper and, by the log in `paper_thread_notices`,
//     the new threads a day that tell its authors.
//   * `committee_papers.live_epoch`, moved on by `bump_paper_live_epoch`
//     (the trigger `committee_paper_seats_bump_live_epoch`) and
//     `bump_seat_papers_live_epoch` (`seats_bump_paper_live_epoch`), names
//     the writing channel, which `may_join_paper_writing_channel` reads, so a
//     writer who loses access is left on a channel nobody else is on.
//
// As in committee-papers.test.ts, everybody acts through their own client,
// and what was stored is read back past Row Level Security.

/** The most papers one seat has started and still being written, and the most amendments it has waiting on one draft. */
const PAPERS_IN_WRITING_LIMIT = 5;
const AMENDMENTS_WAITING_LIMIT = 10;

/** The most amendments one seat proposes to one draft in a day, the withdrawn ones included. */
const AMENDMENTS_A_DAY_LIMIT = 20;

/**
 * The most threads one person has open on one paper, and the most new
 * threads on a committee paper they tell its authors of in a day.
 */
const OPEN_THREADS_LIMIT = 50;
const THREAD_NOTICES_A_DAY_LIMIT = 20;

/**
 * How often in a day one seat's "Add an author" tells another seat, and how
 * many seats in all it tells in a day. Past either, the seat is still added.
 */
const AUTHOR_NOTICES_PER_PAIR = 3;
const AUTHOR_NOTICES_PER_ADDER = 30;

/** France starts a draft resolution and writes the fixture text into it. */
async function startWrittenDraft(committee: PaperCommittee): Promise<string> {
	const paperId = await startPaper(committee.france, committee.committeeId);
	await writePaper(committee.france, paperId, fixtureTextFor('draft_resolution'));

	return paperId;
}

/** "Open for signatures", as an author of the paper. */
async function openForSignatures(author: SignedInClient, paperId: string): Promise<void> {
	const { error } = await author.supabase.rpc('set_paper_signatures_open', {
		paper_id: paperId,
		is_open: true
	});

	if (error) throw new Error(`Could not open the fixture paper for signatures: ${error.message}`);
}

/** "Start writing" a working paper, as `delegate`; answers what the database answered. */
function tryStartingPaper(committee: PaperCommittee, delegate: SignedInClient, title: string) {
	return delegate.supabase.rpc('start_paper', {
		committee_id: committee.committeeId,
		kind: 'working_paper',
		title
	});
}

/** "Add an author", as an author of the paper; answers what the database answered. */
function tryAddingAuthor(author: SignedInClient, paperId: string, seatId: string) {
	return author.supabase.rpc('add_paper_author', { paper_id: paperId, seat_id: seatId });
}

/**
 * Types `markdown` into a paper just started, as `author`'s live editor would,
 * and saves it, so that the paper has a stored document to read. The page
 * seeds its document from the paper's text, which is empty at the start.
 */
async function saveLiveDocument(
	author: SignedInClient,
	paperId: string,
	kind: PaperKind,
	markdown: string
): Promise<void> {
	const document = openPaperDocument(seedPaperDocument(''));
	writeMarkdownIntoPaperDocument(document, markdown);

	const result = await saveLivePaper(committeePaperStore(author.supabase, { id: paperId, kind }), {
		document: paperDocumentState(document),
		lastRevision: 1
	});

	if (result.kind !== 'saved') throw new Error(`The live save came back ${result.kind}.`);
}

/** Whether `reader` can read the paper's live document: its row comes back, or nothing does. */
async function canReadDocument(reader: SignedInClient, paperId: string): Promise<boolean> {
	const { data, error } = await reader.supabase
		.from('committee_paper_documents')
		.select('paper_id')
		.eq('paper_id', paperId);

	if (error) throw new Error(`Could not ask whether the document is readable: ${error.message}`);

	return data.length === 1;
}

/** The live epoch of a paper, read past Row Level Security. */
async function liveEpochOf(paperId: string): Promise<number> {
	return (await storedPaper(paperId)).live_epoch;
}

/** Whether `person` may join the writing channel named `topic`, as Realtime would ask. */
async function mayJoin(person: SignedInClient, topic: string): Promise<boolean> {
	const { data, error } = await person.supabase.rpc('may_join_paper_writing_channel', { topic });

	if (error) throw new Error(`Could not ask about the channel: ${error.message}`);

	return data === true;
}

/** A day and an hour ago, which a count of the last day leaves out. */
function dayAndAnHourAgo(): string {
	return new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
}

/** "Comment" on the whole of a paper; answers what start_thread answered. */
function tryStartingThread(
	person: SignedInClient,
	place: { committee_paper_id: string } | { position_paper_seat_id: string },
	body = 'Should this name a deadline?'
) {
	return person.supabase.rpc('start_thread', { body, ...place });
}

/**
 * Deletes the only comment of a thread, as the person who wrote it, which
 * deletes the thread with it.
 */
async function deleteThread(person: SignedInClient, threadId: string): Promise<void> {
	const { data: comments, error } = await createServiceRoleClient()
		.from('paper_comments')
		.select('id')
		.eq('thread_id', threadId);

	if (error || !comments) throw new Error(`Could not read the thread: ${error?.message}`);

	for (const comment of comments) {
		await expectSuccess(person.supabase.rpc('delete_comment', { comment_id: comment.id }));
	}
}

/** Open threads `person` started, written past Row Level Security, as if they had started them. */
async function fillOpenThreads(
	person: SignedInClient,
	place: { committee_paper_id: string } | { position_paper_seat_id: string },
	count: number
): Promise<void> {
	await expectSuccess(
		createServiceRoleClient()
			.from('paper_comment_threads')
			.insert(Array.from({ length: count }, () => ({ ...place, started_by: person.userId })))
	);
}

/** How many times somebody has been told of a new thread. */
async function threadNoticeCountOf(userId: string): Promise<number> {
	return (await notificationsOf(userId)).filter(
		(notification) => notification.kind === 'paper_comment_thread'
	).length;
}

/** Proposes an amendment adding a clause at the start of the operative part, as `delegate`. */
function tryProposing(delegate: SignedInClient, paperId: string, words: string) {
	return delegate.supabase.rpc('propose_amendment', {
		paper_id: paperId,
		action: 'add',
		target_part: 'operative',
		target_clause_id: null,
		text_markdown: words,
		parent_amendment_id: null
	});
}

describe('submit_paper', () => {
	it("refuses clauses that are not the paper's text", async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenDraft(committee);
		const { revision } = await storedPaper(paperId);
		const someoneElsesWords = clauseContentFromMarkdown(
			'Recalling nothing in particular,',
			'1. Decides to adjourn.'
		);

		await expectRefusal(
			committee.france.supabase.rpc('submit_paper', {
				paper_id: paperId,
				expected_revision: revision,
				content: someoneElsesWords
			}),
			'22023',
			"The clauses sent are not the paper's text. Open the paper again and submit it."
		);
		expect((await storedPaper(paperId)).status).toBe('writing');
		expect(await storedVersions(paperId)).toEqual([]);
	});

	it('freezes the clauses of the stored text, whether or not the page sends them', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenDraft(committee);
		const { revision } = await storedPaper(paperId);

		await expectSuccess(
			committee.france.supabase.rpc('submit_paper', {
				paper_id: paperId,
				expected_revision: revision,
				content: null
			})
		);

		expect(await storedVersions(paperId)).toEqual([
			{
				version_number: 1,
				content: clauseContentFromMarkdown(FIXTURE_PREAMBLE, FIXTURE_OPERATIVE),
				amendment_id: null
			}
		]);
	});

	it('splits the text into clauses exactly as the page does', async () => {
		// The splitter is not served to delegates (below), so the test reads it
		// past the API's grants.
		const serviceRole = createServiceRoleClient();
		const corpus: [string, string][] = [
			[FIXTURE_PREAMBLE, FIXTURE_OPERATIVE],
			['', '1. Orders the fleet home.'],
			['', ''],
			['\n\n   \n-\n', '1.\n2. \n\n'],
			[
				'Recalling its resolution 78/241\nof 22 December 2023,  \nand 79/62,\\\nof 2024,',
				'1. Calls upon all States\nto act  \nat once,\n\n   and to report;\n2. Requests.'
			],
			[
				'- Recalling its resolutions,\n- Noting the report,\n1. Alarmed by the speed,',
				'1. Calls upon:\n  a) all States;\n  b) all others;\n2. Requests.'
			],
			[
				'Recalling its resolutions,\r\n\r\nNoting the report,',
				'- Calls upon:\n  - all States;\n  - all others;\n- Requests.'
			],
			['*Recalling* the Charter,', 'Calls upon all States to act;\n\nRequests a report.'],
			['Noting,', '1. Calls upon:\n\ta. all States;\n2. Requests.'],
			[
				'Noting,',
				'1. Calls upon:\n   a. all States:\n      i. to act;\n         1. at once;\n2. Requests.'
			],
			['Noting,', '1. Calls upon:\n      i. all States;\n   a. all others;\n2. Requests.'],
			['Noting,', '1. Calls upon all States;\n2. \n   a. Urges all others;\n3. Requests.'],
			[
				'Noting,',
				[
					'1. Calls upon all States to:',
					...Array.from({ length: 28 }, (_, index) => `   a. part ${index + 1};`)
				].join('\n')
			],
			// The whitespace a browser's `trim` removes and a backslash that ends a line.
			[' Recalling the Charter, \n　Noting the report,\\', '1. Calls upon;\n2. Requests\\'],
			[
				'Deeply disturbed,',
				'IV. Calls upon;\nab) Requests;\nB. Decides;\n+ Urges;\n* Notes;\n3) Ends.'
			],
			[
				'One\n\n\n\nTwo',
				'1. One\n\n\n2. Two\n   text after a blank line\n\nplain after a blank line'
			],
			// A lone carriage return ends no line, so neither of these is a list item.
			['- \rNoting,', `1.${' '.repeat(40)}\rCalls upon all States;\n2. Requests.`]
		];

		for (const [preamble, operative] of corpus) {
			const { data, error } = await serviceRole.rpc('paper_clauses_from_markdown', {
				preamble_markdown: preamble,
				operative_markdown: operative
			});

			expect(error, `${JSON.stringify([preamble, operative])}`).toBeNull();
			expect(data, `${JSON.stringify([preamble, operative])}`).toEqual(
				clauseContentFromMarkdown(preamble, operative)
			);
		}
	});

	it('keeps the splitter from delegates and visitors, who reach it only by submitting', async () => {
		const committee = await createPaperCommittee();
		const splitters: [string, Record<string, unknown>][] = [
			['paper_clauses_from_markdown', { preamble_markdown: '', operative_markdown: '1. Acts.' }],
			['paper_operative_clauses', { markdown: '1. Acts.' }],
			['paper_preamble_clauses', { markdown: 'Noting,' }],
			['paper_list_items_from_markdown', { markdown: '1. Acts.' }],
			['paper_nest_list_items', { items: [], level: 1 }],
			['paper_clauses_without_empty', { clauses: [] }],
			['paper_clauses_with_ids', { clauses: [], parent_id: 'o', level: 1 }],
			['paper_position_letters', { place: 1 }],
			['paper_clause_words', { line: 'Acts.' }],
			['paper_clause_whitespace', {}]
		];

		for (const [name, args] of splitters) {
			const { error: asDelegate } = await committee.france.supabase.rpc(name as never, args);
			const { error: asVisitor } = await createVisitorClient().rpc(name as never, args);

			expect(asDelegate?.code, name).toBe('42501');
			expect(asVisitor?.code, name).toBe('42501');
		}
	});

	it('splits the longest text a part may hold in a moment, not minutes', async () => {
		// 20,000 one-word clauses fill the 100,000 characters a part may hold.
		// Built by copying the answer clause by clause, this took a minute and a
		// half, far past the eight seconds a delegate's request may run.
		const operative = Array.from({ length: 20_000 }, () => '1. a').join('\n');
		const startedAt = Date.now();

		const { data, error } = await createServiceRoleClient().rpc('paper_clauses_from_markdown', {
			preamble_markdown: '',
			operative_markdown: operative
		});

		expect(error).toBeNull();
		expect((data as { operative: unknown[] }).operative).toHaveLength(20_000);
		expect(Date.now() - startedAt).toBeLessThan(8_000);
	});
});

describe('committee_paper_documents', () => {
	it("is for the paper's authors while it is written, and for the dais once it is sent", async () => {
		const committee = await createPaperCommittee();
		const paperId = await startPaper(committee.france, committee.committeeId);
		await saveLiveDocument(
			committee.france,
			paperId,
			'draft_resolution',
			`${FIXTURE_PREAMBLE}\n\n${FIXTURE_OPERATIVE}`
		);
		// Open for signatures, every delegate and the dais may read the paper itself.
		await openForSignatures(committee.france, paperId);

		expect(await canReadDocument(committee.france, paperId)).toBe(true);
		expect(await canReadDocument(committee.germany, paperId)).toBe(false);
		expect(await canReadDocument(committee.chair, paperId)).toBe(false);
		expect(await canReadDocument(committee, paperId)).toBe(false);

		await submitPaper(committee.france, paperId);

		// With the dais, the dais opens the document to anchor its notes.
		expect(await canReadDocument(committee.france, paperId)).toBe(true);
		expect(await canReadDocument(committee.chair, paperId)).toBe(true);
		expect(await canReadDocument(committee.germany, paperId)).toBe(false);

		const { data: forVisitors } = await createVisitorClient()
			.from('committee_paper_documents')
			.select('paper_id')
			.eq('paper_id', paperId);

		expect(forVisitors ?? []).toEqual([]);
	});

	it('is written only through save_committee_paper_text, which keeps the revision moving', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startPaper(committee.france, committee.committeeId, 'working_paper');

		const { error: inserted } = await committee.france.supabase
			.from('committee_paper_documents')
			.insert({ paper_id: paperId, document_state: '\\x00' });

		expect(inserted?.code).toBe('42501');
		// Not even the grant is there: a policy added later by mistake still
		// would not let a browser write the document.
		expect(inserted?.message).toBe('permission denied for table committee_paper_documents');

		const { data: saved } = await committee.france.supabase.rpc('save_committee_paper_text', {
			paper_id: paperId,
			expected_revision: 1,
			body_markdown: 'Words.',
			preamble_markdown: null,
			operative_markdown: null,
			document_state: '\\x0102'
		});

		expect(saved).toBe(2);

		// The same document again, with nothing else changed, still moves the revision on.
		const { data: savedAgain } = await committee.france.supabase.rpc('save_committee_paper_text', {
			paper_id: paperId,
			expected_revision: 2,
			body_markdown: 'Words.',
			preamble_markdown: null,
			operative_markdown: null,
			document_state: '\\x0103'
		});

		expect(savedAgain).toBe(3);

		// A stale revision, and a delegate who does not write the paper, store nothing.
		const { data: stale } = await committee.france.supabase.rpc('save_committee_paper_text', {
			paper_id: paperId,
			expected_revision: 2,
			body_markdown: 'Stale.',
			preamble_markdown: null,
			operative_markdown: null,
			document_state: '\\x00'
		});
		const { data: notMine } = await committee.germany.supabase.rpc('save_committee_paper_text', {
			paper_id: paperId,
			expected_revision: 3,
			body_markdown: 'Not mine.',
			preamble_markdown: null,
			operative_markdown: null,
			document_state: '\\x00'
		});

		expect(stale).toBeNull();
		expect(notMine).toBeNull();
		expect(await storedPaper(paperId)).toMatchObject({
			body_markdown: 'Words.',
			revision: 3,
			updated_by: committee.france.userId
		});
	});

	it('keeps the live document within 1,000,000 bytes', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startPaper(committee.france, committee.committeeId, 'working_paper');

		// PostgREST takes a bytea as \x and its bytes in hexadecimal.
		const { error } = await committee.france.supabase.rpc('save_committee_paper_text', {
			paper_id: paperId,
			expected_revision: 1,
			body_markdown: 'Words.',
			preamble_markdown: null,
			operative_markdown: null,
			document_state: `\\x${'00'.repeat(1_000_001)}`
		});

		expect(error?.message).toContain('committee_paper_documents_state_size');
	});
});

describe('start_paper and add_paper_author', () => {
	it('let a seat have at most five papers it started being written at a time', async () => {
		const committee = await createPaperCommittee();
		const paperIds: string[] = [];

		for (let count = 1; count <= PAPERS_IN_WRITING_LIMIT; count += 1) {
			paperIds.push(await startPaper(committee.france, committee.committeeId, 'working_paper'));
		}

		await expectRefusal(
			tryStartingPaper(committee, committee.france, 'One too many'),
			'22023',
			'This seat has started five papers that are still being written. Submit, withdraw or delete one before starting another.'
		);

		// Only the papers a seat started count, so nobody fills another seat's
		// places by adding it: Germany, an author of all five, still starts its own.
		for (const paperId of paperIds) {
			await expectSuccess(tryAddingAuthor(committee.france, paperId, committee.germany.seatId));
		}
		await expectSuccess(tryStartingPaper(committee, committee.germany, 'Germany’s own'));

		// Leaving a paper it started does not give France the place back: the
		// paper is still being written, by Germany now.
		await expectSuccess(committee.france.supabase.rpc('leave_paper', { paper_id: paperIds[0] }));
		await expectRefusal(
			tryStartingPaper(committee, committee.france, 'Still one too many'),
			'22023',
			'This seat has started five papers that are still being written. Submit, withdraw or delete one before starting another.'
		);

		// A paper sent to the dais is no longer being written, which frees a place.
		await writePaper(committee.france, paperIds[1], fixtureTextFor('working_paper'));
		await submitPaper(committee.france, paperIds[1]);

		await expectSuccess(tryStartingPaper(committee, committee.france, 'Room again'));
	});

	it('tell a seat at most three times a day that one seat added it, however often the paper goes', async () => {
		const committee = await createPaperCommittee();
		const italy = await addSeatedDelegate(committee, 'Italy', 'IT');

		// The attack the review found: start a paper whose title is the
		// message, add the victim, delete the paper, and again.
		for (let cycle = 1; cycle <= AUTHOR_NOTICES_PER_PAIR + 2; cycle += 1) {
			const paperId = await startPaper(committee.france, committee.committeeId, 'working_paper', {
				title: `Chosen words ${cycle}`
			});

			await expectSuccess(tryAddingAuthor(committee.france, paperId, committee.germany.seatId));
			// Germany is an author every time; only the telling stops.
			expect(await storedPaperSeats(paperId)).toContainEqual({
				seat_id: committee.germany.seatId,
				role: 'author'
			});
			await expectSuccess(
				committee.france.supabase.from('committee_papers').delete().eq('id', paperId)
			);
		}

		expect(
			(await notificationsOf(committee.germany.userId))
				.filter((notification) => notification.kind === 'paper_author_added')
				.map((notification) => notification.title)
		).toEqual([
			'You were added to the working paper “Chosen words 1”',
			'You were added to the working paper “Chosen words 2”',
			'You were added to the working paper “Chosen words 3”'
		]);

		// The count is per pair of seats: Italy adding Germany still tells it.
		const italysPaperId = await startPaper(italy, committee.committeeId, 'working_paper', {
			title: 'Italy’s paper'
		});
		await expectSuccess(tryAddingAuthor(italy, italysPaperId, committee.germany.seatId));

		expect(await notificationsOf(committee.germany.userId)).toContainEqual(
			expect.objectContaining({ title: 'You were added to the working paper “Italy’s paper”' })
		);
	});

	it('count what a seat was told over the last day only, and at most thirty seats a day for one adder', async () => {
		const committee = await createPaperCommittee();
		const serviceRole = createServiceRoleClient();
		const emptySeatId = await addSeat(committee.supabase, committee.committeeId, 'Japan', 'JP');

		// Three notices France sent Germany more than a day ago no longer count.
		await expectSuccess(
			serviceRole.from('paper_author_notices').insert(
				Array.from({ length: AUTHOR_NOTICES_PER_PAIR }, () => ({
					adder_seat_id: committee.france.seatId,
					added_seat_id: committee.germany.seatId,
					sent_at: dayAndAnHourAgo()
				}))
			)
		);
		const firstPaperId = await startPaper(
			committee.france,
			committee.committeeId,
			'working_paper',
			{
				title: 'Told'
			}
		);
		await expectSuccess(tryAddingAuthor(committee.france, firstPaperId, committee.germany.seatId));

		// Thirty notices France sent other seats today use up France's day.
		await expectSuccess(
			serviceRole.from('paper_author_notices').insert(
				Array.from({ length: AUTHOR_NOTICES_PER_ADDER }, () => ({
					adder_seat_id: committee.france.seatId,
					added_seat_id: emptySeatId
				}))
			)
		);
		const italy = await addSeatedDelegate(committee, 'Italy', 'IT');
		const secondPaperId = await startPaper(
			committee.france,
			committee.committeeId,
			'working_paper',
			{
				title: 'Not told'
			}
		);
		await expectSuccess(tryAddingAuthor(committee.france, secondPaperId, italy.seatId));

		expect(
			(await notificationsOf(committee.germany.userId)).map((notification) => notification.title)
		).toContain('You were added to the working paper “Told”');
		expect(
			(await notificationsOf(italy.userId)).filter(
				(notification) => notification.kind === 'paper_author_added'
			)
		).toEqual([]);
		expect(await storedPaperSeats(secondPaperId)).toContainEqual({
			seat_id: italy.seatId,
			role: 'author'
		});
	});

	it('keep the notices where no delegate reads or writes them', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startPaper(committee.france, committee.committeeId, 'working_paper');
		await expectSuccess(tryAddingAuthor(committee.france, paperId, committee.germany.seatId));

		// Neither the adder nor the seat added reads the log, and the seat added
		// cannot empty it to be told again.
		const { error: readError } = await committee.france.supabase
			.from('paper_author_notices')
			.select('adder_seat_id');
		const { error: deleteError } = await committee.germany.supabase
			.from('paper_author_notices')
			.delete()
			.eq('added_seat_id', committee.germany.seatId);

		expect(readError?.code).toBe('42501');
		expect(deleteError?.code).toBe('42501');
	});
});

describe('propose_amendment', () => {
	it('lets a seat have at most ten amendments waiting on one draft', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const amendmentIds: string[] = [];

		for (let count = 1; count <= AMENDMENTS_WAITING_LIMIT; count += 1) {
			const { data, error } = await tryProposing(committee.germany, paperId, `Clause ${count};`);

			if (error || !data)
				throw new Error(`Could not propose amendment ${count}: ${error?.message}`);

			amendmentIds.push(data);
		}

		await expectRefusal(
			tryProposing(committee.germany, paperId, 'Clause eleven;'),
			'22023',
			'This seat already has ten amendments waiting on this draft. Withdraw one before proposing another.'
		);

		// One withdrawn is no longer waiting, so there is room for another.
		await expectSuccess(
			committee.germany.supabase.rpc('withdraw_amendment', { amendment_id: amendmentIds[0] })
		);
		await expectSuccess(tryProposing(committee.germany, paperId, 'Clause eleven;'));
	});

	it('lets a seat propose at most twenty amendments to one draft in a day, withdrawn ones included', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);

		// Proposing and withdrawing at once never fills the ten waiting, but
		// each proposal asks France, the author, for an answer.
		for (let count = 1; count <= AMENDMENTS_A_DAY_LIMIT; count += 1) {
			const { data, error } = await tryProposing(committee.germany, paperId, `Clause ${count};`);

			if (error || !data)
				throw new Error(`Could not propose amendment ${count}: ${error?.message}`);

			await expectSuccess(
				committee.germany.supabase.rpc('withdraw_amendment', { amendment_id: data })
			);
		}

		await expectRefusal(
			tryProposing(committee.germany, paperId, 'One more;'),
			'22023',
			'This seat has proposed twenty amendments to this draft in the last day. Propose the next one tomorrow.'
		);
		expect(
			(await notificationsOf(committee.france.userId)).filter(
				(notification) => notification.kind === 'amendment_awaits_answer'
			)
		).toHaveLength(AMENDMENTS_A_DAY_LIMIT);

		// Only the last day counts.
		await expectSuccess(
			createServiceRoleClient()
				.from('amendments')
				.update({ created_at: dayAndAnHourAgo() })
				.eq('paper_id', paperId)
		);
		await expectSuccess(tryProposing(committee.germany, paperId, 'One more;'));
	});
});

describe('start_thread', () => {
	it('lets a person have at most fifty open threads on one paper, and resolving one makes room', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenDraft(committee);
		const onThePaper = { committee_paper_id: paperId };
		await fillOpenThreads(committee.france, onThePaper, OPEN_THREADS_LIMIT - 1);

		const { data: lastThreadId, error } = await tryStartingThread(committee.france, onThePaper);

		if (error || !lastThreadId)
			throw new Error(`Could not start the fiftieth thread: ${error?.message}`);

		await expectRefusal(
			tryStartingThread(committee.france, onThePaper),
			'22023',
			'You have fifty open comments on this paper. Resolve one before starting another.'
		);
		// The count is each person's own: Germany, an author too, still comments.
		await expectSuccess(tryAddingAuthor(committee.france, paperId, committee.germany.seatId));
		await expectSuccess(tryStartingThread(committee.germany, onThePaper));

		await expectSuccess(
			committee.france.supabase.rpc('resolve_thread', { thread_id: lastThreadId })
		);
		await expectSuccess(tryStartingThread(committee.france, onThePaper));
	});

	it("holds a position paper's threads to fifty open from one person too", async () => {
		const committee = await createPaperCommittee();
		const onThePaper = { position_paper_seat_id: committee.france.seatId };
		await expectSuccess(
			committee.france.supabase
				.from('position_paper_drafts')
				.insert({ seat_id: committee.france.seatId, body_markdown: 'France supports the treaty.' })
		);
		await fillOpenThreads(committee.france, onThePaper, OPEN_THREADS_LIMIT);

		await expectRefusal(
			tryStartingThread(committee.france, onThePaper),
			'22023',
			'You have fifty open comments on this paper. Resolve one before starting another.'
		);
	});

	it('tells the authors of at most twenty new threads a day from one person, however many are deleted', async () => {
		const committee = await createPaperCommittee();
		const chile = await addSeatedDelegate(committee, 'Chile', 'CL');
		const paperId = await startWrittenDraft(committee);
		const onThePaper = { committee_paper_id: paperId };
		await openForSignatures(committee.france, paperId);

		// The loop the review found: start a thread, which tells the authors,
		// delete it, which leaves nothing open, and again.
		for (let count = 1; count <= THREAD_NOTICES_A_DAY_LIMIT; count += 1) {
			const { data: threadId, error } = await tryStartingThread(committee.germany, onThePaper);

			if (error || !threadId) throw new Error(`Could not start thread ${count}: ${error?.message}`);

			await deleteThread(committee.germany, threadId);
		}

		// The next thread is started all the same, without telling France.
		await expectSuccess(tryStartingThread(committee.germany, onThePaper));
		expect(await threadNoticeCountOf(committee.france.userId)).toBe(THREAD_NOTICES_A_DAY_LIMIT);

		// The count is each starter's own, and of the last day only.
		await expectSuccess(tryStartingThread(chile, onThePaper));
		expect(await threadNoticeCountOf(committee.france.userId)).toBe(THREAD_NOTICES_A_DAY_LIMIT + 1);
		await expectSuccess(
			createServiceRoleClient()
				.from('paper_thread_notices')
				.update({ sent_at: dayAndAnHourAgo() })
				.eq('started_by', committee.germany.userId)
		);
		await expectSuccess(tryStartingThread(committee.germany, onThePaper));
		expect(await threadNoticeCountOf(committee.france.userId)).toBe(THREAD_NOTICES_A_DAY_LIMIT + 2);

		// Nobody who starts threads reads the log or empties it.
		const { error: readError } = await committee.germany.supabase
			.from('paper_thread_notices')
			.select('paper_id');
		const { error: deleteError } = await committee.germany.supabase
			.from('paper_thread_notices')
			.delete()
			.eq('started_by', committee.germany.userId);

		expect(readError?.code).toBe('42501');
		expect(deleteError?.code).toBe('42501');
	});
});

describe('live_epoch', () => {
	it('moves on whenever the authors change, and renames the writing channel', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startPaper(committee.france, committee.committeeId, 'working_paper');
		const started = await liveEpochOf(paperId);

		expect(await mayJoin(committee.france, `committee-paper:${paperId}:${started}`)).toBe(true);
		// The old shape of the name, without an epoch, opens to nobody.
		expect(await mayJoin(committee.france, `committee-paper:${paperId}`)).toBe(false);
		expect(await mayJoin(committee.france, `committee-paper:${paperId}:${started + 1}`)).toBe(
			false
		);

		await expectSuccess(tryAddingAuthor(committee.france, paperId, committee.germany.seatId));
		const withGermany = await liveEpochOf(paperId);

		expect(withGermany).toBeGreaterThan(started);
		expect(await mayJoin(committee.germany, `committee-paper:${paperId}:${withGermany}`)).toBe(
			true
		);
		expect(await mayJoin(committee.france, `committee-paper:${paperId}:${started}`)).toBe(false);

		await expectSuccess(committee.germany.supabase.rpc('leave_paper', { paper_id: paperId }));
		const afterLeaving = await liveEpochOf(paperId);

		expect(afterLeaving).toBeGreaterThan(withGermany);
		expect(await mayJoin(committee.germany, `committee-paper:${paperId}:${afterLeaving}`)).toBe(
			false
		);
		expect(await mayJoin(committee.france, `committee-paper:${paperId}:${afterLeaving}`)).toBe(
			true
		);
	});

	it('moves on when an author’s seat changes hands', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startPaper(committee.france, committee.committeeId, 'working_paper');
		const before = await liveEpochOf(paperId);
		const newcomer = await createSignedInClient('Newcomer');

		await giveSeatTo(committee.supabase, committee.france.seatId, newcomer.userId);

		const after = await liveEpochOf(paperId);
		expect(after).toBeGreaterThan(before);
		expect(await mayJoin(committee.france, `committee-paper:${paperId}:${after}`)).toBe(false);
		expect(await mayJoin(newcomer, `committee-paper:${paperId}:${after}`)).toBe(true);
	});

	it('moves on when an author’s seat changes hands while the dais has the paper', async () => {
		// France writes on the channel of this epoch, then submits. The seat
		// goes to a newcomer while the dais holds the paper, and the dais
		// returns it. Realtime may still let France's page into the old
		// channel, so the newcomer must write on another.
		const committee = await createPaperCommittee();
		const paperId = await startWrittenDraft(committee);
		const whileFranceWrote = await liveEpochOf(paperId);
		await submitPaper(committee.france, paperId);
		const newcomer = await createSignedInClient('Newcomer');

		await giveSeatTo(committee.supabase, committee.france.seatId, newcomer.userId);
		await expectSuccess(
			committee.chair.supabase.rpc('return_paper', {
				paper_id: paperId,
				comment: 'Add a clause on verification.'
			})
		);

		const afterReturn = await liveEpochOf(paperId);
		expect(afterReturn).toBeGreaterThan(whileFranceWrote);
		expect(await mayJoin(newcomer, `committee-paper:${paperId}:${whileFranceWrote}`)).toBe(false);
		expect(await mayJoin(newcomer, `committee-paper:${paperId}:${afterReturn}`)).toBe(true);
		expect(await mayJoin(committee.france, `committee-paper:${paperId}:${afterReturn}`)).toBe(
			false
		);
	});

	it('opens only under the epoch as written, without a leading zero', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startPaper(committee.france, committee.committeeId, 'working_paper');
		const epoch = await liveEpochOf(paperId);

		expect(await mayJoin(committee.france, `committee-paper:${paperId}:${epoch}`)).toBe(true);
		expect(await mayJoin(committee.france, `committee-paper:${paperId}:0${epoch}`)).toBe(false);
		expect(await mayJoin(committee.france, `committee-paper:${paperId}:0`)).toBe(false);
	});

	it('cannot be changed by a save from the browser', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startPaper(committee.france, committee.committeeId, 'working_paper');

		const { error } = await committee.france.supabase
			.from('committee_papers')
			.update({ live_epoch: 99 })
			.eq('id', paperId);

		expect(error?.code).toBe('42501');
	});
});
