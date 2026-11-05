import { describe, expect, it } from 'vitest';
import { createServiceRoleClient, createVisitorClient } from './supabase-test-client';

// The walkthrough that supabase/walkthrough-seed.sql adds for testing the app
// by hand: one conference in every phase and an account for every role. Every
// `pnpm db:reset` loads that file, so these tests prove after each reset that
// it loaded whole, that each conference is in the phase its name claims today,
// and that the accounts supabase/README.md lists can sign in.
//
// Like demo-conference.test.ts, they read with the service-role client, which
// Row Level Security does not limit, because they only ask whether the seed
// wrote the rows it promises, not who may see them.

/** The walkthrough conferences' fixed ids, from walkthrough-seed.sql. */
const CONFERENCE_IDS = {
	draft: 'f2000000-0000-4000-8000-000000000001',
	openingSoon: 'f2000000-0000-4000-8000-000000000002',
	applicationsOpen: 'f2000000-0000-4000-8000-000000000003',
	aboutToStart: 'f2000000-0000-4000-8000-000000000004',
	runningToday: 'f2000000-0000-4000-8000-000000000005'
};

/** The id of the Security Council session that is in progress. */
const LIVE_SESSION_ID = 'fb000000-0000-4000-8000-000000000051';

/** The Security Council's practice session the day before, ended (T186). */
const PRACTICE_SESSION_ID = 'fb000000-0000-4000-8000-000000000151';

/** The Security Council of "running today". */
const SECURITY_COUNCIL_ID = 'f3000000-0000-4000-8000-000000000051';

/** Harbour View College, the accepted school delegation of "about to start" (T186). */
const HARBOUR_VIEW_ID = 'f6000000-0000-4000-8000-000000000104';

/** The password every walkthrough account shares, written down in the seed. */
const WALKTHROUGH_PASSWORD = 'sample-password-123';

/** The accounts supabase/README.md's walkthrough table lists, one per role. */
const WALKTHROUGH_ACCOUNT_EMAILS = [
	'walk.organiser@example.test',
	'walk.org.admin@example.test',
	'walk.organiser.upcoming@example.test',
	'walk.usg.upcoming@example.test',
	'walk.finance.upcoming@example.test',
	'walk.desk.upcoming@example.test',
	'walk.chair.live@example.test',
	'walk.chair.upcoming@example.test',
	'walk.chair.thimun@example.test',
	'walk.chair.crisis@example.test',
	'walk.crisis.staff@example.test',
	'walk.volunteer.live@example.test',
	'walk.head.open@example.test',
	'walk.head.submitted@example.test',
	'walk.head.upcoming@example.test',
	'walk.delegate.live@example.test',
	'walk.delegate.upcoming@example.test',
	'walk.applicant.open@example.test',
	'walk.newcomer@example.test'
];

/** Counts how many of `values` are equal to `wanted`. */
function countOf(values: string[], wanted: string): number {
	return values.filter((value) => value === wanted).length;
}

/** Reads one walkthrough conference's name, status, dates and application window. */
async function readConference(conferenceId: string) {
	const supabase = createServiceRoleClient();

	const { data, error } = await supabase
		.from('conferences')
		.select('name, status, start_date, end_date, applications_open_at, applications_close_at')
		.eq('id', conferenceId)
		.single();

	expect(error).toBeNull();
	return data;
}

