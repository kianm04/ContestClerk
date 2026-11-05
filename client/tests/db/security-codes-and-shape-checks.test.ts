import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { MAX_CHOICE_OPTIONS, type ApplicationQuestion } from '../../src/lib/application-questions';
import {
	ANSWER_MAX_LENGTH,
	cleanApplicationForm,
	type ApplicationFormValues
} from '../../src/lib/applications';
import { createSignedInClient, type SignedInClient } from './supabase-test-client';
import {
	addApplication,
	addCommittee,
	createOpenConferenceOwnedByMe,
	type ConferenceFixture
} from './conference-fixtures';

// Migration 20261022141000_codes_and_shape_checks.sql, for findings L25, L26,
// L27 and L68 of docs/security-review-2026-10-10.md:
//
//   * L25: an application team's join code is eight characters drawn by
//     new_application_team from gen_random_bytes, and join_application_team
//     refuses a person after ten wrong codes in an hour (the attempts are kept
//     in application_team_code_attempts, which nobody but the function reads).
//   * L26 and L27: application_answers_are_valid keeps applications.answers to
//     the two shapes the apply form writes, under question ids no longer than
//     64 characters, and seat_preferences and committee_preferences are
//     bounded. The helper lives in the private schema, so the API does not
//     offer it as an RPC. What the apply form saves always fits, because
//     cleanApplicationForm clips to the same bounds (ANSWER_MAX_LENGTH and
//     MAX_CHOICE_OPTIONS).
//   * L68: a delegation's name, institution and note are bounded, so a direct
//     write cannot get past what the form allows.
//
// Every refusal below goes through a signed-in client, so a policy or guard that
// opened up would show here as well.

/** The alphabet both kinds of join code are drawn from: no 0, O, 1 or I. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A code that belongs to no team: the alphabet never has a zero in it. */
const WRONG_CODE = 'WRONG000';

type RpcOutcome = { data: unknown; error: { code: string; message: string } | null };

/**
 * supabase-js types `rpc` by the generated list of API functions, which does
 * not name application_answers_are_valid: the point of calling it is that the
 * API does not know it, so it has to be called by plain name.
 */
function callHiddenHelper(
	client: SupabaseClient,
	name: string,
	args: Record<string, unknown>
): PromiseLike<RpcOutcome> {
	const rpcByName = client.rpc.bind(client) as (
		functionName: string,
		functionArgs: Record<string, unknown>
	) => PromiseLike<RpcOutcome>;

	return rpcByName(name, args);
}

/** A conference open for applications, with one applicant whose application is submitted. */
async function createConferenceWithApplicant(name = 'Umarbek Ismoilov') {
	const conference = await createOpenConferenceOwnedByMe();
	const committeeId = await addCommittee(conference.supabase, conference.conferenceId);
	const applicant = await addApplicant(conference, committeeId, name);

	return { conference, committeeId, applicant };
}

/** One more person applying to the conference, and their application's id. */
async function addApplicant(conference: ConferenceFixture, committeeId: string, name: string) {
	const client = await createSignedInClient(name);
	const applicationId = await addApplication(client.supabase, conference.conferenceId, {
		committeePreferences: [committeeId]
	});

	return { ...client, applicationId };
}

/** Starts a team for `applicant` and answers its join code. */
async function startTeam(applicant: SignedInClient & { applicationId: string }) {
	const { data, error } = await applicant.supabase.rpc('start_application_team', {
		application_id: applicant.applicationId
	});

	if (error || typeof data !== 'string') {
		throw new Error(`Could not start the fixture team: ${error?.message}`);
	}

	return data;
}

/** One attempt to join a team with `code`, as the database answers it. */
async function tryCode(applicant: SignedInClient & { applicationId: string }, code: string) {
	return applicant.supabase.rpc('join_application_team', {
		application_id: applicant.applicationId,
		code
	});
}

/**
 * One draft application written straight to the table by its applicant, with
 * whatever `columns` says on top of the fixture's own. A refused insert leaves
 * no row, so one applicant can try several shapes in a row.
 */
async function insertDraft(
	applicant: SignedInClient,
	conferenceId: string,
	columns: Record<string, unknown>
) {
	return applicant.supabase.from('applications').insert({
		conference_id: conferenceId,
		user_id: applicant.userId,
		status: 'draft',
		...columns
	});
}

