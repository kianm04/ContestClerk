import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient
} from './supabase-test-client';
import {
	addApplication,
	addCommittee,
	addDelegation,
	createConferenceOwnedByMe,
	createOpenConferenceOwnedByMe,
	whileTheConferenceIsJoinable
} from './conference-fixtures';

// The `application_questions` and `applications` rows of the policy matrix in
// specs/02-architecture/permissions.md, and the four triggers migration 0006
// puts on `applications`: `applications_validate` (function
// `validate_application`), `applications_guard_insert` (function
// `guard_application_insert`), `applications_guard_update` (function
// `guard_application_update`) and `applications_check_one_route` (function
// `check_one_route_per_conference`). `applications_set_updated_at` and
// `application_questions_set_updated_at` are the same `set_updated_at` trigger
// every other table with an `updated_at` column already carries, so they are
// not tested here on their own.

describe('application_questions', () => {
	it('lets a visitor and a signed-in stranger read the questions of a published conference', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		await supabase.from('application_questions').insert({
			conference_id: conferenceId,
			label: 'Have you chaired before?',
			type: 'short_text'
		});
		await supabase.from('conferences').update({ status: 'published' }).eq('id', conferenceId);

		const visitor = createVisitorClient();
		const { data: visitorData } = await visitor
			.from('application_questions')
			.select('label')
			.eq('conference_id', conferenceId);

		expect(visitorData).toEqual([{ label: 'Have you chaired before?' }]);

		const stranger = await createSignedInClient();
		const { data: strangerData } = await stranger.supabase
			.from('application_questions')
			.select('label')
			.eq('conference_id', conferenceId);

		expect(strangerData).toEqual([{ label: 'Have you chaired before?' }]);
	});

	it('shows nobody but staff the questions of a draft conference', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		await supabase
			.from('application_questions')
			.insert({ conference_id: conferenceId, label: 'Draft-only question', type: 'short_text' });

		const stranger = await createSignedInClient();
		const { data: strangerData } = await stranger.supabase
			.from('application_questions')
			.select('label')
			.eq('conference_id', conferenceId);

		expect(strangerData).toEqual([]);

		const visitor = createVisitorClient();
		const { data: visitorData } = await visitor
			.from('application_questions')
			.select('label')
			.eq('conference_id', conferenceId);

		expect(visitorData).toEqual([]);

		const { data: staffData } = await supabase
			.from('application_questions')
			.select('label')
			.eq('conference_id', conferenceId);

		expect(staffData).toEqual([{ label: 'Draft-only question' }]);
	});

	it('only lets an organiser insert, update and delete a question', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();
		const stranger = await createSignedInClient();

		// An insert blocked by a policy's `with check` comes back as an error, not
		// an empty list, because there is no row yet for a `using` clause to hide.
		const { error: refusedInsert } = await stranger.supabase
			.from('application_questions')
			.insert({ conference_id: conferenceId, label: 'Not mine to add', type: 'short_text' });

		expect(refusedInsert).not.toBeNull();

		const { data: question } = await supabase
			.from('application_questions')
			.insert({ conference_id: conferenceId, label: 'Original label', type: 'short_text' })
			.select('id')
			.single();

		if (!question) {
			throw new Error('Could not create the fixture question');
		}

		const { data: refusedUpdate } = await stranger.supabase
			.from('application_questions')
			.update({ label: 'Hijacked label' })
			.eq('id', question.id)
			.select('label');

		expect(refusedUpdate).toEqual([]);

		const { data: refusedDelete } = await stranger.supabase
			.from('application_questions')
			.delete()
			.eq('id', question.id)
			.select('id');

		expect(refusedDelete).toEqual([]);

		const { data: allowedUpdate } = await supabase
			.from('application_questions')
			.update({ label: 'Updated label' })
			.eq('id', question.id)
			.select('label');

		expect(allowedUpdate).toEqual([{ label: 'Updated label' }]);

		const { data: allowedDelete } = await supabase
			.from('application_questions')
			.delete()
			.eq('id', question.id)
			.select('id');

		expect(allowedDelete).toEqual([{ id: question.id }]);
	});
});