describe('the walkthrough seed: each conference is in its phase today', () => {
	// Days are compared as "YYYY-MM-DD" text, which sorts like the dates
	// themselves, and moments as milliseconds.
	const today = new Date().toISOString().slice(0, 10);
	const now = Date.now();

	it('has a draft that is not published', async () => {
		const conference = await readConference(CONFERENCE_IDS.draft);

		expect(conference?.name).toBe('Northbridge MUN (draft)');
		expect(conference?.status).toBe('draft');
	});

	it('has a published conference whose applications open in a few days', async () => {
		const conference = await readConference(CONFERENCE_IDS.openingSoon);
		const opensAt = Date.parse(String(conference?.applications_open_at));

		expect(conference?.name).toBe('Northbridge MUN (opening soon)');
		expect(conference?.status).toBe('published');
		expect(opensAt).toBeGreaterThan(now);
		expect(opensAt - now).toBeLessThan(7 * 24 * 60 * 60 * 1000);
	});

	it('has a published conference taking applications now', async () => {
		const conference = await readConference(CONFERENCE_IDS.applicationsOpen);

		expect(conference?.name).toBe('Northbridge MUN (applications open)');
		expect(conference?.status).toBe('published');
		expect(Date.parse(String(conference?.applications_open_at))).toBeLessThan(now);
		expect(Date.parse(String(conference?.applications_close_at))).toBeGreaterThan(now);
	});

	it('has a published conference with applications closed that starts in a few days', async () => {
		const conference = await readConference(CONFERENCE_IDS.aboutToStart);

		expect(conference?.name).toBe('Northbridge MUN (about to start)');
		expect(conference?.status).toBe('published');
		expect(Date.parse(String(conference?.applications_close_at))).toBeLessThan(now);
		expect(String(conference?.start_date) > today).toBe(true);
	});

	it('has a published conference that is running today', async () => {
		const conference = await readConference(CONFERENCE_IDS.runningToday);

		expect(conference?.name).toBe('Northbridge MUN (running today)');
		expect(conference?.status).toBe('published');
		expect(String(conference?.start_date) <= today).toBe(true);
		expect(String(conference?.end_date) >= today).toBe(true);
	});
});

