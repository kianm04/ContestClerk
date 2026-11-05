import { describe, expect, it } from 'vitest';
import { clauseContentFromMarkdown } from '$lib/paper-clauses';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient,
	type SignedInClient
} from './supabase-test-client';
import { addCommittee, addSeat, giveSeatTo } from './conference-fixtures';
import {
	addCrisisStaff,
	addSeatedDelegate,
	addVolunteer,
	approvePaper,
	canRead,
	closeVote,
	createPaperCommittee,
	expectRefusal,
	expectSuccess,
	FIXTURE_BODY,
	FIXTURE_OPERATIVE,
	FIXTURE_PAPER_TITLE,
	FIXTURE_PREAMBLE,
	fixtureTextFor,
	franceSubmitsPaper,
	introducePaper,
	notificationsOf,
	openVote,
	paperLinkPath,
	passMotion,
	proposeIntroduction,
	sessionInProgress,
	startPaper,
	storedPaper,
	storedPaperSeats,
	storedVersions,
	submitPaper,
	trySubmittingPaper,
	tryOpeningVote,
	voteOn,
	writePaper,
	type PaperCommittee,
	type PaperKind,
	type PaperOptions
} from './committee-paper-fixtures';

// The papers a committee writes, docs/committee-papers.md sections 3 to 6:
// starting one, its authors and signatories, submitting it to the dais, the
// dais approving, numbering or returning it, withdrawing it, saving its text,
// who may read it at each stage, and the motion that introduces it and the
// vote that settles it. Amendments, comments and the crisis kinds have files
// of their own beside this one.
//
// Everything a person does goes through their own client, so a test only
// passes if the functions and policies let that person do it. As in the
// other files here, a refused select, update or delete comes back empty, so
// what was stored is read back past Row Level Security (storedPaper and the
// rest), and a refused function call is expected by its code and its words,
// which are what the page shows the person who pressed.
//
// Behind the functions a person presses, which the describe titles name:
//
//   * `my_committee_seat_id`, `is_paper_author`, `is_paper_lead` and
//     `may_read_paper` say what the caller is to a paper, for the policies and
//     the functions alike; "reading a paper" walks `may_read_paper` through
//     every stage. `lock_paper` is where every function starts: it holds the
//     paper until the function is done, so two presses at once take turns,
//     and tells anybody who may not read the paper that it does not exist;
//   * `committee_offers_paper_kind` says which kinds a committee writes, and
//     `check_committee_paper_kind` (the trigger `committee_papers_check_kind`)
//     asks it of a paper however the paper is inserted;
//   * `protect_committee_papers_columns` (`committee_papers_protect_columns`)
//     leaves a save from the browser the text and the title, and
//     `stamp_committee_paper_save` (`committee_papers_stamp_save`) moves the
//     revision on and records who saved;
//   * `check_committee_paper_seat` (`committee_paper_seats_check`) and
//     `check_committee_paper_source` (`committee_paper_sources_check`) keep a
//     paper's seats and sources to its own committee, and `hand_on_paper_lead`
//     (`committee_paper_seats_hand_on_lead`) passes the lead on when the lead
//     seat leaves or goes;
//   * `paper_support_needed` turns the committee's minimum into seats, and
//     `is_valid_clause_list` and `is_valid_paper_content` are the shape of the
//     text `submit_paper` freezes;
//   * `notify_paper_users` and `notify_paper_seats` send the notifications,
//     which `paper_label` and `paper_kind_name` word, `paper_link_path` links
//     and `paper_conference_id` files under the paper's conference;
//   * `check_motion_paper` (`motions_check_paper`) keeps a motion to an
//     approved paper of its committee, and on a vote `check_vote_paper`
//     (`votes_check_paper`) checks what it is on, `protect_vote_ties`
//     (`votes_protect_ties`) keeps it there and `settle_vote_paper`
//     (`votes_settle_paper`) settles the paper when it closes.

/** Saves the fixture text of its kind into a paper France started. */
async function startWrittenPaper(
	committee: PaperCommittee,
	kind: PaperKind = 'draft_resolution',
	options: PaperOptions = {}
): Promise<string> {
	const paperId = await startPaper(committee.france, committee.committeeId, kind, options);
	await writePaper(committee.france, paperId, fixtureTextFor(kind));

	return paperId;
}

/** Changes the committee's settings as its organiser, who edits every committee. */
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
function returnPaper(
	chair: SignedInClient,
	paperId: string,
	comment = 'Add a clause on verification.'
) {
	return chair.supabase.rpc('return_paper', { paper_id: paperId, comment });
}

/** "Withdraw", as whoever presses it. */
function withdrawPaper(person: SignedInClient, paperId: string) {
	return person.supabase.rpc('withdraw_paper', { paper_id: paperId });
}

/** The notifications of one kind somebody has been sent, oldest first. */
async function notificationsOfKind(userId: string, kind: string) {
	return (await notificationsOf(userId)).filter((notification) => notification.kind === kind);
}

/** Whether each of these people can open the paper, by the names a test gives them. */
async function whoReads(
	paperId: string,
	readers: Record<string, SignedInClient>
): Promise<Record<string, boolean>> {
	const answers = await Promise.all(
		Object.entries(readers).map(
			async ([name, reader]) => [name, await canRead(reader, paperId)] as const
		)
	);

	return Object.fromEntries(answers);
}

/** The room's state as the database holds it, read past Row Level Security. */
async function storedRoom(committeeId: string) {
	const { data, error } = await createServiceRoleClient()
		.from('committee_state')
		.select('displayed_paper_id')
		.eq('committee_id', committeeId)
		.single();

	if (error || !data) throw new Error(`Could not read the stored room: ${error?.message}`);

	return data;
}