describe('applications, reading', () => {
	it('lets the applicant and the organiser read an application, and shows a stranger nothing', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, fixture.conferenceId, {
			committeePreferences: [committeeId]
		});
		const stranger = await createSignedInClient();

		const { data: byApplicant } = await applicant.supabase
			.from('applications')
			.select('id')
			.eq('id', applicationId);

		expect(byApplicant).toEqual([{ id: applicationId }]);

		const { data: byOrganiser } = await fixture.supabase
			.from('applications')
			.select('id')
			.eq('id', applicationId);

		expect(byOrganiser).toEqual([{ id: applicationId }]);

		const { data: byStranger } = await stranger.supabase
			.from('applications')
			.select('id')
			.eq('id', applicationId);

		expect(byStranger).toEqual([]);
	});
});

describe('applications, applying', () => {
	it('lets a signed-in person apply to a published, open conference', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient();

		const { data, error } = await applicant.supabase
			.from('applications')
			.insert({
				conference_id: fixture.conferenceId,
				user_id: applicant.userId,
				committee_preferences: [committeeId],
				motivation: 'I would like to attend.'
			})
			.select('id');

		expect(error).toBeNull();
		expect(data).toHaveLength(1);
	});

	// Every case below is blocked by the insert policy's `with check`, which
	// comes back from PostgREST as an error rather than an empty list: there is
	// no row yet for a `using` clause to quietly filter out.
	it('refuses an application to a conference that is still a draft', async () => {
		const { conferenceId } = await createConferenceOwnedByMe();
		const applicant = await createSignedInClient();

		const { error } = await applicant.supabase
			.from('applications')
			.insert({ conference_id: conferenceId, user_id: applicant.userId });

		expect(error).not.toBeNull();
	});

	it('refuses an application when the conference does not accept individual applications', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		await fixture.supabase
			.from('conferences')
			.update({ accepts_individual_applications: false })
			.eq('id', fixture.conferenceId);
		const applicant = await createSignedInClient();

		const { error } = await applicant.supabase
			.from('applications')
			.insert({ conference_id: fixture.conferenceId, user_id: applicant.userId });

		expect(error).not.toBeNull();
	});

	it('refuses an application once applications_close_at has passed', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		await fixture.supabase
			.from('conferences')
			.update({ applications_close_at: new Date(Date.now() - 86_400_000).toISOString() })
			.eq('id', fixture.conferenceId);
		const applicant = await createSignedInClient();

		const { error } = await applicant.supabase
			.from('applications')
			.insert({ conference_id: fixture.conferenceId, user_id: applicant.userId });

		expect(error).not.toBeNull();
	});

	it("refuses an application with somebody else's user_id", async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const applicant = await createSignedInClient();
		const somebodyElse = await createSignedInClient();

		const { error } = await applicant.supabase
			.from('applications')
			.insert({ conference_id: fixture.conferenceId, user_id: somebodyElse.userId });

		expect(error).not.toBeNull();
	});
});

describe('applications, editing', () => {
	it('lets the applicant edit their own draft and submitted application, but not once accepted', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, fixture.conferenceId, {
			status: 'draft',
			committeePreferences: [committeeId]
		});

		const { data: draftEdit } = await applicant.supabase
			.from('applications')
			.update({ seat_preferences: 'Any P5 country' })
			.eq('id', applicationId)
			.select('seat_preferences');

		expect(draftEdit).toEqual([{ seat_preferences: 'Any P5 country' }]);

		await applicant.supabase
			.from('applications')
			.update({ status: 'submitted' })
			.eq('id', applicationId);

		const { data: submittedEdit } = await applicant.supabase
			.from('applications')
			.update({ seat_preferences: 'Brazil' })
			.eq('id', applicationId)
			.select('seat_preferences');

		expect(submittedEdit).toEqual([{ seat_preferences: 'Brazil' }]);

		// Only accept_application, which runs as the database's owner and seats
		// the person in the same step, moves an application to `accepted`. The
		// seat is beside the point here, so the row is marked the same way.
		await createServiceRoleClient()
			.from('applications')
			.update({ status: 'accepted' })
			.eq('id', applicationId);

		const { data: refusedEdit } = await applicant.supabase
			.from('applications')
			.update({ seat_preferences: 'France' })
			.eq('id', applicationId)
			.select('seat_preferences');

		expect(refusedEdit).toEqual([]);
	});

	it('lets an organiser decide an application', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, fixture.conferenceId, {
			committeePreferences: [committeeId]
		});

		// Waitlisting is one of the decisions the review pages write to the row
		// itself; accepting is accept_application's, which the
		// security-applications-windows tests cover.
		const { data } = await fixture.supabase
			.from('applications')
			.update({ status: 'waitlisted', decision_note: 'On the waiting list for now.' })
			.eq('id', applicationId)
			.select('status, decision_note');

		expect(data).toEqual([{ status: 'waitlisted', decision_note: 'On the waiting list for now.' }]);
	});
});

