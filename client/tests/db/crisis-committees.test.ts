import { describe, expect, it } from 'vitest';
import type { Database } from '$lib/database.types';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import { addChair, addCommittee, addSeat, giveSeatTo } from './conference-fixtures';
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
	FIXTURE_BODY,
	FIXTURE_PAPER_TITLE,
	fixtureTextFor,
	franceSubmitsPaper,
	introducePaper,
	notificationsOf,
	paperLinkPath,
	startPaper,
	storedPaper,
	storedPaperSeats,
	storedVersions,
	submitPaper,
	trySubmittingPaper,
	voteOn,
	writePaper,
	type PaperCommittee,
	type PaperKind
} from './committee-paper-fixtures';

// Crisis committees, docs/committee-papers.md step 9 (sections 3, 4, 6 and
// 8): the four kinds a crisis committee writes, the three of them a character
// sends straight to the crisis staff, who may read each at every stage, the
// committee directive that goes through the dais and a vote first, the crisis
// staff's answer, and the one line of news in front of the room.
//
// Everything a person does goes through their own client, so a test only
// passes if the functions and policies let that person do it. As in
// committee-papers.test.ts, a refused select or update comes back empty, so
// what was stored is read back past Row Level Security (storedPaper and
// storedCrisisUpdate), and a refused function call is expected by its code
// and its words, which are what the page shows the person who pressed.
//
// The people: France and Germany play characters. The crisis staff hold
// answer_directives and nothing else. The Chair preset holds it too, so the
// room's chair answers as well, and the organiser holds every permission. The
// dais member holds run_room alone: the dais without the crisis staff's power.
// Every test makes its own committee.
//
// Behind the functions a person presses, which the describe titles name:
//
//   * `committee_offers_paper_kind` says which kinds a committee writes: the
//     four crisis kinds in a crisis committee, and working papers and draft
//     resolutions only once the organiser allows them there. `start_paper`
//     asks it before it starts a paper;
//   * `submit_paper` sends a joint or personal directive or a press release
//     to the crisis staff, and `approve_paper` refuses those three, because
//     the dais never numbers them;
//   * `may_read_paper` keeps those three kinds to their authors and the
//     crisis staff, until a press release is published to the room;
//   * `answer_directive` is the crisis staff's answer: a directive carried
//     out or refused, a press release published or refused, with words for
//     the authors, who are told;
//   * `send_crisis_update` puts one line from the crisis staff in front of
//     the room until the next one, and `protect_committee_state_crisis_update`
//     (the trigger `committee_state_protect_crisis_update`) keeps everybody
//     else, the people who run the room included, from writing it directly.

type PaperStatus = Database['public']['Enums']['paper_status'];

/** The kinds a character sends straight to the crisis staff, with no dais in between. */
const SENT_KINDS = ['joint_directive', 'personal_directive', 'press_release'] as const;
type SentKind = (typeof SENT_KINDS)[number];

/** The kinds the crisis staff answer: the committee's own directive, and the three sent to them. */
type CrisisKind = 'committee_directive' | SentKind;
const CRISIS_KINDS: CrisisKind[] = ['committee_directive', ...SENT_KINDS];

/** How a test name says each kind. */
const KIND_NAMES: Record<PaperKind, string> = {
	working_paper: 'working paper',
	draft_resolution: 'draft resolution',
	committee_directive: 'committee directive',
	joint_directive: 'joint directive',
	personal_directive: 'personal directive',
	press_release: 'press release'
};

/**
 * The crisis staff's words, with the spaces around them that
 * answer_directive trims. Only spaces, because btrim takes off nothing else.
 */
const ANSWER = '  The fleet sails at dawn.  ';
const KEPT_ANSWER = 'The fleet sails at dawn.';

/** The room with no crisis update in front of it. */
const NO_CRISIS_UPDATE = { crisis_update: null, crisis_update_at: null };