describe('start_paper', () => {
	it('makes the seat of the delegate who starts a paper its first author and its lead', async () => {
		const committee = await createPaperCommittee();

		const paperId = await startPaper(committee.france, committee.committeeId, 'draft_resolution', {
			title: '  Autonomous weapons  '
		});

		expect(await storedPaper(paperId)).toMatchObject({
			committee_id: committee.committeeId,
			kind: 'draft_resolution',
			status: 'writing',
			// The title as it is shown, without the spaces typed around it.
			title: 'Autonomous weapons',
			started_by_seat_id: committee.france.seatId,
			lead_seat_id: committee.france.seatId,
			is_open_for_signatures: false,
			revision: 1,
			topic_number: null,
			sequence: null,
			submitted_at: null
		});
		expect(await storedPaperSeats(paperId)).toEqual([
			{ seat_id: committee.france.seatId, role: 'author' }
		]);
	});

	it('starts each kind empty in the parts it has', async () => {
		const committee = await createPaperCommittee();

		const draftId = await startPaper(committee.france, committee.committeeId, 'draft_resolution');
		const workingPaperId = await startPaper(
			committee.france,
			committee.committeeId,
			'working_paper'
		);

		expect(await storedPaper(draftId)).toMatchObject({
			preamble_markdown: '',
			operative_markdown: '',
			body_markdown: null
		});
		expect(await storedPaper(workingPaperId)).toMatchObject({
			preamble_markdown: null,
			operative_markdown: null,
			body_markdown: ''
		});
	});

	it('refuses somebody who holds no seat in the committee', async () => {
		const committee = await createPaperCommittee();
		const stranger = await createSignedInClient('Stranger');

		for (const person of [committee.chair, committee, stranger]) {
			await expectRefusal(
				person.supabase.rpc('start_paper', {
					committee_id: committee.committeeId,
					kind: 'draft_resolution',
					title: FIXTURE_PAPER_TITLE
				}),
				'42501',
				'Only a delegate of this committee can start a paper.'
			);
		}

		// A committee that does not exist says the same, so the words do not
		// tell anybody which committees exist.
		await expectRefusal(
			committee.france.supabase.rpc('start_paper', {
				committee_id: crypto.randomUUID(),
				kind: 'draft_resolution',
				title: FIXTURE_PAPER_TITLE
			}),
			'42501',
			'Only a delegate of this committee can start a paper.'
		);
	});

	it('lets an observer sign papers but not start one', async () => {
		const committee = await createPaperCommittee();
		const holySee = await addSeatedDelegate(committee, 'Holy See', 'VA', 'observer');

		await expectRefusal(
			holySee.supabase.rpc('start_paper', {
				committee_id: committee.committeeId,
				kind: 'draft_resolution',
				title: FIXTURE_PAPER_TITLE
			}),
			'42501',
			'An observer may sign a paper but not write one.'
		);
	});

	it('starts only the kinds a standard committee writes', async () => {
		const committee = await createPaperCommittee();

		for (const kind of [
			'committee_directive',
			'joint_directive',
			'personal_directive',
			'press_release'
		]) {
			await expectRefusal(
				committee.france.supabase.rpc('start_paper', {
					committee_id: committee.committeeId,
					kind,
					title: FIXTURE_PAPER_TITLE
				}),
				'22023',
				'This committee does not write that kind of paper.'
			);
		}
	});

	it('stops new working papers once the committee turns them off, and keeps the ones it has', async () => {
		const committee = await createPaperCommittee();
		const workingPaperId = await startPaper(
			committee.france,
			committee.committeeId,
			'working_paper'
		);

		await updateCommittee(committee, { has_working_papers: false });

		await expectRefusal(
			committee.france.supabase.rpc('start_paper', {
				committee_id: committee.committeeId,
				kind: 'working_paper',
				title: FIXTURE_PAPER_TITLE
			}),
			'22023',
			'This committee does not write that kind of paper.'
		);
		await writePaper(committee.france, workingPaperId, { body: FIXTURE_BODY });
		await submitPaper(committee.france, workingPaperId);
	});

	it('asks for a title of at most 200 characters', async () => {
		const committee = await createPaperCommittee();

		for (const title of ['   ', 'x'.repeat(201)]) {
			await expectRefusal(
				committee.france.supabase.rpc('start_paper', {
					committee_id: committee.committeeId,
					kind: 'draft_resolution',
					title
				}),
				'22023',
				'A paper needs a title of at most 200 characters.'
			);
		}

		const longestTitle = 'x'.repeat(200);
		const paperId = await startPaper(committee.france, committee.committeeId, 'draft_resolution', {
			title: longestTitle
		});

		expect((await storedPaper(paperId)).title).toBe(longestTitle);
	});

	it('asks which topic on the agenda a paper for the dais is on', async () => {
		const committee = await createPaperCommittee();
		await updateCommittee(committee, { topics: ['Autonomous weapons', 'Cyber security'] });

		await expectRefusal(
			committee.france.supabase.rpc('start_paper', {
				committee_id: committee.committeeId,
				kind: 'draft_resolution',
				title: FIXTURE_PAPER_TITLE
			}),
			'22023',
			'Choose the topic the paper is on.'
		);
		await expectRefusal(
			committee.france.supabase.rpc('start_paper', {
				committee_id: committee.committeeId,
				kind: 'working_paper',
				title: FIXTURE_PAPER_TITLE,
				topic: 'Outer space'
			}),
			'22023',
			"That topic is not on this committee's agenda."
		);

		const paperId = await startPaper(committee.france, committee.committeeId, 'draft_resolution', {
			topic: 'Cyber security'
		});

		expect((await storedPaper(paperId)).topic).toBe('Cyber security');
	});

	it('bases a draft resolution on the working papers its committee has seen introduced', async () => {
		const committee = await createPaperCommittee();
		const workingPaperId = await franceSubmitsPaper(committee, 'working_paper');

		// The same working paper twice is one source: the page may send a
		// choice that was ticked twice.
		const draftId = await startPaper(committee.germany, committee.committeeId, 'draft_resolution', {
			sourcePaperIds: [workingPaperId, workingPaperId]
		});

		const { data: sources } = await committee.germany.supabase
			.from('committee_paper_sources')
			.select('source_paper_id')
			.eq('paper_id', draftId);

		expect(sources).toEqual([{ source_paper_id: workingPaperId }]);
	});

	it('bases only a draft resolution, and only on an introduced working paper of its committee', async () => {
		const committee = await createPaperCommittee();
		const introducedWorkingPaperId = await franceSubmitsPaper(committee, 'working_paper');
		const submittedWorkingPaperId = await franceSubmitsPaper(
			committee,
			'working_paper',
			'submitted'
		);
		const otherCommittee = await createPaperCommittee();
		const otherWorkingPaperId = await franceSubmitsPaper(otherCommittee, 'working_paper');

		await expectRefusal(
			committee.france.supabase.rpc('start_paper', {
				committee_id: committee.committeeId,
				kind: 'working_paper',
				title: FIXTURE_PAPER_TITLE,
				source_paper_ids: [introducedWorkingPaperId]
			}),
			'22023',
			'Only a draft resolution is based on working papers.'
		);

		for (const sourcePaperId of [submittedWorkingPaperId, otherWorkingPaperId]) {
			await expectRefusal(
				committee.france.supabase.rpc('start_paper', {
					committee_id: committee.committeeId,
					kind: 'draft_resolution',
					title: FIXTURE_PAPER_TITLE,
					source_paper_ids: [sourcePaperId]
				}),
				'22023',
				'A draft resolution can only be based on working papers introduced in its committee.'
			);
		}
	});
});

describe('the working papers a draft is based on', () => {
	it('are chosen and dropped by its authors while they write it', async () => {
		const committee = await createPaperCommittee();
		const workingPaperId = await franceSubmitsPaper(committee, 'working_paper');
		const draftId = await startPaper(committee.france, committee.committeeId);

		await expectSuccess(
			committee.france.supabase
				.from('committee_paper_sources')
				.insert({ paper_id: draftId, source_paper_id: workingPaperId })
		);
		await expectSuccess(
			committee.france.supabase
				.from('committee_paper_sources')
				.delete()
				.eq('paper_id', draftId)
				.eq('source_paper_id', workingPaperId)
		);

		const { data: sources } = await createServiceRoleClient()
			.from('committee_paper_sources')
			.select('source_paper_id')
			.eq('paper_id', draftId);

		expect(sources).toEqual([]);
	});

	it('are chosen by nobody else, and not once the draft is submitted', async () => {
		const committee = await createPaperCommittee();
		const workingPaperId = await franceSubmitsPaper(committee, 'working_paper');
		const draftId = await startWrittenPaper(committee);
		await setSignaturesOpen(committee.france, draftId);

		const { error: delegateError } = await committee.germany.supabase
			.from('committee_paper_sources')
			.insert({ paper_id: draftId, source_paper_id: workingPaperId });

		expect(delegateError?.message).toContain('row-level security');

		await submitPaper(committee.france, draftId);

		const { error: submittedError } = await committee.france.supabase
			.from('committee_paper_sources')
			.insert({ paper_id: draftId, source_paper_id: workingPaperId });

		expect(submittedError?.message).toContain('row-level security');
	});
});

describe('the kind of a paper', () => {
	it('is one the committee writes, however the paper is inserted', async () => {
		const committee = await createPaperCommittee();

		const { error } = await createServiceRoleClient().from('committee_papers').insert({
			committee_id: committee.committeeId,
			kind: 'committee_directive',
			title: FIXTURE_PAPER_TITLE,
			operative_markdown: ''
		});

		expect(error).toMatchObject({
			code: '22023',
			message: 'This committee does not write that kind of paper.'
		});
	});

	it('is chosen through start_paper only, which makes its first author', async () => {
		const committee = await createPaperCommittee();

		const { error } = await committee.france.supabase.from('committee_papers').insert({
			committee_id: committee.committeeId,
			kind: 'draft_resolution',
			title: FIXTURE_PAPER_TITLE,
			preamble_markdown: '',
			operative_markdown: ''
		});

		expect(error?.message).toContain('row-level security');
	});
});