/** `create_delegation` with the fixture's details, except what `columns` changes. */
async function createDelegation(
	head: SignedInClient,
	conferenceId: string,
	columns: Record<string, unknown>
) {
	return head.supabase.rpc('create_delegation', {
		conference_id: conferenceId,
		name: 'Fixture Delegation',
		institution_name: 'Fixture School',
		country_code: 'NL',
		requested_seats: 4,
		note: null,
		...columns
	});
}

describe('application team join codes (L25)', () => {
	it('mints eight characters without 0, O, 1 or I, and a different code every time', async () => {
		const { conference, committeeId, applicant } = await createConferenceWithApplicant();
		const other = await addApplicant(conference, committeeId, 'Kian Matton');

		const firstCode = await startTeam(applicant);
		const secondCode = await startTeam(other);

		expect(firstCode).toMatch(new RegExp(`^[${CODE_ALPHABET}]{8}$`));
		expect(secondCode).toMatch(new RegExp(`^[${CODE_ALPHABET}]{8}$`));
		expect(secondCode).not.toBe(firstCode);
	});

	it('answers a wrong code with nothing, and the right one with the team', async () => {
		const { conference, committeeId, applicant } = await createConferenceWithApplicant();
		const friend = await addApplicant(conference, committeeId, 'Kian Matton');
		const code = await startTeam(applicant);

		// Null and not an exception, because an exception would roll back the
		// attempt the function writes down, and the cap below could never fill.
		const wrong = await tryCode(friend, WRONG_CODE);
		expect(wrong.error).toBeNull();
		expect(wrong.data).toBeNull();

		const right = await tryCode(friend, code);
		expect(right.error).toBeNull();
		expect(typeof right.data).toBe('string');
	});

	it('refuses the eleventh code in an hour, right or wrong, and only for that person', async () => {
		const { conference, committeeId, applicant } = await createConferenceWithApplicant();
		const guesser = await addApplicant(conference, committeeId, 'Kian Matton');
		const friend = await addApplicant(conference, committeeId, 'Amara Okafor');
		const code = await startTeam(applicant);

		for (let attempt = 1; attempt <= 10; attempt += 1) {
			const { error } = await tryCode(guesser, WRONG_CODE);
			expect(error).toBeNull();
		}

		// The cap is checked before the code is looked up, so the eleventh try
		// learns nothing even when it happens to be right.
		const { error: wrongAgain } = await tryCode(guesser, WRONG_CODE);
		expect(wrongAgain?.message).toContain('Too many wrong codes');

		const { error: rightButLocked } = await tryCode(guesser, code);
		expect(rightButLocked?.message).toContain('Too many wrong codes');

		// Somebody else is not locked out by the guesser's attempts.
		const { data: joined, error: friendError } = await tryCode(friend, code);
		expect(friendError).toBeNull();
		expect(typeof joined).toBe('string');
	});

	it('counts wrong codes sent all at once one by one, so a burst gets no more than the cap', async () => {
		const { conference, committeeId } = await createConferenceWithApplicant();
		const guesser = await addApplicant(conference, committeeId, 'Kian Matton');

		// Five wrong codes first, so five are left in the hour.
		for (let attempt = 1; attempt <= 5; attempt += 1) {
			const { error } = await tryCode(guesser, WRONG_CODE);
			expect(error).toBeNull();
		}

		// Then thirty at the same moment. Without a lock, every request the API
		// runs side by side counts the same five before any of them has written
		// its own, and as many as it runs at once get through to the lookup.
		const outcomes = await Promise.all(
			Array.from({ length: 30 }, () => tryCode(guesser, WRONG_CODE))
		);

		const answered = outcomes.filter((outcome) => outcome.error === null);
		const refused = outcomes.filter((outcome) =>
			outcome.error?.message.includes('Too many wrong codes')
		);
		expect(answered).toHaveLength(5);
		expect(refused).toHaveLength(25);
	});
});