describe('the walkthrough seed: what each conference holds', () => {
	it('has applications open with an application in every status and a delegation forming', async () => {
		const supabase = createServiceRoleClient();

		const { data: applications } = await supabase
			.from('applications')
			.select('status')
			.eq('conference_id', CONFERENCE_IDS.applicationsOpen);
		const statuses = (applications ?? []).map((application) => application.status).sort();

		// St Aidan's Academy, the delegation still forming (T123).
		const { data: delegation } = await supabase
			.from('delegations')
			.select('status, delegation_members(role)')
			.eq('id', 'f6000000-0000-4000-8000-000000000101')
			.single();

		expect(statuses).toEqual([
			'accepted',
			'draft',
			'rejected',
			'submitted',
			'submitted',
			'submitted',
			'waitlisted',
			'withdrawn'
		]);
		expect(delegation?.status).toBe('draft');
		expect(delegation?.delegation_members).toHaveLength(3);
	});

	it('has applications open with a delegation forming, one waiting for a decision and one turned down', async () => {
		const supabase = createServiceRoleClient();

		const { data: delegations } = await supabase
			.from('delegations')
			.select('status, decision_note, delegation_members(role)')
			.eq('conference_id', CONFERENCE_IDS.applicationsOpen)
			.order('id');

		expect(delegations?.map((delegation) => delegation.status)).toEqual([
			'draft',
			'submitted',
			'rejected'
		]);
		expect(delegations?.[1].delegation_members).toHaveLength(2);
		expect(delegations?.[2].decision_note).not.toBeNull();
	});

	it('has applications open asking one optional question of every type, and answers to read', async () => {
		const supabase = createServiceRoleClient();

		const { data: questions } = await supabase
			.from('application_questions')
			.select('id, type, is_required')
			.eq('conference_id', CONFERENCE_IDS.applicationsOpen);
		const { data: applications } = await supabase
			.from('applications')
			.select('answers')
			.eq('conference_id', CONFERENCE_IDS.applicationsOpen);
		const questionIds = (questions ?? []).map((question) => question.id);
		const answeredIds = (applications ?? []).flatMap((application) =>
			Object.keys(application.answers as Record<string, unknown>)
		);

		// No required question, because the browser tests that apply here fill in
		// only what is required (T186, "Must not").
		expect((questions ?? []).map((question) => question.type).sort()).toEqual([
			'checkbox',
			'long_text',
			'multiple_choice',
			'short_text',
			'single_choice'
		]);
		expect((questions ?? []).every((question) => !question.is_required)).toBe(true);
		expect(answeredIds.length).toBeGreaterThan(0);
		expect(answeredIds.every((id) => questionIds.includes(id))).toBe(true);
	});

	it('has an applicant younger than the minimum age of applications open', async () => {
		const supabase = createServiceRoleClient();

		// Ethan Brooks, whose submitted application draws the age warning (T186).
		const { data: details } = await supabase
			.from('profile_details')
			.select('date_of_birth')
			.eq('user_id', 'f5000000-0000-4000-8000-000000000047')
			.single();
		const { data: conference } = await supabase
			.from('conferences')
			.select('start_date, min_age')
			.eq('id', CONFERENCE_IDS.applicationsOpen)
			.single();
		const bornOn = new Date(String(details?.date_of_birth));
		const startsOn = new Date(String(conference?.start_date));
		const birthdayThatYear = new Date(bornOn);
		birthdayThatYear.setUTCFullYear(startsOn.getUTCFullYear());
		const ageAtStart =
			startsOn.getUTCFullYear() - bornOn.getUTCFullYear() - (birthdayThatYear > startsOn ? 1 : 0);

		expect(ageAtStart).toBeLessThan(Number(conference?.min_age));
	});

	it('has an observer seat that applicants cannot see', async () => {
		const supabase = createServiceRoleClient();
		const visitor = createVisitorClient();

		const { data: seat } = await supabase
			.from('seats')
			.select('kind, is_available')
			.eq('id', 'f9000000-0000-4000-8000-000000000307')
			.single();
		// `public_seats` is what the application form reads.
		const { data: publicSeats } = await visitor
			.from('public_seats')
			.select('id')
			.eq('id', 'f9000000-0000-4000-8000-000000000307');

		expect(seat).toEqual({ kind: 'observer', is_available: false });
		expect(publicSeats).toEqual([]);
	});

	it('has about to start with seats taken and invoices paid, unpaid, waived and void', async () => {
		const supabase = createServiceRoleClient();

		const { data: seats } = await supabase
			.from('seats')
			.select('user_id, committee:committees!inner(conference_id)')
			.eq('committee.conference_id', CONFERENCE_IDS.aboutToStart);
		const takenSeats = (seats ?? []).filter((seat) => seat.user_id !== null);

		const { data: invoices } = await supabase
			.from('invoices')
			.select('status')
			.eq('conference_id', CONFERENCE_IDS.aboutToStart);
		const invoiceStatuses = (invoices ?? []).map((invoice) => invoice.status);

		expect(seats).toHaveLength(11);
		expect(takenSeats).toHaveLength(9);
		expect(countOf(invoiceStatuses, 'paid')).toBe(4);
		expect(countOf(invoiceStatuses, 'unpaid')).toBe(3);
		expect(countOf(invoiceStatuses, 'waived')).toBe(1);
		expect(countOf(invoiceStatuses, 'void')).toBe(1);
	});

	it('has about to start with a school delegation given fewer seats than it asked for', async () => {
		const supabase = createServiceRoleClient();

		const { data: delegation } = await supabase
			.from('delegations')
			.select('status, requested_seats, delegation_members(role)')
			.eq('id', HARBOUR_VIEW_ID)
			.single();
		const { data: seats } = await supabase
			.from('seats')
			.select('user_id')
			.eq('delegation_id', HARBOUR_VIEW_ID);
		const { data: invoices } = await supabase
			.from('invoices')
			.select('status, quantity')
			.eq('delegation_id', HARBOUR_VIEW_ID)
			.order('number');
		// Its shared paper, on the first seated member's seat.
		const { data: sharedDraft } = await supabase
			.from('position_paper_drafts')
			.select('updated_by')
			.eq('seat_id', 'f9000000-0000-4000-8000-000000000425')
			.single();

		expect(delegation?.status).toBe('accepted');
		expect(delegation?.requested_seats).toBe(4);
		expect(delegation?.delegation_members).toHaveLength(4);
		expect(seats).toHaveLength(3);
		expect((seats ?? []).filter((seat) => seat.user_id !== null)).toHaveLength(2);
		expect(invoices).toEqual([
			{ status: 'void', quantity: 4 },
			{ status: 'unpaid', quantity: 3 }
		]);
		// Written by Zoe, last changed by Andrew, the head.
		expect(sharedDraft?.updated_by).toBe('f5000000-0000-4000-8000-000000000081');
	});

	it('has about to start with an application left as a draft when applications closed', async () => {
		const supabase = createServiceRoleClient();

		const { data: applications } = await supabase
			.from('applications')
			.select('status')
			.eq('conference_id', CONFERENCE_IDS.aboutToStart)
			.eq('status', 'draft');

		expect(applications).toHaveLength(1);
	});

	it('has about to start with a schedule, announcements, guides and papers in every review state', async () => {
		const supabase = createServiceRoleClient();

		const { count: eventCount } = await supabase
			.from('schedule_events')
			.select('id', { count: 'exact', head: true })
			.eq('conference_id', CONFERENCE_IDS.aboutToStart);
		const { count: announcementCount } = await supabase
			.from('announcements')
			.select('id', { count: 'exact', head: true })
			.eq('conference_id', CONFERENCE_IDS.aboutToStart);
		const { data: documents } = await supabase
			.from('documents')
			.select('kind, review_status')
			.eq('conference_id', CONFERENCE_IDS.aboutToStart);
		const kinds = (documents ?? []).map((document) => document.kind);
		const reviewStatuses = (documents ?? [])
			.filter((document) => document.kind === 'position_paper')
			.map((document) => String(document.review_status));

		expect(eventCount).toBe(6);
		expect(announcementCount).toBe(5);
		expect(countOf(kinds, 'background_guide')).toBe(2);
		expect(countOf(reviewStatuses, 'approved')).toBe(2);
		expect(countOf(reviewStatuses, 'changes_requested')).toBe(1);
		expect(countOf(reviewStatuses, 'submitted')).toBe(3);
	});

	it('has a stored file of the recorded size behind every uploaded walkthrough document', async () => {
		const supabase = createServiceRoleClient();

		// A paper written on MUNMeet has no file (T145), so only uploads are downloaded.
		const { data: documents } = await supabase
			.from('documents')
			.select('storage_path, file_size_bytes')
			.eq('conference_id', CONFERENCE_IDS.aboutToStart)
			.not('storage_path', 'is', null);

		expect(documents).toHaveLength(7);

		for (const document of documents ?? []) {
			if (document.storage_path === null) continue;

			const { data: file, error } = await supabase.storage
				.from('documents')
				.download(document.storage_path);

			expect(error, document.storage_path).toBeNull();
			expect(file?.size, document.storage_path).toBe(document.file_size_bytes);
		}
	});

	it('has a written position paper half done, as a draft only its delegate reads', async () => {
		const supabase = createServiceRoleClient();

		// Felix Schmidt's seat, Germany in DISEC, from walkthrough-seed.sql (T145).
		const { data: draft } = await supabase
			.from('position_paper_drafts')
			.select('body_markdown, updated_by')
			.eq('seat_id', 'f9000000-0000-4000-8000-000000000423')
			.single();
		const { data: seat } = await supabase
			.from('seats')
			.select('user_id')
			.eq('id', 'f9000000-0000-4000-8000-000000000423')
			.single();

		expect(draft?.body_markdown).toContain('## Small arms and light weapons');
		expect(draft?.updated_by).toBe(seat?.user_id);
	});

	it('has a written position paper awaiting review beside an uploaded one in the same committee', async () => {
		const supabase = createServiceRoleClient();

		// Mexico's paper and Japan's PDF, both in the Human Rights Council (T146).
		const { data: papers } = await supabase
			.from('documents')
			.select('id, storage_path, body_markdown, review_status')
			.in('id', ['fa000000-0000-4000-8000-000000000414', 'fa000000-0000-4000-8000-000000000413'])
			.order('id');

		expect(papers).toHaveLength(2);
		expect(papers?.[0].storage_path).not.toBeNull();
		expect(papers?.[0].review_status).toBe('submitted');
		expect(papers?.[1].storage_path).toBeNull();
		expect(papers?.[1].body_markdown).toContain('## The right to a healthy environment');
		expect(papers?.[1].review_status).toBe('submitted');
	});

	it('has running today in a session with the roll call taken, a speaker up and a motion open', async () => {
		const supabase = createServiceRoleClient();

		const { data: session } = await supabase
			.from('committee_sessions')
			.select('status, committee_id')
			.eq('id', LIVE_SESSION_ID)
			.single();
		const { count: attendanceCount } = await supabase
			.from('roll_call_entries')
			.select('seat_id', { count: 'exact', head: true })
			.eq('roll_call_id', 'ff000000-0000-4000-8000-000000000051');
		const { data: entries } = await supabase
			.from('speakers_list_entries')
			.select('status')
			.eq('speakers_list_id', 'fd000000-0000-4000-8000-000000000051');
		const entryStatuses = (entries ?? []).map((entry) => entry.status);
		const { data: motions } = await supabase
			.from('motions')
			.select('status')
			.eq('session_id', LIVE_SESSION_ID);
		const { data: state } = await supabase
			.from('committee_state')
			.select('current_session_id, mode, current_speaker_entry_id')
			.eq('committee_id', String(session?.committee_id))
			.single();

		expect(session?.status).toBe('in_progress');
		expect(attendanceCount).toBe(6);
		expect(countOf(entryStatuses, 'spoken')).toBe(2);
		expect(countOf(entryStatuses, 'speaking')).toBe(1);
		expect(countOf(entryStatuses, 'waiting')).toBe(2);
		expect(motions).toEqual([{ status: 'proposed' }]);
		expect(state?.current_session_id).toBe(LIVE_SESSION_ID);
		expect(state?.mode).toBe('formal_debate');
		expect(state?.current_speaker_entry_id).toBe('fe000000-0000-4000-8000-000000000053');
	});

	it('has an agenda set in one running committee and not in the others', async () => {
		const supabase = createServiceRoleClient();

		// Security Council first, then the Third Committee, then ECOFIN and ExComm,
		// which have not sat today (walkthrough-seed.sql).
		const { data: committees } = await supabase
			.from('committees')
			.select('id, abbreviation')
			.eq('conference_id', CONFERENCE_IDS.runningToday)
			.order('position');
		const { data: states } = await supabase
			.from('committee_state')
			.select('committee_id, agenda_topic, current_session_id')
			.in(
				'committee_id',
				(committees ?? []).map((committee) => committee.id)
			);
		const rooms = (committees ?? []).map((committee) => {
			const state = (states ?? []).find((row) => row.committee_id === committee.id);

			return {
				abbreviation: committee.abbreviation,
				agendaTopic: state?.agenda_topic,
				isInSession: Boolean(state?.current_session_id)
			};
		});

		expect(rooms).toEqual([
			{
				abbreviation: 'UNSC',
				agendaTopic: 'Humanitarian access in armed conflict',
				isInSession: true
			},
			{ abbreviation: 'SOCHUM', agendaTopic: null, isInSession: true },
			{ abbreviation: 'ECOFIN', agendaTopic: null, isInSession: false },
			{ abbreviation: 'ExComm', agendaTopic: null, isInSession: false }
		]);
	});

	it('has five delegates seated in the Third Committee, with no roll call taken yet', async () => {
		const supabase = createServiceRoleClient();

		const { data: seats } = await supabase
			.from('seats')
			.select('user_id')
			.eq('committee_id', 'f3000000-0000-4000-8000-000000000052')
			.not('user_id', 'is', null);
		const { count: rollCallCount } = await supabase
			.from('roll_calls')
			.select('id', { count: 'exact', head: true })
			.eq('session_id', 'fb000000-0000-4000-8000-000000000052');

		expect(seats).toHaveLength(5);
		expect(rollCallCount).toBe(0);
	});

	it('has a practice session the day before the first day, ended, with its whole record', async () => {
		const supabase = createServiceRoleClient();

		const { data: session } = await supabase
			.from('committee_sessions')
			.select('status, started_at')
			.eq('id', PRACTICE_SESSION_ID)
			.single();
		const conference = await readConference(CONFERENCE_IDS.runningToday);
		const { data: attendance } = await supabase
			.from('roll_call_entries')
			.select('status')
			.eq('roll_call_id', 'ff000000-0000-4000-8000-000000000151');
		const { data: entries } = await supabase
			.from('speakers_list_entries')
			.select('status')
			.eq('speakers_list_id', 'fd000000-0000-4000-8000-000000000151');
		const { data: motions } = await supabase
			.from('motions')
			.select('status')
			.eq('session_id', PRACTICE_SESSION_ID);
		const { data: vote } = await supabase
			.from('votes')
			.select('method, status, passed, vote_entries(choice)')
			.eq('session_id', PRACTICE_SESSION_ID)
			.single();
		const { count: sessionNoteCount } = await supabase
			.from('committee_session_notes')
			.select('session_id', { count: 'exact', head: true })
			.eq('session_id', PRACTICE_SESSION_ID);
		const { count: chairNoteCount } = await supabase
			.from('chair_notes')
			.select('id', { count: 'exact', head: true })
			.eq('committee_id', SECURITY_COUNCIL_ID);
		const startedOn = String(session?.started_at).slice(0, 10);

		// Started before the first day, so the app does not count it when it
		// names the next session, and "Session 2" still follows "Session 1".
		expect(session?.status).toBe('ended');
		expect(startedOn < String(conference?.start_date)).toBe(true);
		expect(
			countOf(
				(attendance ?? []).map((row) => row.status),
				'absent'
			)
		).toBe(1);
		expect(
			countOf(
				(entries ?? []).map((entry) => entry.status),
				'removed'
			)
		).toBe(1);
		expect((motions ?? []).map((motion) => motion.status).sort()).toEqual([
			'failed',
			'passed',
			'withdrawn'
		]);
		expect(vote?.method).toBe('roll_call');
		expect(vote?.status).toBe('closed');
		expect(vote?.passed).toBe(false);
		expect(vote?.vote_entries).toHaveLength(5);
		expect(sessionNoteCount).toBe(1);
		expect(chairNoteCount).toBe(3);
	});

	it("has awards proposed in the Security Council, and not China's Best Delegate", async () => {
		const supabase = createServiceRoleClient();

		// click-budget-awards.spec.ts proposes China's Best Delegate itself.
		const { data: awards } = await supabase
			.from('awards')
			.select('kind, status, seat:seats!inner(name)')
			.eq('committee_id', SECURITY_COUNCIL_ID)
			.overrideTypes<{ kind: string; status: string; seat: { name: string } }[]>();
		const chinaBestDelegate = (awards ?? []).filter(
			(award) => award.kind === 'best_delegate' && award.seat.name === 'China'
		);

		expect(awards).toHaveLength(2);
		expect((awards ?? []).every((award) => award.status === 'proposed')).toBe(true);
		expect(chinaBestDelegate).toEqual([]);
	});
});