/** Every answer the crisis staff can give, and how the notification to the authors says it. */
const ANSWERS: { kind: CrisisKind; outcome: PaperStatus; said: string }[] = [
	{ kind: 'committee_directive', outcome: 'carried_out', said: 'was carried out' },
	{ kind: 'committee_directive', outcome: 'refused', said: 'was refused' },
	{ kind: 'joint_directive', outcome: 'carried_out', said: 'was carried out' },
	{ kind: 'joint_directive', outcome: 'refused', said: 'was refused' },
	{ kind: 'personal_directive', outcome: 'carried_out', said: 'was carried out' },
	{ kind: 'personal_directive', outcome: 'refused', said: 'was refused' },
	{ kind: 'press_release', outcome: 'published', said: 'was published' },
	{ kind: 'press_release', outcome: 'refused', said: 'was refused' }
];

/** Asks start_paper for a paper of this kind as `author`, and answers what it answered. */
function tryStartingPaper(author: SignedInClient, committeeId: string, kind: PaperKind) {
	return author.supabase.rpc('start_paper', {
		committee_id: committeeId,
		kind,
		title: FIXTURE_PAPER_TITLE,
		topic: null,
		source_paper_ids: []
	});
}

/** Adds the delegate in `seatId` to the paper's authors, as `author`. */
async function addAuthor(author: SignedInClient, paperId: string, seatId: string): Promise<void> {
	const { error } = await author.supabase.rpc('add_paper_author', {
		paper_id: paperId,
		seat_id: seatId
	});

	if (error) throw new Error(`Could not add the fixture author: ${error.message}`);
}

/**
 * A paper of this kind with France's fixture text, still being written. A
 * joint directive is written by two characters or more, so Germany joins it
 * as its second author.
 */
async function franceWritesCrisisPaper(
	committee: PaperCommittee,
	kind: PaperKind
): Promise<string> {
	const paperId = await startPaper(committee.france, committee.committeeId, kind);
	await writePaper(committee.france, paperId, fixtureTextFor(kind));

	if (kind === 'joint_directive') {
		await addAuthor(committee.france, paperId, committee.germany.seatId);
	}

	return paperId;
}

/** A joint or personal directive or a press release France wrote and sent to the crisis staff. */
async function franceSendsCrisisPaper(committee: PaperCommittee, kind: SentKind): Promise<string> {
	const paperId = await franceWritesCrisisPaper(committee, kind);
	await submitPaper(committee.france, paperId);

	return paperId;
}

/** A committee directive of France's that the committee voted for, so it waits for the crisis staff. */
async function committeePassesDirective(committee: PaperCommittee): Promise<string> {
	const paperId = await franceSubmitsPaper(committee, 'committee_directive');
	await voteOn(committee, { paperId }, true);

	return paperId;
}

/** A paper of this kind that waits for the crisis staff's answer. */
function paperWaitingForAnswer(committee: PaperCommittee, kind: CrisisKind): Promise<string> {
	return kind === 'committee_directive'
		? committeePassesDirective(committee)
		: franceSendsCrisisPaper(committee, kind);
}

/**
 * Answers a paper as `person`, and answers what answer_directive answered.
 * Leaving `answer` out sends no words at all.
 */
function answerDirective(
	person: SignedInClient,
	paperId: string,
	outcome: PaperStatus | null,
	answer?: string
) {
	return person.supabase.rpc('answer_directive', {
		paper_id: paperId,
		outcome,
		...(answer === undefined ? {} : { answer })
	});
}

/** Sends a crisis update as `person`, and answers what send_crisis_update answered. */
function sendCrisisUpdate(person: SignedInClient, committeeId: string, message: string) {
	return person.supabase.rpc('send_crisis_update', { committee_id: committeeId, message });
}

/** The crisis update in front of the room, read past Row Level Security. */
async function storedCrisisUpdate(
	committeeId: string
): Promise<{ crisis_update: string | null; crisis_update_at: string | null }> {
	const { data, error } = await createServiceRoleClient()
		.from('committee_state')
		.select('crisis_update, crisis_update_at')
		.eq('committee_id', committeeId)
		.single();

	if (error || !data) throw new Error(`Could not read the stored room: ${error?.message}`);

	return data;
}

/** What somebody has been told of one kind, oldest first. */
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

/** What whoReads answers when only the readers named here can open the paper. */
function onlyThese(
	readers: Record<string, SignedInClient>,
	...names: string[]
): Record<string, boolean> {
	return Object.fromEntries(Object.keys(readers).map((name) => [name, names.includes(name)]));
}