describe('applications.answers (L26, L27)', () => {
	it('accepts an object of strings and lists of strings, up to the limits', async () => {
		const { conferenceId } = await createOpenConferenceOwnedByMe();
		const applicant = await createSignedInClient();

		const answers: Record<string, string | string[]> = {};
		for (let question = 1; question <= 49; question += 1) {
			answers[`question-${question}`] = 'x'.repeat(4000);
		}
		answers['question-50'] = Array.from({ length: 20 }, () => 'y'.repeat(4000));

		const { error } = await insertDraft(applicant, conferenceId, { answers });
		expect(error).toBeNull();
	});

	it('refuses every shape the apply form never writes', async () => {
		const { conferenceId } = await createOpenConferenceOwnedByMe();
		const applicant = await createSignedInClient();

		const tooManyAnswers: Record<string, string> = {};
		for (let question = 1; question <= 51; question += 1) {
			tooManyAnswers[`question-${question}`] = 'fine';
		}

		const wrongShapes: Record<string, unknown> = {
			'a list where the object should be': ['not', 'an', 'object'],
			'a bare string': 'not an object',
			'a number as an answer': { question: 123 },
			'an object as an answer': { question: { nested: 'object' } },
			'a null answer': { question: null },
			'a list with a number in it': { question: ['fine', 2] },
			'an answer over 4000 characters': { question: 'x'.repeat(4001) },
			'a list entry over 4000 characters': { question: ['x'.repeat(4001)] },
			'a list of more than 20 entries': { question: Array.from({ length: 21 }, () => 'y') },
			'more than 50 answers': tooManyAnswers,
			'a question id over 64 characters': { ['q'.repeat(65)]: 'fine' }
		};

		for (const [shape, answers] of Object.entries(wrongShapes)) {
			const { error } = await insertDraft(applicant, conferenceId, { answers });
			expect(error?.message, shape).toContain('applications_answers_shape');
		}
	});

	it('takes a question id of up to 64 characters, and refuses one far longer', async () => {
		const { conferenceId } = await createOpenConferenceOwnedByMe();
		const applicant = await createSignedInClient();

		// A question id is a 36-character uuid, so 64 is room to spare. A key is
		// shown in the organiser's table like an answer is, so a huge one is the
		// same abuse as a huge answer.
		const { error: refused } = await insertDraft(applicant, conferenceId, {
			answers: { ['q'.repeat(100_000)]: 'fine' }
		});
		expect(refused?.message).toContain('applications_answers_shape');

		const { error: accepted } = await insertDraft(applicant, conferenceId, {
			answers: { ['q'.repeat(64)]: 'fine' }
		});
		expect(accepted).toBeNull();
	});

	it('saves whatever the apply form cleaned, however long the answer or many the ticks', async () => {
		const { conferenceId } = await createOpenConferenceOwnedByMe();
		const applicant = await createSignedInClient();

		const essay: ApplicationQuestion = {
			id: crypto.randomUUID(),
			label: 'Tell us about yourself',
			helpText: null,
			type: 'long_text',
			options: [],
			isRequired: false,
			position: 1
		};
		const languages: ApplicationQuestion = {
			id: crypto.randomUUID(),
			label: 'Which languages do you speak?',
			helpText: null,
			type: 'multiple_choice',
			options: Array.from({ length: 25 }, (_, index) => `Language ${index + 1}`),
			isRequired: false,
			position: 2
		};
		const typed: ApplicationFormValues = {
			committeePreferences: [],
			seatPreferences: '',
			motivation: '',
			answers: { [essay.id]: 'x'.repeat(4999), [languages.id]: languages.options.slice(0, 21) },
			hasConsented: false
		};

		// What "Save draft" writes. A hand-made request can send more than the
		// boxes hold, and a draft is never refused, so the clip is all there is.
		const cleaned = cleanApplicationForm(typed, [], [essay, languages]);

		const { error } = await insertDraft(applicant, conferenceId, { answers: cleaned.answers });
		expect(error).toBeNull();
		expect(cleaned.answers[essay.id]).toHaveLength(ANSWER_MAX_LENGTH);
		expect(cleaned.answers[languages.id]).toHaveLength(MAX_CHOICE_OPTIONS);
	});

	it("keeps the form's limits and the column's the same numbers", async () => {
		const { conferenceId } = await createOpenConferenceOwnedByMe();
		const applicant = await createSignedInClient();

		// The refusals first: a refused insert leaves no row, while the accepted
		// one takes this applicant's one application at the conference.
		const { error: tooLong } = await insertDraft(applicant, conferenceId, {
			answers: { essay: 'x'.repeat(ANSWER_MAX_LENGTH + 1) }
		});
		expect(tooLong?.message).toContain('applications_answers_shape');

		const { error: tooMany } = await insertDraft(applicant, conferenceId, {
			answers: { languages: Array.from({ length: MAX_CHOICE_OPTIONS + 1 }, () => 'y') }
		});
		expect(tooMany?.message).toContain('applications_answers_shape');

		const { error: longest } = await insertDraft(applicant, conferenceId, {
			answers: {
				essay: 'x'.repeat(ANSWER_MAX_LENGTH),
				languages: Array.from({ length: MAX_CHOICE_OPTIONS }, () => 'y')
			}
		});
		expect(longest).toBeNull();
	});

	it("is not offered through the API, though every applicant's write still calls it", async () => {
		const applicant = await createSignedInClient();

		// PGRST202 is PostgREST's "no such function in the schema cache": the
		// check is not merely refused, it is not on offer. The inserts above
		// show the CHECK still runs it for the signed-in writer.
		const { error } = await callHiddenHelper(applicant.supabase, 'application_answers_are_valid', {
			answers: {}
		});
		expect(error?.code).toBe('PGRST202');
	});
});