describe('the walkthrough seed: the roles "about to start" made', () => {
	// Section 4 of docs/roles-and-permissions.md names the roles a conference
	// will probably make; "about to start" made three of them, one person each.
	it('orders its roles Organiser, the three it made, Chair, Volunteer', async () => {
		const { data } = await createServiceRoleClient()
			.from('conference_roles')
			.select('name, is_public')
			.eq('conference_id', CONFERENCE_IDS.aboutToStart)
			.order('position');

		expect(data).toEqual([
			{ name: 'Organiser', is_public: true },
			{ name: 'USG delegate affairs', is_public: true },
			{ name: 'Finance', is_public: false },
			{ name: 'Registration desk', is_public: false },
			{ name: 'Chair', is_public: true },
			{ name: 'Volunteer', is_public: false }
		]);
	});

	// Olivia, Rohan and Ellie, by their ids in the seed.
	it.each([
		[
			'f5000000-0000-4000-8000-000000000004',
			'USG delegate affairs',
			'read_welfare_details',
			'manage_invoices'
		],
		['f5000000-0000-4000-8000-000000000005', 'Finance', 'manage_invoices', 'read_welfare_details'],
		[
			'f5000000-0000-4000-8000-000000000006',
			'Registration desk',
			'read_welfare_details',
			'read_contact_details'
		]
	])('gives %s the role %s, which holds %s and not %s', async (userId, roleName, held, notHeld) => {
		const supabase = createServiceRoleClient();

		const { data: membership } = await supabase
			.from('conference_role_members')
			.select('role_id')
			.eq('conference_id', CONFERENCE_IDS.aboutToStart)
			.eq('user_id', userId)
			.single();

		const { data: role } = await supabase
			.from('conference_roles')
			.select('name, permissions')
			.eq('id', String(membership?.role_id))
			.single();

		expect(role?.name).toBe(roleName);
		expect(role?.permissions).toContain(held);
		expect(role?.permissions).not.toContain(notHeld);
	});
});