describe('the authors of a paper', () => {
	it('include any seat of the committee an author adds, whose delegate is told', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startPaper(committee.france, committee.committeeId);

		await addAuthor(committee.france, paperId, committee.germany.seatId);
		// Adding a seat that writes the paper already changes nothing and
		// tells nobody a second time.
		await addAuthor(committee.france, paperId, committee.germany.seatId);

		expect(await storedPaperSeats(paperId)).toEqual([
			{ seat_id: committee.france.seatId, role: 'author' },
			{ seat_id: committee.germany.seatId, role: 'author' }
		]);
		expect(await notificationsOfKind(committee.germany.userId, 'paper_author_added')).toEqual([
			{
				kind: 'paper_author_added',
				title: 'You were added to the draft resolution “Autonomous weapons”',
				link_path: paperLinkPath(committee, paperId)
			}
		]);
		// The seat writes the paper now, so its delegate reads and saves it.
		expect(
			await writePaper(committee.germany, paperId, { title: 'Lethal autonomous weapons' })
		).toBe(2);
	});

	it('include a seat that had signed, whose signature becomes authorship', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee);
		await setSignaturesOpen(committee.france, paperId);
		await signPaper(committee.germany, paperId);

		await addAuthor(committee.france, paperId, committee.germany.seatId);

		expect(await storedPaperSeats(paperId)).toEqual([
			{ seat_id: committee.france.seatId, role: 'author' },
			{ seat_id: committee.germany.seatId, role: 'author' }
		]);
		expect(await notificationsOfKind(committee.germany.userId, 'paper_author_added')).toHaveLength(
			1
		);
	});

	it('are added by an author only', async () => {
		const committee = await createPaperCommittee();
		const italy = await addSeatedDelegate(committee, 'Italy', 'IT');
		const paperId = await startWrittenPaper(committee);

		// Private while it is written: to anybody else the paper does not exist.
		await expectRefusal(
			committee.germany.supabase.rpc('add_paper_author', {
				paper_id: paperId,
				seat_id: committee.germany.seatId
			}),
			'P0002',
			'That paper does not exist.'
		);

		await setSignaturesOpen(committee.france, paperId);

		for (const person of [committee.germany, committee.chair]) {
			await expectRefusal(
				person.supabase.rpc('add_paper_author', { paper_id: paperId, seat_id: italy.seatId }),
				'42501',
				'Only an author of this paper can add another.'
			);
		}
	});

	it('are seats of the committee that somebody holds, and never an observer', async () => {
		const committee = await createPaperCommittee();
		const emptySeatId = await addSeat(committee.supabase, committee.committeeId, 'Japan', 'JP');
		const holySee = await addSeatedDelegate(committee, 'Holy See', 'VA', 'observer');
		const otherCommittee = await createPaperCommittee();
		const paperId = await startPaper(committee.france, committee.committeeId);

		await expectRefusal(
			committee.france.supabase.rpc('add_paper_author', {
				paper_id: paperId,
				seat_id: otherCommittee.germany.seatId
			}),
			'22023',
			'That seat is not in this committee.'
		);
		await expectRefusal(
			committee.france.supabase.rpc('add_paper_author', {
				paper_id: paperId,
				seat_id: crypto.randomUUID()
			}),
			'22023',
			'That seat is not in this committee.'
		);
		await expectRefusal(
			committee.france.supabase.rpc('add_paper_author', {
				paper_id: paperId,
				seat_id: emptySeatId
			}),
			'22023',
			'Nobody holds that seat yet.'
		);
		await expectRefusal(
			committee.france.supabase.rpc('add_paper_author', {
				paper_id: paperId,
				seat_id: holySee.seatId
			}),
			'22023',
			'An observer may sign a paper but not write one.'
		);
	});

	it('are fixed once the paper is submitted', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee, 'draft_resolution', 'submitted');

		await expectRefusal(
			committee.france.supabase.rpc('add_paper_author', {
				paper_id: paperId,
				seat_id: committee.germany.seatId
			}),
			'22023',
			'Authors are added only while the paper is being written.'
		);
		await expectRefusal(
			committee.france.supabase.rpc('leave_paper', { paper_id: paperId }),
			'22023',
			'Authors leave only while the paper is being written.'
		);
	});

	it('may leave while another remains, and the longest-standing author then leads', async () => {
		const committee = await createPaperCommittee();
		const italy = await addSeatedDelegate(committee, 'Italy', 'IT');
		const paperId = await startWrittenPaper(committee);
		await setSignaturesOpen(committee.france, paperId);

		// Italy signs first and becomes an author last: an author counts from
		// the moment they became one, not from their signature.
		await signPaper(italy, paperId);
		await addAuthor(committee.france, paperId, committee.germany.seatId);
		await addAuthor(committee.france, paperId, italy.seatId);

		await expectSuccess(committee.france.supabase.rpc('leave_paper', { paper_id: paperId }));

		expect(await storedPaper(paperId)).toMatchObject({
			lead_seat_id: committee.germany.seatId,
			started_by_seat_id: committee.france.seatId
		});
		expect(await storedPaperSeats(paperId)).toEqual([
			{ seat_id: committee.germany.seatId, role: 'author' },
			{ seat_id: italy.seatId, role: 'author' }
		]);
	});

	it('keep their last author, and only an author leaves', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee);

		await expectRefusal(
			committee.france.supabase.rpc('leave_paper', { paper_id: paperId }),
			'22023',
			'Another author has to remain. Withdraw the paper instead.'
		);

		await setSignaturesOpen(committee.france, paperId);
		await signPaper(committee.germany, paperId);

		await expectRefusal(
			committee.germany.supabase.rpc('leave_paper', { paper_id: paperId }),
			'42501',
			'Only an author can leave a paper.'
		);
	});

	it('pass the lead on when the lead seat goes', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee);
		await addAuthor(committee.france, paperId, committee.germany.seatId);

		// The organiser empties the seat and deletes it, which takes its rows
		// on papers with it. The database does that part itself, as the
		// tables' owner, so the guards that stop a person changing the lead
		// by hand let it through.
		const { error: unseatError } = await committee.supabase.rpc('revoke_seat', {
			seat_id: committee.france.seatId
		});
		const { data: deletedSeats, error } = await committee.supabase
			.from('seats')
			.delete()
			.eq('id', committee.france.seatId)
			.select('id');

		expect(unseatError).toBeNull();
		expect(error).toBeNull();
		expect(deletedSeats).toEqual([{ id: committee.france.seatId }]);
		expect(await storedPaper(paperId)).toMatchObject({
			lead_seat_id: committee.germany.seatId,
			started_by_seat_id: null
		});
	});
});

describe('the lead author', () => {
	it('hands the lead to another author', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee);
		await addAuthor(committee.france, paperId, committee.germany.seatId);

		await expectSuccess(
			committee.france.supabase.rpc('hand_paper_lead', {
				paper_id: paperId,
				seat_id: committee.germany.seatId
			})
		);

		expect((await storedPaper(paperId)).lead_seat_id).toBe(committee.germany.seatId);

		// France is an author still, but no longer the lead.
		await expectRefusal(
			committee.france.supabase.rpc('hand_paper_lead', {
				paper_id: paperId,
				seat_id: committee.france.seatId
			}),
			'42501',
			'Only the lead author can hand the lead on.'
		);
		// Handing it to the seat that has it changes nothing, and is harmless.
		await expectSuccess(
			committee.germany.supabase.rpc('hand_paper_lead', {
				paper_id: paperId,
				seat_id: committee.germany.seatId
			})
		);
	});

	it('hands the lead only to an author, and only while the paper is written', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee);
		await setSignaturesOpen(committee.france, paperId);
		await signPaper(committee.germany, paperId);

		await expectRefusal(
			committee.france.supabase.rpc('hand_paper_lead', {
				paper_id: paperId,
				seat_id: committee.germany.seatId
			}),
			'22023',
			'The lead goes to another author of the paper.'
		);

		await submitPaper(committee.france, paperId);

		await expectRefusal(
			committee.france.supabase.rpc('hand_paper_lead', {
				paper_id: paperId,
				seat_id: committee.france.seatId
			}),
			'22023',
			'The lead is handed on only while the paper is being written.'
		);
	});
});

describe('the seats on a paper', () => {
	it('are written only through the functions', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee);
		await setSignaturesOpen(committee.france, paperId);

		const { error } = await committee.germany.supabase
			.from('committee_paper_seats')
			.insert({ paper_id: paperId, seat_id: committee.germany.seatId, role: 'author' });

		expect(error?.message).toContain('row-level security');
	});

	it('are seats of the committee that somebody holds, however they are written', async () => {
		const committee = await createPaperCommittee();
		const emptySeatId = await addSeat(committee.supabase, committee.committeeId, 'Japan', 'JP');
		const holySee = await addSeatedDelegate(committee, 'Holy See', 'VA', 'observer');
		const otherCommittee = await createPaperCommittee();
		const paperId = await startPaper(committee.france, committee.committeeId);
		const serviceRole = createServiceRoleClient();

		const { error: emptySeatError } = await serviceRole
			.from('committee_paper_seats')
			.insert({ paper_id: paperId, seat_id: emptySeatId, role: 'signatory' });
		const { error: otherCommitteeError } = await serviceRole
			.from('committee_paper_seats')
			.insert({ paper_id: paperId, seat_id: otherCommittee.france.seatId, role: 'signatory' });
		const { error: observerError } = await serviceRole
			.from('committee_paper_seats')
			.insert({ paper_id: paperId, seat_id: holySee.seatId, role: 'author' });

		expect(emptySeatError).toMatchObject({ code: '22023', message: 'Nobody holds that seat yet.' });
		expect(otherCommitteeError).toMatchObject({
			code: '22023',
			message: 'That seat is not in this committee.'
		});
		expect(observerError).toMatchObject({
			code: '22023',
			message: 'An observer may sign a paper but not write one.'
		});
	});

	it('stay the same seat on the same paper, and are fixed once it is submitted', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee);
		const serviceRole = createServiceRoleClient();

		const { error: movedError } = await serviceRole
			.from('committee_paper_seats')
			.update({ seat_id: committee.germany.seatId })
			.eq('paper_id', paperId)
			.eq('seat_id', committee.france.seatId);

		expect(movedError).toMatchObject({
			code: '42501',
			message: 'A seat on a paper stays that seat on that paper.'
		});

		await submitPaper(committee.france, paperId);

		const { error: submittedError } = await serviceRole
			.from('committee_paper_seats')
			.insert({ paper_id: paperId, seat_id: committee.germany.seatId, role: 'signatory' });

		expect(submittedError).toMatchObject({
			code: '22023',
			message: 'The authors and signatories are fixed once the paper is submitted.'
		});
	});
});