describe('the bounds on an application (L26)', () => {
	it('keeps seat_preferences to the 300 characters the form allows', async () => {
		const { conferenceId } = await createOpenConferenceOwnedByMe();
		const applicant = await createSignedInClient();

		const { error: refused } = await insertDraft(applicant, conferenceId, {
			seat_preferences: 'x'.repeat(301)
		});
		expect(refused?.message).toContain('applications_seat_preferences_length');

		const { error: accepted } = await insertDraft(applicant, conferenceId, {
			seat_preferences: 'x'.repeat(300)
		});
		expect(accepted).toBeNull();
	});

	it('refuses more committee preferences than any conference could ask for', async () => {
		const { supabase, conferenceId } = await createOpenConferenceOwnedByMe();
		const applicant = await createSignedInClient();
		const committeeIds: string[] = [];
		for (let committee = 1; committee <= 11; committee += 1) {
			committeeIds.push(await addCommittee(supabase, conferenceId, `Committee ${committee}`));
		}

		// What refuses eleven today is validate_application, which holds the list
		// to the conference's own count of at most three, so the message is the
		// trigger's. applications_committee_preferences_count stands behind it
		// for the day that trigger changes; a BEFORE trigger runs ahead of every
		// CHECK, and no role these tests sign in as can switch triggers off, so
		// the CHECK's own refusal can only be seen as postgres (with
		// session_replication_role = replica).
		const { error: refused } = await insertDraft(applicant, conferenceId, {
			committee_preferences: committeeIds
		});
		expect(refused?.message).toContain('This conference asks for');

		const { error: accepted } = await insertDraft(applicant, conferenceId, {
			committee_preferences: committeeIds.slice(0, 2)
		});
		expect(accepted).toBeNull();
	});
});

describe('the bounds on a delegation (L68)', () => {
	it('refuses a name, institution or note longer than the form allows', async () => {
		const { conferenceId } = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient();

		const { error: longName } = await createDelegation(head, conferenceId, {
			name: 'x'.repeat(121)
		});
		expect(longName?.message).toContain('delegations_name_length');

		const { error: longInstitution } = await createDelegation(head, conferenceId, {
			institution_name: 'x'.repeat(121)
		});
		expect(longInstitution?.message).toContain('delegations_institution_name_length');

		const { error: longNote } = await createDelegation(head, conferenceId, {
			note: 'x'.repeat(1001)
		});
		expect(longNote?.message).toContain('delegations_note_length');
	});

	it('accepts all three at their longest, and refuses the head who then lengthens one', async () => {
		const { conferenceId } = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient();

		const { data: delegationId, error } = await createDelegation(head, conferenceId, {
			name: 'x'.repeat(120),
			institution_name: 'y'.repeat(120),
			note: 'z'.repeat(1000)
		});
		expect(error).toBeNull();

		// The head edits their delegation straight on the table, so the bound
		// has to hold there too, not only inside create_delegation.
		const { error: refused } = await head.supabase
			.from('delegations')
			.update({ name: 'x'.repeat(121) })
			.eq('id', delegationId as string);
		expect(refused?.message).toContain('delegations_name_length');
	});
});