describe('applications, deleting', () => {
	it('lets the applicant delete their own draft, but not a submitted application', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient();
		const draftId = await addApplication(applicant.supabase, fixture.conferenceId, {
			status: 'draft',
			committeePreferences: [committeeId]
		});

		const { data: deletedDraft } = await applicant.supabase
			.from('applications')
			.delete()
			.eq('id', draftId)
			.select('id');

		expect(deletedDraft).toEqual([{ id: draftId }]);

		const secondApplicant = await createSignedInClient();
		const submittedId = await addApplication(secondApplicant.supabase, fixture.conferenceId, {
			committeePreferences: [committeeId]
		});

		const { data: refusedDelete } = await secondApplicant.supabase
			.from('applications')
			.delete()
			.eq('id', submittedId)
			.select('id');

		expect(refusedDelete).toEqual([]);
	});
});

describe('validate_application', () => {
	it('refuses more committee preferences than the conference asks for', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeA = await addCommittee(
			fixture.supabase,
			fixture.conferenceId,
			'Security Council'
		);
		const committeeB = await addCommittee(
			fixture.supabase,
			fixture.conferenceId,
			'Human Rights Council'
		);
		const committeeC = await addCommittee(
			fixture.supabase,
			fixture.conferenceId,
			'Legal Committee'
		);
		const applicant = await createSignedInClient();

		// createOpenConferenceOwnedByMe leaves committee_preference_count at its
		// default of 2, so three preferences is already one too many.
		const { error } = await applicant.supabase.from('applications').insert({
			conference_id: fixture.conferenceId,
			user_id: applicant.userId,
			status: 'draft',
			committee_preferences: [committeeA, committeeB, committeeC]
		});

		expect(error?.message).toContain('asks for');
	});

	it('refuses the same committee twice', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient();

		const { error } = await applicant.supabase.from('applications').insert({
			conference_id: fixture.conferenceId,
			user_id: applicant.userId,
			status: 'draft',
			committee_preferences: [committeeId, committeeId]
		});

		expect(error?.message).toContain('different committee');
	});

	it('refuses a committee that belongs to another conference', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const otherFixture = await createOpenConferenceOwnedByMe();
		const foreignCommitteeId = await addCommittee(otherFixture.supabase, otherFixture.conferenceId);
		const applicant = await createSignedInClient();

		const { error } = await applicant.supabase.from('applications').insert({
			conference_id: fixture.conferenceId,
			user_id: applicant.userId,
			status: 'draft',
			committee_preferences: [foreignCommitteeId]
		});

		expect(error?.message).toContain('committee of this conference');
	});

	it('refuses submitting with no committee preference when the conference asks for some', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const applicant = await createSignedInClient();

		const { error } = await applicant.supabase.from('applications').insert({
			conference_id: fixture.conferenceId,
			user_id: applicant.userId,
			status: 'submitted',
			motivation: 'I would like to attend.'
		});

		expect(error?.message).toContain('Pick at least one committee preference');
	});

	it('refuses submitting without a motivation while ask_motivation is on', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient();

		const { error } = await applicant.supabase.from('applications').insert({
			conference_id: fixture.conferenceId,
			user_id: applicant.userId,
			status: 'submitted',
			committee_preferences: [committeeId]
		});

		expect(error?.message).toContain('Write a motivation');
	});

	it('refuses submitting without an answer to a required question, but allows saving it as a draft', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		await fixture.supabase.from('application_questions').insert({
			conference_id: fixture.conferenceId,
			label: 'Have you chaired before?',
			type: 'short_text',
			is_required: true
		});
		const applicant = await createSignedInClient();

		const { error: draftError } = await applicant.supabase.from('applications').insert({
			conference_id: fixture.conferenceId,
			user_id: applicant.userId,
			status: 'draft',
			committee_preferences: [committeeId]
		});

		expect(draftError).toBeNull();

		const { error: submitError } = await applicant.supabase
			.from('applications')
			.update({ status: 'submitted', motivation: 'I would like to attend.' })
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', applicant.userId);

		expect(submitError?.message).toContain('Answer "Have you chaired before?"');
	});

	it('refuses a motivation longer than 1500 characters', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const applicant = await createSignedInClient();

		const { error } = await applicant.supabase.from('applications').insert({
			conference_id: fixture.conferenceId,
			user_id: applicant.userId,
			status: 'draft',
			motivation: 'x'.repeat(1501)
		});

		expect(error).not.toBeNull();
	});
});