describe('signatures', () => {
	it('are collected while the authors keep the paper open for them', async () => {
		const committee = await createPaperCommittee();
		const holySee = await addSeatedDelegate(committee, 'Holy See', 'VA', 'observer');
		const paperId = await startWrittenPaper(committee);

		await setSignaturesOpen(committee.france, paperId);
		await signPaper(committee.germany, paperId);
		// Signing twice changes nothing.
		await signPaper(committee.germany, paperId);
		// An observer may sign what they may not write.
		await signPaper(holySee, paperId);

		expect((await storedPaper(paperId)).is_open_for_signatures).toBe(true);
		expect(await storedPaperSeats(paperId)).toEqual([
			{ seat_id: committee.france.seatId, role: 'author' },
			{ seat_id: committee.germany.seatId, role: 'signatory' },
			{ seat_id: holySee.seatId, role: 'signatory' }
		]);
	});

	it('are kept when the authors close the paper again, and refused until they reopen it', async () => {
		const committee = await createPaperCommittee();
		const italy = await addSeatedDelegate(committee, 'Italy', 'IT');
		const paperId = await startWrittenPaper(committee);
		await setSignaturesOpen(committee.france, paperId);
		await signPaper(committee.germany, paperId);

		await setSignaturesOpen(committee.france, paperId, false);

		expect(await storedPaperSeats(paperId)).toContainEqual({
			seat_id: committee.germany.seatId,
			role: 'signatory'
		});
		// Germany signed, so it still reads the paper; Italy never did, and
		// the closed paper is private to it again.
		await expectRefusal(
			committee.germany.supabase.rpc('sign_paper', { paper_id: paperId }),
			'22023',
			'This paper is not open for signatures.'
		);
		await expectRefusal(
			italy.supabase.rpc('sign_paper', { paper_id: paperId }),
			'P0002',
			'That paper does not exist.'
		);
	});

	it('come from the seats that do not write the paper', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee);
		await setSignaturesOpen(committee.france, paperId);

		await expectRefusal(
			committee.france.supabase.rpc('sign_paper', { paper_id: paperId }),
			'22023',
			'An author does not sign their own paper.'
		);
		await expectRefusal(
			committee.chair.supabase.rpc('sign_paper', { paper_id: paperId }),
			'42501',
			'Only a delegate of this committee can sign its papers.'
		);
	});

	it('are taken off by the signatory until the paper is submitted', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee);
		await setSignaturesOpen(committee.france, paperId);
		await signPaper(committee.germany, paperId);

		await expectSuccess(committee.germany.supabase.rpc('remove_signature', { paper_id: paperId }));
		// A second press finds nothing to take off and is harmless.
		await expectSuccess(committee.germany.supabase.rpc('remove_signature', { paper_id: paperId }));
		// An author has no signature to take off, so their authorship stays.
		await expectSuccess(committee.france.supabase.rpc('remove_signature', { paper_id: paperId }));

		expect(await storedPaperSeats(paperId)).toEqual([
			{ seat_id: committee.france.seatId, role: 'author' }
		]);

		await signPaper(committee.germany, paperId);
		await submitPaper(committee.france, paperId);

		await expectRefusal(
			committee.germany.supabase.rpc('remove_signature', { paper_id: paperId }),
			'22023',
			'A signature is taken off only before the paper is submitted.'
		);
	});

	// The time is kept by the trigger committee_papers_keep_signatures_opened_at,
	// which calls keep_signatures_opened_at, whichever function moves the flag.
	it('say when the paper was opened, until it is closed again', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee);
		expect((await storedPaper(paperId)).signatures_opened_at).toBeNull();

		const before = Date.now();
		await setSignaturesOpen(committee.france, paperId);
		const openedAt = (await storedPaper(paperId)).signatures_opened_at;

		expect(Date.parse(openedAt ?? '')).toBeGreaterThanOrEqual(before - 5000);
		// Opening a paper that is open already leaves the time it opened.
		await setSignaturesOpen(committee.france, paperId);
		expect((await storedPaper(paperId)).signatures_opened_at).toBe(openedAt);

		await setSignaturesOpen(committee.france, paperId, false);
		expect((await storedPaper(paperId)).signatures_opened_at).toBeNull();
	});

	it('are opened for by an author, on a draft that is being written', async () => {
		const committee = await createPaperCommittee();
		const workingPaperId = await startWrittenPaper(committee, 'working_paper');
		const draftId = await startWrittenPaper(committee);
		await setSignaturesOpen(committee.france, draftId);

		await expectRefusal(
			committee.germany.supabase.rpc('set_paper_signatures_open', {
				paper_id: draftId,
				is_open: false
			}),
			'42501',
			'Only an author of this paper can open it for signatures.'
		);
		await expectRefusal(
			committee.france.supabase.rpc('set_paper_signatures_open', {
				paper_id: workingPaperId,
				is_open: true
			}),
			'22023',
			'Only a draft resolution or a committee directive collects signatures.'
		);

		await submitPaper(committee.france, draftId);

		expect((await storedPaper(draftId)).is_open_for_signatures).toBe(false);
		await expectRefusal(
			committee.france.supabase.rpc('set_paper_signatures_open', {
				paper_id: draftId,
				is_open: true
			}),
			'22023',
			'A paper is open for signatures only while it is being written.'
		);
	});
});

describe('submit_paper', () => {
	it('freezes the text of a draft resolution into version 1, in clauses', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee);
		await setSignaturesOpen(committee.france, paperId);

		await submitPaper(committee.france, paperId);

		const paper = await storedPaper(paperId);

		expect(paper).toMatchObject({ status: 'submitted', is_open_for_signatures: false });
		expect(paper.submitted_at).not.toBeNull();
		expect(await storedVersions(paperId)).toEqual([
			{
				version_number: 1,
				content: clauseContentFromMarkdown(FIXTURE_PREAMBLE, FIXTURE_OPERATIVE),
				amendment_id: null
			}
		]);
		// Submitted, the text is the dais's to read and nobody's to type in.
		const { data: saved } = await committee.france.supabase
			.from('committee_papers')
			.update({ title: 'Something else' })
			.eq('id', paperId)
			.select('id');

		expect(saved).toEqual([]);
	});

	it('freezes the text of a working paper as it is', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee, 'working_paper');

		await submitPaper(committee.france, paperId);

		expect(await storedVersions(paperId)).toEqual([
			{ version_number: 1, content: { markdown: FIXTURE_BODY }, amendment_id: null }
		]);
	});

	it('refuses a text that changed after the page read it', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startPaper(committee.france, committee.committeeId);
		const readRevision = await writePaper(
			committee.france,
			paperId,
			fixtureTextFor('draft_resolution')
		);
		// Another author's save lands between the page reading the text and
		// the submission.
		await writePaper(committee.france, paperId, { title: 'Lethal autonomous weapons' });

		await expectRefusal(
			committee.france.supabase.rpc('submit_paper', {
				paper_id: paperId,
				expected_revision: readRevision,
				content: clauseContentFromMarkdown(FIXTURE_PREAMBLE, FIXTURE_OPERATIVE)
			}),
			'40001',
			'The text changed while it was being submitted. Read it again and submit.'
		);
		expect((await storedPaper(paperId)).status).toBe('writing');
	});

	it("freezes only the clauses of the paper's own text", async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee);
		const { revision } = await storedPaper(paperId);
		const preamble = [{ id: 'p1', markdown: 'Recalling the Charter,' }];
		const clause = (id: string, markdown: string, children: unknown[] = []) => ({
			id,
			markdown,
			children
		});

		// Clauses the page sends are checked against the clauses the database
		// reads out of the stored text (security review, M12): anything else,
		// well formed or not, is a page out of step with the paper.
		const otherContents = [
			{ preamble, operative: [clause('o1', '   ')] },
			{ preamble, operative: [clause('o1', 'Calls upon;'), clause('o1', 'Decides;')] },
			{ preamble: [{ id: 'o1', markdown: 'Recalling,' }], operative: [clause('o1', 'Decides;')] },
			{ preamble, operative: [clause('o 1', 'Calls upon;')] },
			{ preamble, operative: [{ ...clause('o1', 'Calls upon;'), number: 1 }] },
			{ preamble, operative: [clause('o1', 'Calls upon;')], heading: 'The General Assembly' },
			{ operative: [clause('o1', 'Calls upon;')] },
			{
				preamble,
				operative: [
					clause('o1', 'Calls upon:', [
						clause('o1a', 'all States to:', [clause('o1a1', 'declare;')])
					])
				]
			}
		];

		for (const content of otherContents) {
			await expectRefusal(
				committee.france.supabase.rpc('submit_paper', {
					paper_id: paperId,
					expected_revision: revision,
					content
				}),
				'22023',
				"The clauses sent are not the paper's text. Open the paper again and submit it."
			);
		}

		expect(await storedVersions(paperId)).toEqual([]);

		// The same split of the same text, as the page sends it, is accepted.
		await expectSuccess(
			committee.france.supabase.rpc('submit_paper', {
				paper_id: paperId,
				expected_revision: revision,
				content: clauseContentFromMarkdown(FIXTURE_PREAMBLE, FIXTURE_OPERATIVE)
			})
		);
	});

	it('asks for an operative clause, or the text of a working paper', async () => {
		const committee = await createPaperCommittee();
		const draftId = await startPaper(committee.france, committee.committeeId);
		const workingPaperId = await startPaper(
			committee.france,
			committee.committeeId,
			'working_paper'
		);
		await writePaper(committee.france, workingPaperId, { body: ' \n ' });

		await expectRefusal(
			committee.france.supabase.rpc('submit_paper', {
				paper_id: draftId,
				expected_revision: 1,
				// The draft has no text yet, so its clauses are none at all.
				content: clauseContentFromMarkdown('', '')
			}),
			'22023',
			'Write at least one operative clause before submitting.'
		);
		await expectRefusal(
			trySubmittingPaper(committee.france, workingPaperId),
			'22023',
			'Write the paper before submitting it.'
		);
	});

	it('is pressed by an author, once', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee);
		await setSignaturesOpen(committee.france, paperId);
		await signPaper(committee.germany, paperId);

		await expectRefusal(
			trySubmittingPaper(committee.germany, paperId),
			'42501',
			'Only an author of this paper can submit it.'
		);

		await submitPaper(committee.france, paperId);

		await expectRefusal(
			trySubmittingPaper(committee.france, paperId),
			'22023',
			'Only a paper being written can be submitted.'
		);
	});
});