describe('the walkthrough seed: a committee day of papers', () => {
	// The section "Running today: a committee day of papers" of the seed, which
	// docs/TESTING-GUIDE.md walks through from 4.24.
	const PASSED_RESOLUTION_ID = 'f0000000-0000-4000-8000-000000000702';
	const DRAFT_ON_THE_FLOOR_ID = 'f0000000-0000-4000-8000-000000000703';
	const ECOFIN_ID = 'f3000000-0000-4000-8000-000000000053';
	const EXCOMM_ID = 'f3000000-0000-4000-8000-000000000054';

	it('has Security Council papers being written, introduced and passed', async () => {
		const { data: papers } = await createServiceRoleClient()
			.from('committee_papers')
			.select('kind, status')
			.eq('committee_id', SECURITY_COUNCIL_ID)
			.order('id');

		expect(papers).toEqual([
			{ kind: 'working_paper', status: 'introduced' },
			{ kind: 'draft_resolution', status: 'passed' },
			{ kind: 'draft_resolution', status: 'introduced' },
			{ kind: 'working_paper', status: 'writing' },
			{ kind: 'draft_resolution', status: 'writing' }
		]);
	});

	it('has amendments to the draft on the floor in every status', async () => {
		const { data: amendments } = await createServiceRoleClient()
			.from('amendments')
			.select('status')
			.eq('paper_id', DRAFT_ON_THE_FLOOR_ID);
		const statuses = new Set((amendments ?? []).map((amendment) => amendment.status));

		expect([...statuses].sort()).toEqual(
			[
				'approved',
				'awaiting_sponsors',
				'collecting_support',
				'failed',
				'lapsed',
				'out_of_order',
				'passed',
				'with_the_dais',
				'withdrawn',
				'written_in'
			].sort()
		);
	});

	it('has a passed resolution with its vote and its amended text', async () => {
		const supabase = createServiceRoleClient();

		const { data: vote } = await supabase
			.from('votes')
			.select('subject, passed, votes_for, votes_against, votes_abstain')
			.eq('paper_id', PASSED_RESOLUTION_ID)
			.single();
		const { data: versions } = await supabase
			.from('committee_paper_versions')
			.select('version_number, amendment_id')
			.eq('paper_id', PASSED_RESOLUTION_ID)
			.order('version_number');

		expect(vote).toEqual({
			subject: 'Draft resolution 1.1',
			passed: true,
			votes_for: 5,
			votes_against: 0,
			votes_abstain: 1
		});
		// The text as submitted, then the friendly amendment and the passed one.
		expect((versions ?? []).map((version) => version.amendment_id !== null)).toEqual([
			false,
			true,
			true
		]);
	});

	it('has ECOFIN run to THIMUN procedure, with a draft waiting for the dais', async () => {
		const supabase = createServiceRoleClient();

		const { data: committee } = await supabase
			.from('committees')
			.select(
				'paper_words, has_working_papers, has_friendly_amendments, has_second_degree_amendments'
			)
			.eq('id', ECOFIN_ID)
			.single();
		const { data: papers } = await supabase
			.from('committee_papers')
			.select('status')
			.eq('committee_id', ECOFIN_ID);

		expect(committee).toEqual({
			paper_words: 'submitters',
			has_working_papers: false,
			has_friendly_amendments: false,
			has_second_degree_amendments: true
		});
		expect(papers).toEqual([{ status: 'submitted' }]);
	});

	it('has ExComm with directives answered, refused and waiting, and a crisis update', async () => {
		const supabase = createServiceRoleClient();

		const { data: papers } = await supabase
			.from('committee_papers')
			.select('status')
			.eq('committee_id', EXCOMM_ID);
		const { data: state } = await supabase
			.from('committee_state')
			.select('crisis_update')
			.eq('committee_id', EXCOMM_ID)
			.single();
		const statuses = (papers ?? []).map((paper) => paper.status);

		expect(countOf(statuses, 'passed')).toBe(1);
		expect(countOf(statuses, 'carried_out')).toBe(1);
		expect(countOf(statuses, 'refused')).toBe(1);
		expect(countOf(statuses, 'published')).toBe(1);
		expect(countOf(statuses, 'submitted')).toBe(2);
		expect(state?.crisis_update).toContain('quarantine');
	});

	it('gives the crisis staff answer_directives and nothing else', async () => {
		const supabase = createServiceRoleClient();

		const { data: membership } = await supabase
			.from('conference_role_members')
			.select('role_id')
			.eq('conference_id', CONFERENCE_IDS.runningToday)
			.eq('user_id', 'f5000000-0000-4000-8000-000000000022')
			.single();
		const { data: role } = await supabase
			.from('conference_roles')
			.select('name, scope, permissions')
			.eq('id', String(membership?.role_id))
			.single();

		expect(role).toEqual({
			name: 'Crisis staff',
			scope: 'conference',
			permissions: ['answer_directives']
		});
	});
});