describe('guard_application_insert, the applications_guard_insert trigger', () => {
	it('lets an applicant write an ordinary draft, and keeps the clock for itself', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const applicant = await createSignedInClient();

		const { error } = await applicant.supabase.from('applications').insert({
			conference_id: fixture.conferenceId,
			user_id: applicant.userId,
			status: 'draft',
			motivation: 'I would like to attend.',
			// Sent on purpose. The trigger overwrites it, so a draft cannot claim
			// to have been written before everybody else's.
			created_at: '2020-01-01T00:00:00.000Z'
		});

		expect(error).toBeNull();

		const { data } = await applicant.supabase
			.from('applications')
			.select('status, submitted_at, decided_at, decision_note, created_at')
			.eq('user_id', applicant.userId)
			.single();

		expect(data).toMatchObject({
			status: 'draft',
			submitted_at: null,
			decided_at: null,
			decision_note: null
		});
		expect(new Date(data?.created_at ?? 0).getFullYear()).toBeGreaterThan(2020);
	});

	it('stamps submitted_at itself when the first save is already a submission', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient();

		const { error } = await applicant.supabase.from('applications').insert({
			conference_id: fixture.conferenceId,
			user_id: applicant.userId,
			status: 'submitted',
			committee_preferences: [committeeId],
			motivation: 'I would like to attend.'
		});

		expect(error).toBeNull();

		const { data } = await applicant.supabase
			.from('applications')
			.select('submitted_at')
			.eq('user_id', applicant.userId)
			.single();

		expect(data?.submitted_at).not.toBeNull();
	});

	// The three below are the hole this trigger was written for: every one of
	// them is something guard_application_update refuses to let anybody change
	// afterwards, so without a guard on the insert they could simply be chosen
	// on the way in. Worse, the row would then be stuck: an accepted
	// application is one the update guard and the update policy both refuse the
	// applicant, so the organiser would be left with a decision nobody made.
	it('refuses an applicant who writes their own decision', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const applicant = await createSignedInClient();

		const { error } = await applicant.supabase.from('applications').insert({
			conference_id: fixture.conferenceId,
			user_id: applicant.userId,
			status: 'accepted',
			motivation: 'I would like to attend.'
		});

		expect(error?.message).toContain('can only be saved as a draft or submitted');
	});

	it('refuses an applicant who backdates when they submitted', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient();

		const { error } = await applicant.supabase.from('applications').insert({
			conference_id: fixture.conferenceId,
			user_id: applicant.userId,
			status: 'submitted',
			committee_preferences: [committeeId],
			motivation: 'I would like to attend.',
			submitted_at: '2020-01-01T00:00:00.000Z'
		});

		expect(error?.message).toContain('not something a page writes');
	});

	it('refuses an applicant who writes a decision column on a draft', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const applicant = await createSignedInClient();

		// Refused by the catch-all at the end of the trigger, which takes away
		// the columns an applicant chooses and insists that everything left
		// arrives empty. A decision column added to this table later is guarded
		// from the day it arrives rather than the day somebody remembers.
		const { error } = await applicant.supabase.from('applications').insert({
			conference_id: fixture.conferenceId,
			user_id: applicant.userId,
			status: 'draft',
			motivation: 'I would like to attend.',
			decision_note: 'Congratulations, you are in.'
		});

		expect(error?.message).toContain('Only the organisers decide an application');
	});
});