describe('the support a draft needs', () => {
	it('is the sponsors and signatories together, against the committee minimum', async () => {
		const committee = await createPaperCommittee();
		await updateCommittee(committee, { support_minimum: 2, support_unit: 'seats' });
		const paperId = await startWrittenPaper(committee);

		await expectRefusal(
			trySubmittingPaper(committee.france, paperId),
			'22023',
			'Not enough support yet: 1 of the 2 needed.'
		);

		await setSignaturesOpen(committee.france, paperId);
		await signPaper(committee.germany, paperId);

		await submitPaper(committee.france, paperId);
	});

	it('is the signatories alone where the sponsors do not count', async () => {
		const committee = await createPaperCommittee();
		await updateCommittee(committee, {
			support_minimum: 1,
			support_unit: 'seats',
			support_counts_sponsors: false
		});
		const paperId = await startWrittenPaper(committee);

		await expectRefusal(
			trySubmittingPaper(committee.france, paperId),
			'22023',
			'Not enough support yet: 0 of the 1 needed.'
		);

		await setSignaturesOpen(committee.france, paperId);
		await signPaper(committee.germany, paperId);

		await submitPaper(committee.france, paperId);
	});

	it('is a share of the seats that have a delegate, rounded up', async () => {
		const committee = await createPaperCommittee();
		// France, Germany and Italy are seated and Japan is empty, so a share
		// is of three seats.
		await addSeatedDelegate(committee, 'Italy', 'IT');
		await addSeat(committee.supabase, committee.committeeId, 'Japan', 'JP');
		const paperId = await startWrittenPaper(committee);

		// 34% of three is 1.02, which takes two seats.
		await updateCommittee(committee, { support_minimum: 34, support_unit: 'percent' });

		await expectRefusal(
			trySubmittingPaper(committee.france, paperId),
			'22023',
			'Not enough support yet: 1 of the 2 needed.'
		);

		// 30% of three is 0.9, which France alone gives. Were the empty seat
		// counted, 30% of four would be 1.2 and take two.
		await updateCommittee(committee, { support_minimum: 30 });

		await submitPaper(committee.france, paperId);
	});

	it('is asked of the committee as it is set when the paper is submitted', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee);
		await updateCommittee(committee, { support_minimum: 2, support_unit: 'seats' });

		await expectRefusal(
			trySubmittingPaper(committee.france, paperId),
			'22023',
			'Not enough support yet: 1 of the 2 needed.'
		);

		await updateCommittee(committee, { support_minimum: 1 });

		await submitPaper(committee.france, paperId);
	});

	it('comes from at most as many sponsors as the committee allows', async () => {
		const committee = await createPaperCommittee();
		await updateCommittee(committee, { sponsor_limit: 1 });
		const paperId = await startWrittenPaper(committee);
		// Over the limit while writing is fine: the bloc decides who stays.
		await addAuthor(committee.france, paperId, committee.germany.seatId);

		await expectRefusal(
			trySubmittingPaper(committee.france, paperId),
			'22023',
			'This paper has 2 authors, more than the 1 the committee allows.'
		);

		await updateCommittee(committee, { sponsor_limit: null });

		await submitPaper(committee.france, paperId);
	});

	it('comes from a seat sponsoring one draft per topic, where the committee asks for that', async () => {
		const committee = await createPaperCommittee();
		await updateCommittee(committee, {
			topics: ['Autonomous weapons', 'Cyber security'],
			one_sponsorship_per_topic: true
		});
		const firstDraftId = await startWrittenPaper(committee, 'draft_resolution', {
			title: 'A register of weapons',
			topic: 'Autonomous weapons'
		});
		await submitPaper(committee.france, firstDraftId);
		const secondDraftId = await startWrittenPaper(committee, 'draft_resolution', {
			topic: 'Autonomous weapons'
		});
		const otherTopicDraftId = await startWrittenPaper(committee, 'draft_resolution', {
			topic: 'Cyber security'
		});

		await expectRefusal(
			trySubmittingPaper(committee.france, secondDraftId),
			'22023',
			'France already sponsors “A register of weapons”, and a seat may sponsor one draft resolution per topic.'
		);
		await submitPaper(committee.france, otherTopicDraftId);

		// A withdrawn draft frees its sponsors.
		await expectSuccess(withdrawPaper(committee.france, firstDraftId));

		await submitPaper(committee.france, secondDraftId);
	});
});

describe('approve_paper', () => {
	it('numbers a paper by its topic on the agenda, apart from the other kinds', async () => {
		const committee = await createPaperCommittee();
		await updateCommittee(committee, { topics: ['Autonomous weapons', 'Cyber security'] });
		const papers = [];

		for (const [kind, topic] of [
			['draft_resolution', 'Autonomous weapons'],
			['draft_resolution', 'Autonomous weapons'],
			['draft_resolution', 'Cyber security'],
			['working_paper', 'Autonomous weapons']
		] as const) {
			const paperId = await startWrittenPaper(committee, kind, { topic });
			await submitPaper(committee.france, paperId);
			await approvePaper(committee.chair, paperId);
			papers.push(await storedPaper(paperId));
		}

		expect(
			papers.map(({ kind, status, topic_number, sequence }) => ({
				kind,
				status,
				topic_number,
				sequence
			}))
		).toEqual([
			{ kind: 'draft_resolution', status: 'approved', topic_number: 1, sequence: 1 },
			{ kind: 'draft_resolution', status: 'approved', topic_number: 1, sequence: 2 },
			{ kind: 'draft_resolution', status: 'approved', topic_number: 2, sequence: 1 },
			{ kind: 'working_paper', status: 'approved', topic_number: 1, sequence: 1 }
		]);
		expect(papers[0].decided_by).toBe(committee.chair.userId);
		expect(
			(await notificationsOfKind(committee.france.userId, 'paper_approved')).map(
				(notification) => notification.title
			)
		).toEqual([
			'“Autonomous weapons” was approved as Draft resolution 1.1',
			'“Autonomous weapons” was approved as Draft resolution 1.2',
			'“Autonomous weapons” was approved as Draft resolution 2.1',
			'“Autonomous weapons” was approved as Working paper 1.1'
		]);
	});

	it('takes the number the dais types, unless another paper has it', async () => {
		const committee = await createPaperCommittee();
		const firstPaperId = await franceSubmitsPaper(committee, 'draft_resolution', 'submitted');
		const secondPaperId = await franceSubmitsPaper(committee, 'draft_resolution', 'submitted');

		await expectSuccess(
			committee.chair.supabase.rpc('approve_paper', {
				paper_id: firstPaperId,
				topic_number: 3,
				sequence: 7
			})
		);
		await expectRefusal(
			committee.chair.supabase.rpc('approve_paper', {
				paper_id: secondPaperId,
				topic_number: 3,
				sequence: 7
			}),
			'22023',
			'Draft resolution 3.7 is already taken.'
		);
		await expectRefusal(
			committee.chair.supabase.rpc('approve_paper', {
				paper_id: secondPaperId,
				topic_number: 0,
				sequence: 1
			}),
			'22023',
			"A paper's number is two whole numbers from 1, such as 1.2."
		);

		// The next number on a topic follows the highest given on it.
		await approvePaper(committee.chair, secondPaperId);

		expect(await storedPaper(firstPaperId)).toMatchObject({ topic_number: 3, sequence: 7 });
		expect(await storedPaper(secondPaperId)).toMatchObject({ topic_number: 1, sequence: 1 });
	});

	it('never gives a number twice, even once its paper is withdrawn', async () => {
		const committee = await createPaperCommittee();
		const firstPaperId = await franceSubmitsPaper(committee, 'draft_resolution', 'approved');
		await expectSuccess(withdrawPaper(committee.france, firstPaperId));
		const secondPaperId = await franceSubmitsPaper(committee, 'draft_resolution', 'approved');

		expect(await storedPaper(firstPaperId)).toMatchObject({
			status: 'withdrawn',
			topic_number: 1,
			sequence: 1
		});
		expect(await storedPaper(secondPaperId)).toMatchObject({ topic_number: 1, sequence: 2 });
	});

	it('is pressed by the dais, on a submitted paper', async () => {
		const committee = await createPaperCommittee();
		const volunteer = await addVolunteer(committee);
		const writingPaperId = await startWrittenPaper(committee);
		await setSignaturesOpen(committee.france, writingPaperId);
		const submittedPaperId = await franceSubmitsPaper(committee, 'draft_resolution', 'submitted');

		await expectRefusal(
			committee.france.supabase.rpc('approve_paper', { paper_id: submittedPaperId }),
			'42501',
			'Only the dais of this committee can approve a paper.'
		);
		// The team reads a paper once it is introduced, not before.
		await expectRefusal(
			volunteer.supabase.rpc('approve_paper', { paper_id: submittedPaperId }),
			'P0002',
			'That paper does not exist.'
		);
		await expectRefusal(
			committee.chair.supabase.rpc('approve_paper', { paper_id: writingPaperId }),
			'22023',
			'Only a submitted paper can be approved.'
		);

		await approvePaper(committee.chair, submittedPaperId);

		await expectRefusal(
			committee.chair.supabase.rpc('approve_paper', { paper_id: submittedPaperId }),
			'22023',
			'Only a submitted paper can be approved.'
		);
	});
});