/**
 * Everybody in and around the room, by the names the reading tests give
 * them: three delegates, the crisis staff, the chair, the organiser, the
 * dais member who does not answer directives, and a volunteer, who is on the
 * team with no permission at all.
 */
async function everybodyAround(committee: PaperCommittee): Promise<Record<string, SignedInClient>> {
	const italy = await addSeatedDelegate(committee, 'Italy', 'IT');
	const crisisStaff = await addCrisisStaff(committee);
	const daisMember = await addDaisMember(committee);
	const volunteer = await addVolunteer(committee);

	return {
		france: committee.france,
		germany: committee.germany,
		italy,
		crisisStaff,
		chair: committee.chair,
		// The fixture itself is signed in as the organiser.
		organiser: committee,
		daisMember,
		volunteer
	};
}

/** A delegate seated in another committee of the same conference. */
async function delegateOfAnotherCommittee(committee: PaperCommittee): Promise<SignedInClient> {
	const generalAssemblyId = await addCommittee(
		committee.supabase,
		committee.conferenceId,
		'General Assembly'
	);
	const seatId = await addSeat(committee.supabase, generalAssemblyId, 'Brazil', 'BR');
	const brazil = await createSignedInClient('Delegate of Brazil');
	await giveSeatTo(committee.supabase, seatId, brazil.userId);

	return brazil;
}

/** The chair of another committee of the same conference, whose Chair preset reaches only there. */
async function chairOfAnotherCommittee(committee: PaperCommittee): Promise<SignedInClient> {
	const generalAssemblyId = await addCommittee(
		committee.supabase,
		committee.conferenceId,
		'General Assembly'
	);
	const otherChair = await createSignedInClient('Chair of the General Assembly');
	await addChair(committee.supabase, generalAssemblyId, otherChair.userId);

	return otherChair;
}

describe('the kinds a crisis committee writes (committee_offers_paper_kind)', () => {
	it('are the four crisis kinds, without working papers or draft resolutions', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });

		for (const kind of CRISIS_KINDS) {
			const paperId = await startPaper(committee.france, committee.committeeId, kind);

			expect((await storedPaper(paperId)).kind).toBe(kind);
		}

		for (const kind of ['working_paper', 'draft_resolution'] as const) {
			await expectRefusal(
				tryStartingPaper(committee.france, committee.committeeId, kind),
				'22023',
				'This committee does not write that kind of paper.'
			);
		}
	});

	it('include working papers and draft resolutions once the organiser allows them', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		await expectSuccess(
			committee.supabase
				.from('committees')
				.update({ crisis_allows_resolutions: true })
				.eq('id', committee.committeeId)
		);
		const everyKind: PaperKind[] = ['working_paper', 'draft_resolution', ...CRISIS_KINDS];

		for (const kind of everyKind) {
			const paperId = await startPaper(committee.france, committee.committeeId, kind);

			expect((await storedPaper(paperId)).kind).toBe(kind);

			// A seat has at most five papers it started still being written
			// (security review, L53), so each one is deleted once seen, as its
			// lead may while it is unsent.
			await expectSuccess(
				committee.france.supabase.from('committee_papers').delete().eq('id', paperId)
			);
		}
	});
});