describe('the walkthrough seed: invitations and notifications', () => {
	it('has an invitation in every state', async () => {
		const supabase = createServiceRoleClient();
		const now = Date.now();

		const { data: invites } = await supabase
			.from('invites')
			.select('kind, committee_id, email, token, accepted_at, expires_at')
			.like('token', 'WalkInvite%')
			.order('id');
		const unanswered = (invites ?? []).filter((invite) => invite.accepted_at === null);
		const pending = unanswered.filter((invite) => Date.parse(invite.expires_at) > now);
		const expired = unanswered.filter((invite) => Date.parse(invite.expires_at) <= now);
		const accepted = (invites ?? []).filter((invite) => invite.accepted_at !== null);

		// One to an existing account, and two to addresses with no account yet.
		expect(pending.map((invite) => invite.email)).toEqual([
			'walk.newcomer@example.test',
			'new.admin@example.test',
			'guest.chair@example.test'
		]);
		expect(pending.some((invite) => invite.kind === 'organization_member')).toBe(true);
		expect(pending.some((invite) => invite.committee_id !== null)).toBe(true);
		expect(expired).toHaveLength(1);
		expect(accepted).toHaveLength(1);
		expect((invites ?? []).every((invite) => /^[A-Za-z0-9]{32}$/.test(invite.token))).toBe(true);
	});

	it('has every kind of notification but "award published" in a walkthrough bell, some read', async () => {
		const supabase = createServiceRoleClient();

		// Every walkthrough account's id starts with f5 (walkthrough-seed.sql).
		const { data: notifications } = await supabase
			.from('notifications')
			.select('kind, read_at')
			.gte('user_id', 'f5000000-0000-4000-8000-000000000000')
			.lte('user_id', 'f5000000-0000-4000-8000-ffffffffffff');
		const kinds = new Set((notifications ?? []).map((notification) => notification.kind));
		const readCount = (notifications ?? []).filter((notification) => notification.read_at).length;

		// "Award published" needs a finished conference, which is demo-seed.sql's.
		expect([...kinds].sort()).toEqual([
			'announcement',
			'application_decided',
			'delegation_decided',
			'delegation_seat_assigned',
			'document_reviewed',
			'invite_received',
			'invoice_created',
			'invoice_paid',
			'schedule_changed',
			'seat_allocated'
		]);
		expect(readCount).toBeGreaterThan(0);
		expect(readCount).toBeLessThan((notifications ?? []).length);
	});
});

describe('the walkthrough seed: accounts', () => {
	it('has an admin of the society besides its owner', async () => {
		const supabase = createServiceRoleClient();

		const { data: members } = await supabase
			.from('organization_members')
			.select('role')
			.eq('organization_id', 'f1000000-0000-4000-8000-000000000001');

		expect((members ?? []).map((member) => member.role).sort()).toEqual(['admin', 'owner']);
	});

	it('leaves the newcomer at the start of onboarding', async () => {
		const supabase = createServiceRoleClient();

		const { data: profile } = await supabase
			.from('profiles')
			.select('onboarding_completed_at')
			.eq('id', 'f5000000-0000-4000-8000-000000000091')
			.single();

		expect(profile).not.toBeNull();
		expect(profile?.onboarding_completed_at).toBeNull();
	});

	it.each(WALKTHROUGH_ACCOUNT_EMAILS)('lets %s sign in with the sample password', async (email) => {
		const visitor = createVisitorClient();

		const { data, error } = await visitor.auth.signInWithPassword({
			email,
			password: WALKTHROUGH_PASSWORD
		});

		expect(error).toBeNull();
		expect(data.session).not.toBeNull();
	});
});