describe('return_paper', () => {
	it('reopens a submitted paper for writing, with the dais comment, and keeps its signatures', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee);
		await setSignaturesOpen(committee.france, paperId);
		await signPaper(committee.germany, paperId);
		await submitPaper(committee.france, paperId);

		await expectSuccess(returnPaper(committee.chair, paperId, '  Add a clause on verification.  '));

		const paper = await storedPaper(paperId);

		expect(paper).toMatchObject({
			status: 'writing',
			return_comment: 'Add a clause on verification.',
			decided_by: committee.chair.userId
		});
		expect(paper.submitted_at).not.toBeNull();
		expect(await storedVersions(paperId)).toEqual([]);
		expect(await storedPaperSeats(paperId)).toEqual([
			{ seat_id: committee.france.seatId, role: 'author' },
			{ seat_id: committee.germany.seatId, role: 'signatory' }
		]);

		for (const delegate of [committee.france, committee.germany]) {
			expect(await notificationsOfKind(delegate.userId, 'paper_returned')).toEqual([
				{
					kind: 'paper_returned',
					title: '“Autonomous weapons” was returned to its authors',
					link_path: paperLinkPath(committee, paperId)
				}
			]);
		}

		// The dais that returned it still reads it while its authors fix it.
		expect(await canRead(committee.chair, paperId)).toBe(true);
	});

	it('lets the authors fix the paper and submit it again as version 1', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee, 'draft_resolution', 'submitted');
		await expectSuccess(returnPaper(committee.chair, paperId));

		await writePaper(committee.france, paperId, {
			operative: `${FIXTURE_OPERATIVE}\n3. Requests a report on verification.`
		});
		await submitPaper(committee.france, paperId);

		const paper = await storedPaper(paperId);
		const versions = await storedVersions(paperId);

		expect(paper).toMatchObject({
			status: 'submitted',
			decided_at: null,
			decided_by: null,
			// The comment stays, so the dais sees what it asked for.
			return_comment: 'Add a clause on verification.'
		});
		expect(versions.map((version) => version.version_number)).toEqual([1]);
		expect(versions[0].content.operative).toHaveLength(3);
	});

	it('is pressed by the dais, on a submitted paper, with a comment of at most 2,000 characters', async () => {
		const committee = await createPaperCommittee();
		const submittedPaperId = await franceSubmitsPaper(committee, 'draft_resolution', 'submitted');
		const approvedPaperId = await franceSubmitsPaper(committee, 'draft_resolution', 'approved');

		await expectRefusal(
			returnPaper(committee.france, submittedPaperId),
			'42501',
			'Only the dais of this committee can return a paper.'
		);
		await expectRefusal(
			returnPaper(committee.chair, approvedPaperId),
			'22023',
			'Only a submitted paper can be returned.'
		);

		for (const comment of [' ', 'x'.repeat(2001)]) {
			await expectRefusal(
				returnPaper(committee.chair, submittedPaperId, comment),
				'22023',
				'Say in at most 2,000 characters what the authors should change.'
			);
		}
	});
});

describe('withdraw_paper', () => {
	it('is pressed by an author until the paper is introduced', async () => {
		const committee = await createPaperCommittee();
		const writingPaperId = await startWrittenPaper(committee);
		await setSignaturesOpen(committee.france, writingPaperId);
		const submittedPaperId = await franceSubmitsPaper(committee, 'draft_resolution', 'submitted');
		const approvedPaperId = await franceSubmitsPaper(committee, 'draft_resolution', 'approved');

		await expectRefusal(
			withdrawPaper(committee.germany, writingPaperId),
			'42501',
			'Only an author of this paper can withdraw it.'
		);
		await expectRefusal(
			withdrawPaper(committee.chair, submittedPaperId),
			'42501',
			'Only an author of this paper can withdraw it.'
		);

		for (const paperId of [writingPaperId, submittedPaperId, approvedPaperId]) {
			await expectSuccess(withdrawPaper(committee.france, paperId));
		}

		expect(await storedPaper(writingPaperId)).toMatchObject({
			status: 'withdrawn',
			is_open_for_signatures: false,
			topic_number: null
		});
		expect(await storedPaper(submittedPaperId)).toMatchObject({ status: 'withdrawn' });
		// A paper withdrawn after approval keeps its number.
		expect(await storedPaper(approvedPaperId)).toMatchObject({
			status: 'withdrawn',
			topic_number: 1,
			sequence: 1
		});
		await expectRefusal(
			withdrawPaper(committee.france, approvedPaperId),
			'22023',
			'This paper can no longer be withdrawn.'
		);
	});

	it('is pressed by the dais once the paper is introduced, and takes it off the projector', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);

		expect((await storedRoom(committee.committeeId)).displayed_paper_id).toBe(paperId);
		await expectRefusal(
			withdrawPaper(committee.france, paperId),
			'42501',
			'Once a paper is introduced, the dais withdraws it.'
		);

		await expectSuccess(withdrawPaper(committee.chair, paperId));

		expect((await storedPaper(paperId)).status).toBe('withdrawn');
		expect((await storedRoom(committee.committeeId)).displayed_paper_id).toBeNull();
	});

	it('waits for an open vote on the paper to close, and refuses a paper the vote settled', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const voteId = await openVote(committee, { paperId });

		await expectRefusal(
			withdrawPaper(committee.chair, paperId),
			'22023',
			'Close the open vote first.'
		);

		await expectSuccess(closeVote(committee.chair, voteId, true));

		await expectRefusal(
			withdrawPaper(committee.chair, paperId),
			'22023',
			'This paper can no longer be withdrawn.'
		);
	});
});

describe('saving a paper', () => {
	it('moves the revision on with every change to the text or the title, and only then', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startPaper(committee.france, committee.committeeId);

		expect(await writePaper(committee.france, paperId, { preamble: FIXTURE_PREAMBLE })).toBe(2);
		// The same text again changes nothing, so nobody's newer save clashes with it.
		expect(await writePaper(committee.france, paperId, { preamble: FIXTURE_PREAMBLE })).toBe(2);
		expect(
			await writePaper(committee.france, paperId, { title: 'Lethal autonomous weapons' })
		).toBe(3);

		// The revision is the database's to count, whatever the browser sends.
		const { data } = await committee.france.supabase
			.from('committee_papers')
			.update({ operative_markdown: FIXTURE_OPERATIVE, revision: 100 })
			.eq('id', paperId)
			.select('revision')
			.single();

		expect(data?.revision).toBe(4);
		expect((await storedPaper(paperId)).updated_by).toBe(committee.france.userId);
	});

	it('records who saved last', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startPaper(committee.france, committee.committeeId);
		await addAuthor(committee.france, paperId, committee.germany.seatId);
		const before = await storedPaper(paperId);

		await writePaper(committee.germany, paperId, { preamble: FIXTURE_PREAMBLE });

		const after = await storedPaper(paperId);

		expect(after.updated_by).toBe(committee.germany.userId);
		expect(new Date(after.updated_at).getTime()).toBeGreaterThan(
			new Date(before.updated_at).getTime()
		);
	});

	it('changes only the text and the title', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startPaper(committee.france, committee.committeeId);

		for (const change of [
			{ status: 'submitted' },
			{ lead_seat_id: committee.germany.seatId },
			{ is_open_for_signatures: true },
			{ topic_number: 1, sequence: 1 },
			{ return_comment: 'Fine.' },
			{ committee_id: crypto.randomUUID() }
		]) {
			await expectRefusal(
				committee.france.supabase.from('committee_papers').update(change).eq('id', paperId),
				'42501',
				'A save changes only the text and the title of a paper.'
			);
		}
	});

	it('keeps the parts its kind has, each within 100,000 characters, under a title', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startPaper(committee.france, committee.committeeId);

		const save = (change: Record<string, unknown>) =>
			committee.france.supabase.from('committee_papers').update(change).eq('id', paperId);

		expect((await save({ body_markdown: FIXTURE_BODY })).error?.message).toContain(
			'committee_papers_text_fits_kind'
		);
		expect((await save({ preamble_markdown: null })).error?.message).toContain(
			'committee_papers_text_fits_kind'
		);
		expect((await save({ operative_markdown: 'x'.repeat(100_001) })).error?.message).toContain(
			'committee_papers_text_within_limit'
		);
		expect((await save({ title: '  ' })).error?.message).toContain(
			'committee_papers_title_is_written'
		);
		expect((await save({ operative_markdown: 'x'.repeat(100_000) })).error).toBeNull();
	});

	it('is for the authors alone', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee);
		await setSignaturesOpen(committee.france, paperId);
		await signPaper(committee.germany, paperId);

		for (const person of [committee.germany, committee.chair, committee]) {
			const { data } = await person.supabase
				.from('committee_papers')
				.update({ title: 'Something else' })
				.eq('id', paperId)
				.select('id');

			expect(data).toEqual([]);
		}

		expect((await storedPaper(paperId)).title).toBe(FIXTURE_PAPER_TITLE);
	});
});