describe('sending a paper to the crisis staff (submit_paper)', () => {
	it('sends a joint directive once a second character writes it too, and freezes its text', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const paperId = await startPaper(committee.france, committee.committeeId, 'joint_directive');
		await writePaper(committee.france, paperId, { body: FIXTURE_BODY });

		await expectRefusal(
			trySubmittingPaper(committee.france, paperId),
			'22023',
			'A joint directive needs at least two authors.'
		);
		expect((await storedPaper(paperId)).status).toBe('writing');

		await addAuthor(committee.france, paperId, committee.germany.seatId);
		await expectSuccess(trySubmittingPaper(committee.germany, paperId));

		const paper = await storedPaper(paperId);
		// The dais never numbers what is sent to the crisis staff.
		expect(paper).toMatchObject({ status: 'submitted', topic_number: null, sequence: null });
		expect(paper.submitted_at).not.toBeNull();
		expect(await storedVersions(paperId)).toEqual([
			{ version_number: 1, content: { markdown: FIXTURE_BODY }, amendment_id: null }
		]);
	});

	it('sends a personal directive from its one author', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const paperId = await startPaper(committee.france, committee.committeeId, 'personal_directive');
		await writePaper(committee.france, paperId, { body: FIXTURE_BODY });

		await expectRefusal(
			committee.france.supabase.rpc('add_paper_author', {
				paper_id: paperId,
				seat_id: committee.germany.seatId
			}),
			'22023',
			'A personal directive has one author.'
		);
		expect(await storedPaperSeats(paperId)).toEqual([
			{ seat_id: committee.france.seatId, role: 'author' }
		]);

		await expectSuccess(trySubmittingPaper(committee.france, paperId));
		expect((await storedPaper(paperId)).status).toBe('submitted');
	});

	it('sends a press release only once it has words in it', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const paperId = await startPaper(committee.france, committee.committeeId, 'press_release');

		await expectRefusal(
			trySubmittingPaper(committee.france, paperId),
			'22023',
			'Write the paper before submitting it.'
		);

		await writePaper(committee.france, paperId, { body: ' \n ' });
		await expectRefusal(
			trySubmittingPaper(committee.france, paperId),
			'22023',
			'Write the paper before submitting it.'
		);

		await writePaper(committee.france, paperId, { body: FIXTURE_BODY });
		await expectSuccess(trySubmittingPaper(committee.france, paperId));
		expect(await storedVersions(paperId)).toEqual([
			{ version_number: 1, content: { markdown: FIXTURE_BODY }, amendment_id: null }
		]);
	});
});

describe('reading a crisis paper (may_read_paper)', () => {
	for (const kind of SENT_KINDS) {
		it(`keeps a ${KIND_NAMES[kind]} to its authors while they write it, and to them and the crisis staff once sent`, async () => {
			const committee = await createPaperCommittee({ format: 'crisis' });
			const readers = await everybodyAround(committee);
			const authors = kind === 'joint_directive' ? ['france', 'germany'] : ['france'];
			const paperId = await franceWritesCrisisPaper(committee, kind);

			expect(await whoReads(paperId, readers)).toEqual(onlyThese(readers, ...authors));

			await submitPaper(committee.france, paperId);

			// The chair and the organiser read it as crisis staff, because they hold
			// answer_directives; the dais member, who runs the room without it, does not.
			expect(await whoReads(paperId, readers)).toEqual(
				onlyThese(readers, ...authors, 'crisisStaff', 'chair', 'organiser')
			);
		});
	}

	it('shows a published press release to the whole committee and the team, and to nobody outside them', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const insiders = await everybodyAround(committee);
		const readers = {
			...insiders,
			brazil: await delegateOfAnotherCommittee(committee),
			stranger: await createSignedInClient('Stranger')
		};
		const paperId = await franceSendsCrisisPaper(committee, 'press_release');

		await expectSuccess(answerDirective(insiders.crisisStaff, paperId, 'published', ANSWER));

		expect(await whoReads(paperId, readers)).toEqual(onlyThese(readers, ...Object.keys(insiders)));
	});

	it('keeps a refused press release and every answered directive to the authors and the crisis staff', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const readers = await everybodyAround(committee);
		const pressReleaseId = await franceSendsCrisisPaper(committee, 'press_release');
		const jointDirectiveId = await franceSendsCrisisPaper(committee, 'joint_directive');
		const personalDirectiveId = await franceSendsCrisisPaper(committee, 'personal_directive');
		const theCrisisStaff = ['crisisStaff', 'chair', 'organiser'];

		await expectSuccess(answerDirective(readers.crisisStaff, pressReleaseId, 'refused'));
		await expectSuccess(answerDirective(readers.crisisStaff, jointDirectiveId, 'carried_out'));
		await expectSuccess(answerDirective(readers.crisisStaff, personalDirectiveId, 'refused'));

		expect(await whoReads(pressReleaseId, readers)).toEqual(
			onlyThese(readers, 'france', ...theCrisisStaff)
		);
		expect(await whoReads(jointDirectiveId, readers)).toEqual(
			onlyThese(readers, 'france', 'germany', ...theCrisisStaff)
		);
		expect(await whoReads(personalDirectiveId, readers)).toEqual(
			onlyThese(readers, 'france', ...theCrisisStaff)
		);
	});

	it('shows a committee directive to the dais once submitted, and to the committee and the team once introduced', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const readers = await everybodyAround(committee);
		const paperId = await franceSubmitsPaper(committee, 'committee_directive', 'submitted');

		expect(await whoReads(paperId, readers)).toEqual(
			onlyThese(readers, 'france', 'chair', 'organiser', 'daisMember')
		);

		await approvePaper(committee.chair, paperId);
		await introducePaper(committee, paperId);

		expect(await whoReads(paperId, readers)).toEqual(onlyThese(readers, ...Object.keys(readers)));
	});
});