describe('guard_application_update', () => {
	it('lets the applicant move draft to submitted to draft, and fills and clears submitted_at for them', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, fixture.conferenceId, {
			status: 'draft',
			committeePreferences: [committeeId]
		});

		const { data: submitted } = await applicant.supabase
			.from('applications')
			.update({ status: 'submitted' })
			.eq('id', applicationId)
			.select('status, submitted_at')
			.single();

		expect(submitted?.status).toBe('submitted');
		expect(submitted?.submitted_at).not.toBeNull();

		const { data: backToDraft } = await applicant.supabase
			.from('applications')
			.update({ status: 'draft' })
			.eq('id', applicationId)
			.select('status, submitted_at')
			.single();

		expect(backToDraft?.status).toBe('draft');
		expect(backToDraft?.submitted_at).toBeNull();
	});

	it('lets the applicant withdraw', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, fixture.conferenceId, {
			committeePreferences: [committeeId]
		});

		const { data } = await applicant.supabase
			.from('applications')
			.update({ status: 'withdrawn' })
			.eq('id', applicationId)
			.select('status');

		expect(data).toEqual([{ status: 'withdrawn' }]);
	});

	it('puts a decision column an applicant writes back as it was, saying nothing', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, fixture.conferenceId, {
			status: 'draft',
			committeePreferences: [committeeId]
		});

		// The guard's own "Only the organisers decide" refusal never fires for the
		// applicant any more: `applications_applicant_keeps_decision` (migration
		// 20261022132100) runs first and puts decision_note, internal_note,
		// decided_at and decided_by back to what they were. A refusal would have
		// told the applicant whether the value they sent was the real one, which
		// is how `decided_by`, a column they may not read, could be guessed.
		const { data, error } = await applicant.supabase
			.from('applications')
			.update({ decision_note: 'I decide for myself' })
			.eq('id', applicationId)
			.select('decision_note');

		expect(error).toBeNull();
		expect(data).toEqual([{ decision_note: null }]);
	});

	it('lets a waitlisted application only be withdrawn, not re-submitted', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, fixture.conferenceId, {
			committeePreferences: [committeeId]
		});

		await fixture.supabase
			.from('applications')
			.update({ status: 'waitlisted' })
			.eq('id', applicationId);

		const { error: refusedResubmit } = await applicant.supabase
			.from('applications')
			.update({ status: 'submitted' })
			.eq('id', applicationId);

		expect(refusedResubmit?.message).toContain('waitlisted application can only be withdrawn');

		const { data: allowedWithdraw } = await applicant.supabase
			.from('applications')
			.update({ status: 'withdrawn' })
			.eq('id', applicationId)
			.select('status');

		expect(allowedWithdraw).toEqual([{ status: 'withdrawn' }]);
	});

	it("refuses an organiser rewriting the applicant's motivation, answers or committee preferences", async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, fixture.conferenceId, {
			committeePreferences: [committeeId]
		});

		const { error } = await fixture.supabase
			.from('applications')
			.update({ motivation: 'Rewritten by the organiser' })
			.eq('id', applicationId);

		expect(error?.message).toContain('cannot change what an applicant wrote');
	});
});

describe('guard_application_update, submitted_at belongs to the trigger', () => {
	it('refuses an applicant who backdates when they submitted', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, fixture.conferenceId, {
			committeePreferences: [committeeId]
		});

		// `06-features/applications.md` gives the organiser a table sorted by
		// submitted date, so a moment the applicant can choose would let them put
		// themselves at the front of the queue.
		const { error } = await applicant.supabase
			.from('applications')
			.update({ submitted_at: '2020-01-01T00:00:00.000Z' })
			.eq('id', applicationId);

		expect(error?.message).toContain('not something a page writes');

		const { data } = await fixture.supabase
			.from('applications')
			.select('submitted_at')
			.eq('id', applicationId)
			.single();

		expect(data?.submitted_at).not.toBe('2020-01-01T00:00:00.000Z');
	});

	it('refuses an organiser who rewrites when somebody submitted', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, fixture.conferenceId, {
			committeePreferences: [committeeId]
		});

		const { error } = await fixture.supabase
			.from('applications')
			.update({ submitted_at: '2020-01-01T00:00:00.000Z' })
			.eq('id', applicationId);

		expect(error?.message).toContain('not something a page writes');
	});

	it('refuses an applicant who backdates when the row was created', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, fixture.conferenceId, {
			status: 'draft',
			committeePreferences: [committeeId]
		});

		// Not a column anybody was ever given. It is refused by the catch-all at
		// the end of the applicant's branch rather than by a rule of its own,
		// which is the point of writing that check as "everything else".
		const { error } = await applicant.supabase
			.from('applications')
			.update({ created_at: '2020-01-01T00:00:00.000Z' })
			.eq('id', applicationId);

		expect(error?.message).toContain('can only change their own answers');
	});
});