describe('deleting a paper', () => {
	it('is for the lead author, and takes the seats on it with it', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee);
		await addAuthor(committee.france, paperId, committee.germany.seatId);

		const { data: deletedByAnotherAuthor } = await committee.germany.supabase
			.from('committee_papers')
			.delete()
			.eq('id', paperId)
			.select('id');

		expect(deletedByAnotherAuthor).toEqual([]);

		const { data: deletedByTheLead } = await committee.france.supabase
			.from('committee_papers')
			.delete()
			.eq('id', paperId)
			.select('id');

		expect(deletedByTheLead).toEqual([{ id: paperId }]);
		expect(await storedPaperSeats(paperId)).toEqual([]);
	});

	it('stops once the paper has been submitted, even after the dais returns it', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee, 'draft_resolution', 'submitted');
		await expectSuccess(returnPaper(committee.chair, paperId));

		const { data } = await committee.france.supabase
			.from('committee_papers')
			.delete()
			.eq('id', paperId)
			.select('id');

		expect(data).toEqual([]);
		expect((await storedPaper(paperId)).status).toBe('writing');
	});
});

describe('typing in a paper', () => {
	it('is for its authors while it is being written', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee);
		await setSignaturesOpen(committee.france, paperId);
		await signPaper(committee.germany, paperId);

		const mayWrite = async (person: SignedInClient) =>
			(await person.supabase.rpc('may_write_paper', { paper_id: paperId })).data;

		expect(await mayWrite(committee.france)).toBe(true);
		expect(await mayWrite(committee.germany)).toBe(false);
		expect(await mayWrite(committee.chair)).toBe(false);

		await submitPaper(committee.france, paperId);

		expect(await mayWrite(committee.france)).toBe(false);

		await expectSuccess(returnPaper(committee.chair, paperId));

		expect(await mayWrite(committee.france)).toBe(true);
	});

	it('opens the live writing channel to the authors alone', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startWrittenPaper(committee);
		await setSignaturesOpen(committee.france, paperId);
		// The channel is named after the paper's authors as they stand
		// (live_epoch, security review L55); security-papers.test.ts follows
		// the name as the authors change.
		const topic = `committee-paper:${paperId}:${(await storedPaper(paperId)).live_epoch}`;

		const mayJoin = async (person: SignedInClient, topic: string) =>
			(await person.supabase.rpc('may_join_paper_writing_channel', { topic })).data;

		expect(await mayJoin(committee.france, topic)).toBe(true);
		expect(await mayJoin(committee.germany, topic)).toBe(false);
		expect(await mayJoin(committee.chair, topic)).toBe(false);
		// Only that exact shape: the position paper's channel and anything
		// malformed are refused rather than cast to an id.
		expect(await mayJoin(committee.france, `paper:${paperId}`)).toBe(false);
		expect(await mayJoin(committee.france, `committee-paper:${paperId}`)).toBe(false);
		expect(await mayJoin(committee.france, 'committee-paper:not-an-id:1')).toBe(false);
		expect(await mayJoin(committee.france, `${topic} `)).toBe(false);
	});
});

describe('reading a paper', () => {
	it('opens to more people as the paper goes from its authors to the committee', async () => {
		const committee = await createPaperCommittee();
		const italy = await addSeatedDelegate(committee, 'Italy', 'IT');
		const volunteer = await addVolunteer(committee);
		const crisisStaff = await addCrisisStaff(committee);
		const stranger = await createSignedInClient('Stranger');
		const otherCommitteeId = await addCommittee(
			committee.supabase,
			committee.conferenceId,
			'General Assembly'
		);
		const otherSeatId = await addSeat(committee.supabase, otherCommitteeId, 'Brazil', 'BR');
		const otherCommitteeDelegate = await createSignedInClient('Delegate of Brazil');
		await giveSeatTo(committee.supabase, otherSeatId, otherCommitteeDelegate.userId);
		const readers = {
			author: committee.france,
			signatory: committee.germany,
			delegate: italy,
			chair: committee.chair,
			volunteer,
			crisisStaff,
			otherCommitteeDelegate,
			stranger
		};
		const nobodyBut = (...names: string[]) =>
			Object.fromEntries(Object.keys(readers).map((name) => [name, names.includes(name)]));

		const paperId = await startWrittenPaper(committee);

		expect(await whoReads(paperId, readers)).toEqual(nobodyBut('author'));

		await setSignaturesOpen(committee.france, paperId);

		expect(await whoReads(paperId, readers)).toEqual(
			nobodyBut('author', 'signatory', 'delegate', 'chair')
		);

		// Closed again, the paper is private once more, except to the seat that signed.
		await signPaper(committee.germany, paperId);
		await setSignaturesOpen(committee.france, paperId, false);

		expect(await whoReads(paperId, readers)).toEqual(nobodyBut('author', 'signatory'));

		await submitPaper(committee.france, paperId);

		expect(await whoReads(paperId, readers)).toEqual(nobodyBut('author', 'signatory', 'chair'));

		await expectSuccess(returnPaper(committee.chair, paperId));

		expect(await whoReads(paperId, readers)).toEqual(nobodyBut('author', 'signatory', 'chair'));

		await submitPaper(committee.france, paperId);
		await approvePaper(committee.chair, paperId);

		expect(await whoReads(paperId, readers)).toEqual(nobodyBut('author', 'signatory', 'chair'));

		await introducePaper(committee, paperId);

		expect(await whoReads(paperId, readers)).toEqual(
			nobodyBut('author', 'signatory', 'delegate', 'chair', 'volunteer', 'crisisStaff')
		);

		await voteOn(committee, { paperId }, true);

		expect(await whoReads(paperId, readers)).toEqual(
			nobodyBut('author', 'signatory', 'delegate', 'chair', 'volunteer', 'crisisStaff')
		);
	});

	it('shows the seats, the versions and the sources to whoever reads the paper', async () => {
		const committee = await createPaperCommittee();
		const italy = await addSeatedDelegate(committee, 'Italy', 'IT');
		const workingPaperId = await franceSubmitsPaper(committee, 'working_paper');
		const paperId = await startWrittenPaper(committee, 'draft_resolution', {
			sourcePaperIds: [workingPaperId]
		});
		await submitPaper(committee.france, paperId);

		const countRows = async (person: SignedInClient, table: string) =>
			(await person.supabase.from(table).select('paper_id').eq('paper_id', paperId)).data?.length;

		for (const table of [
			'committee_paper_seats',
			'committee_paper_versions',
			'committee_paper_sources'
		]) {
			expect(await countRows(committee.chair, table)).toBe(1);
			expect(await countRows(italy, table)).toBe(0);
		}
	});

	it('is never for a visitor who is not signed in', async () => {
		const committee = await createPaperCommittee();
		await franceSubmitsPaper(committee);
		const visitor = createVisitorClient();

		for (const table of [
			'committee_papers',
			'committee_paper_seats',
			'committee_paper_sources',
			'committee_paper_versions'
		]) {
			const { error } = await visitor.from(table).select('*');

			expect(error?.code).toBe('42501');
		}
	});
});