describe('a committee directive', () => {
	it('goes to the crisis staff only once the committee passes it', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const crisisStaff = await addCrisisStaff(committee);
		const paperId = await franceSubmitsPaper(committee, 'committee_directive', 'submitted');

		// Until it is introduced the crisis staff cannot open it, so to them it does not exist.
		await expectRefusal(
			answerDirective(crisisStaff, paperId, 'carried_out'),
			'P0002',
			'That paper does not exist.'
		);

		await approvePaper(committee.chair, paperId);
		await expectRefusal(
			answerDirective(crisisStaff, paperId, 'carried_out'),
			'P0002',
			'That paper does not exist.'
		);

		await introducePaper(committee, paperId);
		await expectRefusal(
			answerDirective(crisisStaff, paperId, 'carried_out'),
			'22023',
			'This paper is not waiting for an answer.'
		);

		await voteOn(committee, { paperId }, true);
		expect(await storedPaper(paperId)).toMatchObject({
			status: 'passed',
			decided_by: committee.chair.userId
		});

		await expectRefusal(
			answerDirective(crisisStaff, paperId, 'published'),
			'22023',
			'A directive is carried out or refused.'
		);
		await expectSuccess(answerDirective(crisisStaff, paperId, 'carried_out', ANSWER));
		expect(await storedPaper(paperId)).toMatchObject({
			status: 'carried_out',
			answer_markdown: KEPT_ANSWER,
			decided_by: crisisStaff.userId
		});
	});

	it('is never answered once the committee votes it down', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const crisisStaff = await addCrisisStaff(committee);
		const paperId = await franceSubmitsPaper(committee, 'committee_directive');

		await voteOn(committee, { paperId }, false);
		expect((await storedPaper(paperId)).status).toBe('failed');

		await expectRefusal(
			answerDirective(crisisStaff, paperId, 'carried_out'),
			'22023',
			'This paper is not waiting for an answer.'
		);
	});
});