describe('guard_application_update, an application cannot be moved', () => {
	it('refuses an applicant who carries their application to another conference', async () => {
		const open = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(open.supabase, open.conferenceId);
		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, open.conferenceId, {
			status: 'draft',
			committeePreferences: [committeeId]
		});

		// A conference nobody may apply to: it takes no individual applications
		// and its window shut days ago. Inserting the same row straight is refused
		// by the applications insert policy, so moving one here must be too, or
		// that policy's conditions are only a suggestion.
		const closed = await createOpenConferenceOwnedByMe();
		await closed.supabase
			.from('conferences')
			.update({
				accepts_individual_applications: false,
				applications_close_at: new Date(Date.now() - 5 * 86_400_000).toISOString()
			})
			.eq('id', closed.conferenceId);

		const { error } = await applicant.supabase
			.from('applications')
			.update({ conference_id: closed.conferenceId })
			.eq('id', applicationId);

		expect(error?.message).toContain('belongs to one person and one conference');

		// Read back as the applicant: the row is a draft, which since migration
		// 20261022140000 (security review L15) the organiser cannot see.
		const { data: unmoved } = await applicant.supabase
			.from('applications')
			.select('conference_id')
			.eq('id', applicationId);

		expect(unmoved).toEqual([{ conference_id: open.conferenceId }]);
	});

	it("refuses an applicant who puts somebody else's name on their application", async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, fixture.conferenceId, {
			status: 'draft',
			committeePreferences: [committeeId]
		});
		const somebodyElse = await createSignedInClient();

		const { error } = await applicant.supabase
			.from('applications')
			.update({ user_id: somebodyElse.userId })
			.eq('id', applicationId);

		expect(error?.message).toContain('belongs to one person and one conference');
	});

	it('refuses an organiser who moves an application into their own conference', async () => {
		const open = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(open.supabase, open.conferenceId);
		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, open.conferenceId, {
			committeePreferences: [committeeId]
		});

		const otherOrganiser = await createOpenConferenceOwnedByMe();

		// The organiser of the conference the row is in may decide it, so they
		// pass the update policy; the trigger is what stops them handing the
		// application to a conference of their own.
		const { error } = await open.supabase
			.from('applications')
			.update({ conference_id: otherOrganiser.conferenceId })
			.eq('id', applicationId);

		expect(error?.message).toContain('belongs to one person and one conference');
	});
});

describe('check_one_route_per_conference', () => {
	it('refuses an application from somebody already in a delegation for that conference', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const member = await createSignedInClient();
		const delegationId = await addDelegation(member.supabase, fixture.conferenceId);
		// A second person joins the delegation the head just created, using the
		// join code, the only door join_delegation opens.
		const { data: delegation, error: delegationError } = await member.supabase
			.from('delegations')
			.select('join_code')
			.eq('id', delegationId)
			.single();

		if (delegationError || !delegation) {
			throw new Error(
				`Could not read the fixture delegation's join code: ${delegationError?.message}`
			);
		}

		const secondMember = await createSignedInClient();

		// The fixture conference is dated 2020, which `join_delegation` now reads
		// as "already taken place"; this lifts that for the one call, because what
		// is being proved here is the one-road rule and not the calendar.
		await whileTheConferenceIsJoinable(fixture, () =>
			secondMember.supabase.rpc('join_delegation', { code: delegation.join_code })
		);

		const { error } = await secondMember.supabase.from('applications').insert({
			conference_id: fixture.conferenceId,
			user_id: secondMember.userId,
			status: 'draft'
		});

		expect(error?.message).toContain('already part of a delegation');
	});

	it('refuses a second application for the same conference', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const applicant = await createSignedInClient();
		await addApplication(applicant.supabase, fixture.conferenceId, {
			status: 'draft',
			committeePreferences: [committeeId]
		});

		const { error } = await applicant.supabase.from('applications').insert({
			conference_id: fixture.conferenceId,
			user_id: applicant.userId,
			status: 'draft'
		});

		expect(error).not.toBeNull();
	});
});