describe('introducing a paper', () => {
	it('happens when the motion to introduce it passes, and puts it on the projector', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee, 'draft_resolution', 'approved');
		const motionId = await proposeIntroduction(committee, paperId);
		const pressedAt = '2030-01-01T10:00:00.000Z';

		await expectSuccess(
			committee.chair.supabase.rpc('apply_passed_motion', {
				motion_id: motionId,
				pressed_at: pressedAt
			})
		);

		const paper = await storedPaper(paperId);

		expect(paper).toMatchObject({ status: 'introduced', introduced_by_motion_id: motionId });
		expect(new Date(paper.introduced_at).toISOString()).toBe(pressedAt);
		expect((await storedRoom(committee.committeeId)).displayed_paper_id).toBe(paperId);
		expect(await notificationsOfKind(committee.france.userId, 'paper_introduced')).toEqual([
			{
				kind: 'paper_introduced',
				title: 'Draft resolution 1.1 was introduced',
				link_path: paperLinkPath(committee, paperId)
			}
		]);
	});

	it('names only an approved paper of the committee, in a motion to introduce a document', async () => {
		const committee = await createPaperCommittee();
		const sessionId = await sessionInProgress(committee);
		const submittedPaperId = await franceSubmitsPaper(committee, 'draft_resolution', 'submitted');
		const introducedPaperId = await franceSubmitsPaper(committee);
		const approvedPaperId = await franceSubmitsPaper(committee, 'draft_resolution', 'approved');
		const otherCommittee = await createPaperCommittee();
		const otherPaperId = await franceSubmitsPaper(otherCommittee, 'draft_resolution', 'approved');

		const writeDownMotion = (kind: string, paperId: string) =>
			committee.chair.supabase.from('motions').insert({
				committee_id: committee.committeeId,
				session_id: sessionId,
				kind,
				topic: kind === 'other' ? 'Introduce the paper' : null,
				paper_id: paperId
			});

		for (const paperId of [submittedPaperId, introducedPaperId, otherPaperId]) {
			await expectRefusal(
				writeDownMotion('introduce_document', paperId),
				'22023',
				'Only an approved paper of this committee can be introduced.'
			);
		}

		const { error } = await writeDownMotion('other', approvedPaperId);

		expect(error?.message).toContain('motions_paper_is_introduce_document');
	});

	it('is refused for a paper withdrawn while its motion was on the floor', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee, 'draft_resolution', 'approved');
		const motionId = await proposeIntroduction(committee, paperId);
		await expectSuccess(withdrawPaper(committee.france, paperId));

		await expectRefusal(
			passMotion(committee.chair, motionId),
			'22023',
			'That paper is no longer waiting to be introduced. Drop the motion.'
		);

		const { data: motion } = await createServiceRoleClient()
			.from('motions')
			.select('status')
			.eq('id', motionId)
			.single();

		// Nothing of the pass stayed: the chair drops the motion instead.
		expect(motion?.status).toBe('proposed');
	});

	it('needs the passed motion, and the dais', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee, 'draft_resolution', 'approved');
		const motionId = await proposeIntroduction(committee, paperId);

		await expectRefusal(
			committee.chair.supabase.rpc('introduce_paper', { paper_id: paperId, motion_id: motionId }),
			'22023',
			'A paper is introduced by passing a motion to introduce it.'
		);
		await expectRefusal(
			committee.france.supabase.rpc('introduce_paper', { paper_id: paperId, motion_id: motionId }),
			'42501',
			'Only the dais of this committee can introduce a paper.'
		);
	});

	it('leaves a motion naming no paper once its paper is deleted', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee, 'draft_resolution', 'approved');
		const motionId = await proposeIntroduction(committee, paperId);
		const serviceRole = createServiceRoleClient();

		await serviceRole.from('committee_papers').delete().eq('id', paperId);

		const { data: motion } = await serviceRole
			.from('motions')
			.select('paper_id, status')
			.eq('id', motionId)
			.single();

		expect(motion).toEqual({ paper_id: null, status: 'proposed' });
	});
});

describe('voting on a paper', () => {
	it('says what the vote is on, and settles the paper when it closes', async () => {
		const committee = await createPaperCommittee();
		const passingPaperId = await franceSubmitsPaper(committee);
		const failingPaperId = await franceSubmitsPaper(committee);

		const { data: vote } = await tryOpeningVote(committee, { paperId: passingPaperId });

		expect(vote?.subject).toBe('Draft resolution 1.1');

		await expectSuccess(closeVote(committee.chair, vote!.id, true));
		await voteOn(committee, { paperId: failingPaperId }, false);

		expect(await storedPaper(passingPaperId)).toMatchObject({
			status: 'passed',
			decided_by: committee.chair.userId
		});
		expect((await storedPaper(failingPaperId)).status).toBe('failed');
	});

	it('is substantive, on an introduced draft resolution of the committee', async () => {
		const committee = await createPaperCommittee();
		const sessionId = await sessionInProgress(committee);
		const approvedPaperId = await franceSubmitsPaper(committee, 'draft_resolution', 'approved');
		const workingPaperId = await franceSubmitsPaper(committee, 'working_paper');
		const introducedPaperId = await franceSubmitsPaper(committee);
		const otherCommittee = await createPaperCommittee();
		const otherPaperId = await franceSubmitsPaper(otherCommittee);

		for (const paperId of [approvedPaperId, workingPaperId]) {
			await expectRefusal(
				tryOpeningVote(committee, { paperId }),
				'22023',
				'Only an introduced draft resolution or committee directive is voted on.'
			);
		}

		await expectRefusal(
			tryOpeningVote(committee, { paperId: otherPaperId }),
			'22023',
			'That paper is not in this committee.'
		);
		await expectRefusal(
			committee.chair.supabase.from('votes').insert({
				committee_id: committee.committeeId,
				session_id: sessionId,
				kind: 'procedural',
				paper_id: introducedPaperId
			}),
			'22023',
			'A vote on a paper or an amendment is substantive.'
		);
	});

	it('is one at a time on a draft, and on one thing', async () => {
		const committee = await createPaperCommittee();
		const sessionId = await sessionInProgress(committee);
		const paperId = await franceSubmitsPaper(committee);
		const otherPaperId = await franceSubmitsPaper(committee);
		await openVote(committee, { paperId });

		await expectRefusal(
			tryOpeningVote(committee, { paperId }),
			'22023',
			'Close the open vote on this draft first.'
		);

		const { data: motion } = await committee.chair.supabase
			.from('motions')
			.insert({
				committee_id: committee.committeeId,
				session_id: sessionId,
				kind: 'other',
				topic: 'Extend the time for questions'
			})
			.select('id')
			.single();
		const { error } = await committee.chair.supabase.from('votes').insert({
			committee_id: committee.committeeId,
			session_id: sessionId,
			kind: 'substantive',
			paper_id: otherPaperId,
			motion_id: motion?.id
		});

		expect(error?.message).toContain('votes_on_one_thing');
	});

	it('stays on what it was opened on, and once closed stays as it closed', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const otherPaperId = await franceSubmitsPaper(committee);
		const voteId = await openVote(committee, { paperId });

		await expectRefusal(
			committee.chair.supabase.from('votes').update({ paper_id: otherPaperId }).eq('id', voteId),
			'42501',
			'A vote stays on the paper or amendment it was opened on.'
		);

		await expectSuccess(closeVote(committee.chair, voteId, true));

		await expectRefusal(
			committee.chair.supabase.from('votes').update({ votes_for: 10 }).eq('id', voteId),
			'42501',
			'A closed vote on a paper or an amendment stays as it closed.'
		);
		await expectRefusal(
			committee.chair.supabase.from('votes').delete().eq('id', voteId),
			'42501',
			'A closed vote on a paper or an amendment stays as it closed.'
		);
	});

	it('is cancelled while open, and settles nothing when it closes without a result', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		const cancelledVoteId = await openVote(committee, { paperId });

		await expectSuccess(committee.chair.supabase.from('votes').delete().eq('id', cancelledVoteId));

		const unfinishedVoteId = await openVote(committee, { paperId });

		await expectSuccess(
			committee.chair.supabase
				.from('votes')
				.update({ status: 'closed', closed_at: new Date().toISOString() })
				.eq('id', unfinishedVoteId)
		);

		expect((await storedPaper(paperId)).status).toBe('introduced');
	});

	it('goes with its committee when a draft conference is deleted', async () => {
		const committee = await createPaperCommittee();
		const paperId = await franceSubmitsPaper(committee);
		await voteOn(committee, { paperId }, true);

		const { error } = await committee.supabase
			.from('conferences')
			.delete()
			.eq('id', committee.conferenceId);

		expect(error).toBeNull();

		const { data: votes } = await createServiceRoleClient()
			.from('votes')
			.select('id')
			.eq('committee_id', committee.committeeId);
		const { data: papers } = await createServiceRoleClient()
			.from('committee_papers')
			.select('id')
			.eq('id', paperId);

		expect(votes).toEqual([]);
		expect(papers).toEqual([]);
	});
});

describe('the paper on the projector', () => {
	it('is one the committee has seen introduced', async () => {
		const committee = await createPaperCommittee();
		const introducedPaperId = await franceSubmitsPaper(committee);
		const approvedPaperId = await franceSubmitsPaper(committee, 'draft_resolution', 'approved');
		const otherCommittee = await createPaperCommittee();
		const otherPaperId = await franceSubmitsPaper(otherCommittee);

		const showOnScreen = (paperId: string | null) =>
			committee.chair.supabase
				.from('committee_state')
				.update({ displayed_paper_id: paperId })
				.eq('committee_id', committee.committeeId);

		for (const paperId of [approvedPaperId, otherPaperId]) {
			expect((await showOnScreen(paperId)).error?.message).toContain('row-level security');
		}

		await expectSuccess(showOnScreen(null));
		await expectSuccess(showOnScreen(introducedPaperId));

		expect((await storedRoom(committee.committeeId)).displayed_paper_id).toBe(introducedPaperId);
	});
});