describe('answer_directive', () => {
	for (const { kind, outcome, said } of ANSWERS) {
		it(`marks a ${KIND_NAMES[kind]} ${outcome.replace('_', ' ')} with the answer, and tells its authors`, async () => {
			const committee = await createPaperCommittee({ format: 'crisis' });
			const crisisStaff = await addCrisisStaff(committee);
			const paperId = await paperWaitingForAnswer(committee, kind);
			const waiting = await storedPaper(paperId);

			await expectSuccess(answerDirective(crisisStaff, paperId, outcome, ANSWER));

			const answered = await storedPaper(paperId);
			expect(answered).toMatchObject({
				status: outcome,
				answer_markdown: KEPT_ANSWER,
				decided_by: crisisStaff.userId
			});
			expect(answered.decided_at).not.toBeNull();
			expect(answered.decided_at).not.toBe(waiting.decided_at);

			// The dais numbered the committee directive. The papers sent straight to
			// the crisis staff never have a number, so their title names them.
			const label =
				kind === 'committee_directive' ? 'Committee directive 1.1' : `“${FIXTURE_PAPER_TITLE}”`;
			const told = [
				{
					kind: 'directive_answered',
					title: `${label} ${said}`,
					link_path: paperLinkPath(committee, paperId)
				}
			];

			expect(await notificationsOfKind(committee.france.userId, 'directive_answered')).toEqual(
				told
			);
			expect(await notificationsOfKind(committee.germany.userId, 'directive_answered')).toEqual(
				kind === 'joint_directive' ? told : []
			);
			expect(await notificationsOfKind(crisisStaff.userId, 'directive_answered')).toEqual([]);
		});
	}

	it('keeps no answer when the crisis staff leave it blank', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const crisisStaff = await addCrisisStaff(committee);
		const blankAnswerId = await franceSendsCrisisPaper(committee, 'personal_directive');
		const noAnswerId = await franceSendsCrisisPaper(committee, 'personal_directive');

		await expectSuccess(answerDirective(crisisStaff, blankAnswerId, 'carried_out', '  \n\t  '));
		await expectSuccess(answerDirective(crisisStaff, noAnswerId, 'refused'));

		expect(await storedPaper(blankAnswerId)).toMatchObject({
			status: 'carried_out',
			answer_markdown: null
		});
		expect(await storedPaper(noAnswerId)).toMatchObject({
			status: 'refused',
			answer_markdown: null
		});
	});

	it('takes an answer of at most 100,000 characters, counted without the spaces around it', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const crisisStaff = await addCrisisStaff(committee);
		const paperId = await franceSendsCrisisPaper(committee, 'personal_directive');

		await expectRefusal(
			answerDirective(crisisStaff, paperId, 'carried_out', 'a'.repeat(100_001)),
			'22023',
			'An answer is at most 100,000 characters.'
		);
		expect((await storedPaper(paperId)).status).toBe('submitted');

		await expectSuccess(
			answerDirective(crisisStaff, paperId, 'carried_out', ` ${'a'.repeat(100_000)} `)
		);
		expect((await storedPaper(paperId)).answer_markdown).toHaveLength(100_000);
	});

	it('is pressed by the crisis staff alone, the Chair preset among them', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const daisMember = await addDaisMember(committee);
		const volunteer = await addVolunteer(committee);
		// A committee directive the committee passed, which every one of these
		// people can open, so what refuses them is the permission and not the paper.
		const paperId = await committeePassesDirective(committee);

		for (const person of [committee.france, committee.germany, daisMember, volunteer]) {
			await expectRefusal(
				answerDirective(person, paperId, 'carried_out'),
				'42501',
				'Only the crisis staff answer directives.'
			);
		}

		await expectSuccess(answerDirective(committee.chair, paperId, 'carried_out'));
		expect(await storedPaper(paperId)).toMatchObject({
			status: 'carried_out',
			decided_by: committee.chair.userId
		});
	});

	it('answers only a paper the person answering can open', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const crisisStaff = await addCrisisStaff(committee);
		const daisMember = await addDaisMember(committee);
		const unsentId = await franceWritesCrisisPaper(committee, 'personal_directive');
		const sentId = await franceSendsCrisisPaper(committee, 'joint_directive');

		await expectRefusal(
			answerDirective(crisisStaff, unsentId, 'carried_out'),
			'P0002',
			'That paper does not exist.'
		);
		await expectRefusal(
			answerDirective(daisMember, sentId, 'carried_out'),
			'P0002',
			'That paper does not exist.'
		);
		await expectRefusal(
			answerDirective(crisisStaff, crypto.randomUUID(), 'carried_out'),
			'P0002',
			'That paper does not exist.'
		);

		expect((await storedPaper(unsentId)).status).toBe('writing');
		expect((await storedPaper(sentId)).status).toBe('submitted');
	});

	it('answers only directives and press releases', async () => {
		const committee = await createPaperCommittee();
		const draftResolutionId = await franceSubmitsPaper(committee, 'draft_resolution', 'submitted');
		const workingPaperId = await franceSubmitsPaper(committee, 'working_paper', 'submitted');

		// The chair can open both and answers directives, so only the kind is wrong.
		for (const paperId of [draftResolutionId, workingPaperId]) {
			await expectRefusal(
				answerDirective(committee.chair, paperId, 'carried_out'),
				'22023',
				'Only directives and press releases are answered.'
			);
			expect((await storedPaper(paperId)).status).toBe('submitted');
		}
	});

	it('answers a paper once, while it waits for an answer', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const crisisStaff = await addCrisisStaff(committee);
		const answeredId = await franceSendsCrisisPaper(committee, 'joint_directive');
		const withdrawnId = await franceSendsCrisisPaper(committee, 'press_release');

		await expectSuccess(answerDirective(crisisStaff, answeredId, 'carried_out'));
		await expectSuccess(committee.france.supabase.rpc('withdraw_paper', { paper_id: withdrawnId }));

		await expectRefusal(
			answerDirective(crisisStaff, answeredId, 'refused'),
			'22023',
			'This paper is not waiting for an answer.'
		);
		await expectRefusal(
			answerDirective(crisisStaff, withdrawnId, 'published'),
			'22023',
			'This paper is not waiting for an answer.'
		);

		expect((await storedPaper(answeredId)).status).toBe('carried_out');
		expect((await storedPaper(withdrawnId)).status).toBe('withdrawn');
	});

	it('carries out or refuses a directive, and publishes or refuses a press release', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const crisisStaff = await addCrisisStaff(committee);

		for (const kind of ['joint_directive', 'personal_directive'] as const) {
			const paperId = await franceSendsCrisisPaper(committee, kind);

			for (const outcome of ['published', 'passed', 'submitted', null] as const) {
				await expectRefusal(
					answerDirective(crisisStaff, paperId, outcome),
					'22023',
					'A directive is carried out or refused.'
				);
			}

			expect((await storedPaper(paperId)).status).toBe('submitted');
		}

		const pressReleaseId = await franceSendsCrisisPaper(committee, 'press_release');

		for (const outcome of ['carried_out', 'passed', null] as const) {
			await expectRefusal(
				answerDirective(crisisStaff, pressReleaseId, outcome),
				'22023',
				'A press release is published or refused.'
			);
		}

		expect((await storedPaper(pressReleaseId)).status).toBe('submitted');
	});
});

describe('send_crisis_update', () => {
	it('puts one line from the crisis staff in front of the room until the next, and a blank one takes it down', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const crisisStaff = await addCrisisStaff(committee);

		await expectSuccess(
			sendCrisisUpdate(crisisStaff, committee.committeeId, '  The fleet has left port.  ')
		);
		const first = await storedCrisisUpdate(committee.committeeId);
		expect(first.crisis_update).toBe('The fleet has left port.');
		expect(first.crisis_update_at).not.toBeNull();

		// It is part of the room's state, which every delegate of the room reads.
		const { data: room } = await committee.france.supabase
			.from('committee_state')
			.select('crisis_update')
			.eq('committee_id', committee.committeeId);
		expect(room).toEqual([{ crisis_update: 'The fleet has left port.' }]);

		await expectSuccess(
			sendCrisisUpdate(crisisStaff, committee.committeeId, 'The fleet has sunk.')
		);
		const second = await storedCrisisUpdate(committee.committeeId);
		expect(second.crisis_update).toBe('The fleet has sunk.');
		expect(second.crisis_update_at).not.toBe(first.crisis_update_at);

		await expectSuccess(sendCrisisUpdate(crisisStaff, committee.committeeId, ' \n '));
		expect(await storedCrisisUpdate(committee.committeeId)).toEqual(NO_CRISIS_UPDATE);
	});

	it('takes an update of at most 1,000 characters, counted without the spaces around it', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const crisisStaff = await addCrisisStaff(committee);

		await expectRefusal(
			sendCrisisUpdate(crisisStaff, committee.committeeId, 'a'.repeat(1001)),
			'22023',
			'A crisis update is at most 1,000 characters.'
		);
		expect(await storedCrisisUpdate(committee.committeeId)).toEqual(NO_CRISIS_UPDATE);

		await expectSuccess(
			sendCrisisUpdate(crisisStaff, committee.committeeId, ` ${'a'.repeat(1000)} `)
		);
		expect((await storedCrisisUpdate(committee.committeeId)).crisis_update).toHaveLength(1000);
	});

	it('is for a crisis committee only', async () => {
		const committee = await createPaperCommittee();
		const crisisStaff = await addCrisisStaff(committee);

		await expectRefusal(
			sendCrisisUpdate(crisisStaff, committee.committeeId, 'The fleet has left port.'),
			'22023',
			'Only a crisis committee has crisis updates.'
		);
		expect(await storedCrisisUpdate(committee.committeeId)).toEqual(NO_CRISIS_UPDATE);
	});

	it('is sent by the crisis staff alone, the Chair preset among them', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const crisisStaff = await addCrisisStaff(committee);
		const daisMember = await addDaisMember(committee);
		const otherChair = await chairOfAnotherCommittee(committee);

		for (const person of [committee.france, daisMember, otherChair]) {
			await expectRefusal(
				sendCrisisUpdate(person, committee.committeeId, 'The fleet has left port.'),
				'42501',
				'Only the crisis staff send crisis updates.'
			);
		}

		// A committee that does not exist is refused in the same words, so the
		// refusal tells nobody which committees there are.
		await expectRefusal(
			sendCrisisUpdate(crisisStaff, crypto.randomUUID(), 'The fleet has left port.'),
			'42501',
			'Only the crisis staff send crisis updates.'
		);
		expect(await storedCrisisUpdate(committee.committeeId)).toEqual(NO_CRISIS_UPDATE);

		await expectSuccess(
			sendCrisisUpdate(committee.chair, committee.committeeId, 'The fleet has left port.')
		);
		expect((await storedCrisisUpdate(committee.committeeId)).crisis_update).toBe(
			'The fleet has left port.'
		);
	});
});

// The room's update policy lets anybody who runs the room write every column
// of committee_state, which is how the timer and the speakers' list move. The
// trigger committee_state_protect_crisis_update takes the two crisis update
// columns out of that, so the only way to change them is send_crisis_update,
// which asks for answer_directives.
describe('the crisis update on the room (protect_committee_state_crisis_update)', () => {
	it('is changed only through send_crisis_update, even by the people who run the room', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const crisisStaff = await addCrisisStaff(committee);
		const daisMember = await addDaisMember(committee);
		await expectSuccess(
			sendCrisisUpdate(crisisStaff, committee.committeeId, 'The fleet has left port.')
		);
		const sent = await storedCrisisUpdate(committee.committeeId);
		const directWrites = [
			{ crisis_update: 'The fleet has sunk.', crisis_update_at: new Date().toISOString() },
			{ crisis_update: null, crisis_update_at: null },
			{ crisis_update: 'The fleet has sunk.' }
		];

		// The chair holds answer_directives and the organiser every permission,
		// and still neither writes the columns directly. The fixture itself is
		// signed in as the organiser.
		for (const person of [daisMember, committee.chair, committee]) {
			for (const write of directWrites) {
				await expectRefusal(
					person.supabase
						.from('committee_state')
						.update(write)
						.eq('committee_id', committee.committeeId),
					'42501',
					'Only the crisis staff send crisis updates.'
				);
			}
		}

		expect(await storedCrisisUpdate(committee.committeeId)).toEqual(sent);

		// The rest of the room is still theirs to write. The timer starts unset,
		// so 90 seconds is a change.
		expect(
			await daisMember.supabase
				.from('committee_state')
				.update({ timer_total_seconds: 90 })
				.eq('committee_id', committee.committeeId)
				.select('timer_total_seconds, crisis_update')
		).toMatchObject({
			error: null,
			data: [{ timer_total_seconds: 90, crisis_update: 'The fleet has left port.' }]
		});
	});
});

describe('the dais and the crisis kinds (approve_paper)', () => {
	it('never approves a joint or personal directive or a press release', async () => {
		const committee = await createPaperCommittee({ format: 'crisis' });
		const daisMember = await addDaisMember(committee);

		for (const kind of SENT_KINDS) {
			const paperId = await franceSendsCrisisPaper(committee, kind);

			// The chair answers directives too, so they can open the paper and are
			// told why not; the dais member cannot open it at all.
			await expectRefusal(
				committee.chair.supabase.rpc('approve_paper', { paper_id: paperId }),
				'22023',
				'The crisis staff answer this kind of paper; the dais does not approve it.'
			);
			await expectRefusal(
				daisMember.supabase.rpc('approve_paper', { paper_id: paperId }),
				'P0002',
				'That paper does not exist.'
			);
			expect(await storedPaper(paperId)).toMatchObject({
				status: 'submitted',
				topic_number: null,
				sequence: null
			});
		}
	});
});
