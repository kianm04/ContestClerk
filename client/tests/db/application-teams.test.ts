import { describe, expect, it } from 'vitest';
import { createSignedInClient, type SignedInClient } from './supabase-test-client';
import {
	addApplication,
	addCommittee,
	addSeat,
	createOpenConferenceOwnedByMe,
	type ConferenceFixture
} from './conference-fixtures';

// Migration 20261010120000_application_teams.sql (Trello pZNcdPqU): friends
// applying to represent one country together. An applicant starts, joins and
// leaves a team; an organiser teams two applications or takes one out; and
// accept_application_team seats a whole team in one country, a committee each.

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

/** The team an application is in, read as the organiser. */
async function teamOf(conference: ConferenceFixture, applicationId: string) {
	const { data } = await conference.supabase
		.from('applications')
		.select('team_id')
		.eq('id', applicationId)
		.single();

	return data?.team_id ?? null;
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

describe('an applicant and their team', () => {
	it('starts a team, and a friend joins it with the code in small letters', async () => {
		const { conference, committeeId, applicant } = await createConferenceWithApplicant();
		const friend = await addApplicant(conference, committeeId, 'Kian Matton');

		const code = await startTeam(applicant);
		expect(code).toMatch(/^[A-Z2-9]{8}$/);

		const { error } = await friend.supabase.rpc('join_application_team', {
			application_id: friend.applicationId,
			code: ` ${code.toLowerCase()} `
		});
		expect(error).toBeNull();

		const teamId = await teamOf(conference, applicant.applicationId);
		expect(teamId).not.toBeNull();
		expect(await teamOf(conference, friend.applicationId)).toBe(teamId);

		// Each member reads the names of the whole team, and nothing else.
		const { data: names } = await friend.supabase.rpc('application_team_names', {
			team_id: teamId as string
		});
		expect(names?.map((row: { full_name: string }) => row.full_name)).toEqual([
			'Umarbek Ismoilov',
			'Kian Matton'
		]);
	});

	it('tells a stranger nothing about who is in a team', async () => {
		const { conference, committeeId, applicant } = await createConferenceWithApplicant();
		const friend = await addApplicant(conference, committeeId, 'Kian Matton');
		const code = await startTeam(applicant);
		await friend.supabase.rpc('join_application_team', {
			application_id: friend.applicationId,
			code
		});
		const teamId = (await teamOf(conference, applicant.applicationId)) as string;

		const stranger = await createSignedInClient();
		const { data: names } = await stranger.supabase.rpc('application_team_names', {
			team_id: teamId
		});
		expect(names).toEqual([]);

		const { data: teams } = await stranger.supabase
			.from('application_teams')
			.select('join_code')
			.eq('id', teamId);
		expect(teams).toEqual([]);
	});

	it('answers nothing to a code from another conference', async () => {
		const { applicant } = await createConferenceWithApplicant();
		const code = await startTeam(applicant);

		// A code that matches no team at this conference is answered with null
		// and counted towards the hourly cap (20261022141000, L25); the page
		// turns the null into its sentence. security-codes-and-shape-checks.test.ts
		// has the cap itself.
		const other = await createConferenceWithApplicant('Kian Matton');
		const { data, error } = await other.applicant.supabase.rpc('join_application_team', {
			application_id: other.applicant.applicationId,
			code
		});
		expect(error).toBeNull();
		expect(data).toBeNull();
		expect(await teamOf(other.conference, other.applicant.applicationId)).toBeNull();
	});

	it('refuses to start a team for somebody else’s application', async () => {
		const { conference, committeeId, applicant } = await createConferenceWithApplicant();
		const other = await addApplicant(conference, committeeId, 'Kian Matton');

		const { error } = await other.supabase.rpc('start_application_team', {
			application_id: applicant.applicationId
		});
		expect(error?.message).toContain('does not exist');
	});

	it('dissolves a team of two once one of them leaves', async () => {
		const { conference, committeeId, applicant } = await createConferenceWithApplicant();
		const friend = await addApplicant(conference, committeeId, 'Kian Matton');
		const code = await startTeam(applicant);
		await friend.supabase.rpc('join_application_team', {
			application_id: friend.applicationId,
			code
		});

		const { error } = await friend.supabase.rpc('leave_application_team', {
			application_id: friend.applicationId
		});
		expect(error).toBeNull();

		expect(await teamOf(conference, friend.applicationId)).toBeNull();
		expect(await teamOf(conference, applicant.applicationId)).toBeNull();
	});

	it('keeps the three helpers behind those functions out of reach', async () => {
		const { conference, applicant } = await createConferenceWithApplicant();
		const code = await startTeam(applicant);
		const teamId = (await teamOf(conference, applicant.applicationId)) as string;

		// new_application_team makes a code, dissolve_lonely_application_team
		// deletes a team, own_open_application reads an application: each only
		// ever runs inside the checks of the functions above.
		const calls = await Promise.all([
			applicant.supabase.rpc('new_application_team', { conference_id: conference.conferenceId }),
			applicant.supabase.rpc('dissolve_lonely_application_team', { team_id: teamId }),
			applicant.supabase.rpc('own_open_application', { application_id: applicant.applicationId })
		]);

		for (const { error } of calls) {
			expect(error?.message).toContain('permission denied');
		}
		expect(code).toMatch(/^[A-Z2-9]{8}$/);
	});

	it('never lets an applicant write team_id themselves', async () => {
		const { conference, committeeId, applicant } = await createConferenceWithApplicant();
		const friend = await addApplicant(conference, committeeId, 'Kian Matton');
		await startTeam(friend);
		const friendTeamId = await teamOf(conference, friend.applicationId);

		const { error } = await applicant.supabase
			.from('applications')
			.update({ team_id: friendTeamId })
			.eq('id', applicant.applicationId);
		expect(error?.message).toContain('can only change their own answers');
	});
});

describe('an organiser and the teams', () => {
	it('teams two people who applied separately, then splits them again', async () => {
		const { conference, committeeId, applicant } = await createConferenceWithApplicant();
		const other = await addApplicant(conference, committeeId, 'Kian Matton');

		const { error: teamError } = await conference.supabase.rpc('team_applications', {
			application_id: applicant.applicationId,
			partner_application_id: other.applicationId
		});
		expect(teamError).toBeNull();

		const teamId = await teamOf(conference, applicant.applicationId);
		expect(teamId).not.toBeNull();
		expect(await teamOf(conference, other.applicationId)).toBe(teamId);

		const { error: splitError } = await conference.supabase.rpc('remove_application_from_team', {
			application_id: other.applicationId
		});
		expect(splitError).toBeNull();
		expect(await teamOf(conference, applicant.applicationId)).toBeNull();
		expect(await teamOf(conference, other.applicationId)).toBeNull();
	});

	it('adds a third person to an existing team', async () => {
		const { conference, committeeId, applicant } = await createConferenceWithApplicant();
		const second = await addApplicant(conference, committeeId, 'Kian Matton');
		const third = await addApplicant(conference, committeeId, 'Amara Okafor');
		await conference.supabase.rpc('team_applications', {
			application_id: applicant.applicationId,
			partner_application_id: second.applicationId
		});

		await conference.supabase.rpc('team_applications', {
			application_id: second.applicationId,
			partner_application_id: third.applicationId
		});

		const teamId = await teamOf(conference, applicant.applicationId);
		expect(await teamOf(conference, third.applicationId)).toBe(teamId);
	});

	it('refuses somebody who does not decide the conference’s applications', async () => {
		const { conference, committeeId, applicant } = await createConferenceWithApplicant();
		const other = await addApplicant(conference, committeeId, 'Kian Matton');

		const { error } = await other.supabase.rpc('team_applications', {
			application_id: applicant.applicationId,
			partner_application_id: other.applicationId
		});
		expect(error?.message).toContain('Only the organisers');

		const { error: organiserOnly } = await applicant.supabase.rpc('remove_application_from_team', {
			application_id: applicant.applicationId
		});
		expect(organiserOnly?.message).toContain('Only the organisers');
	});
});

describe('accept_application_team', () => {
	/** A team of two who both asked for the first committee, and Kenya in two committees. */
	async function createTeamAndSeats() {
		const { conference, committeeId, applicant } = await createConferenceWithApplicant();
		const friend = await addApplicant(conference, committeeId, 'Kian Matton');
		await conference.supabase.rpc('team_applications', {
			application_id: applicant.applicationId,
			partner_application_id: friend.applicationId
		});

		const secondCommitteeId = await addCommittee(
			conference.supabase,
			conference.conferenceId,
			'Human Rights Council'
		);
		const kenyaFirst = await addSeat(conference.supabase, committeeId, 'Kenya', 'KE');
		const kenyaSecond = await addSeat(conference.supabase, secondCommitteeId, 'Kenya', 'KE');
		const japanSecond = await addSeat(conference.supabase, secondCommitteeId, 'Japan', 'JP');

		return { conference, applicant, friend, kenyaFirst, kenyaSecond, japanSecond };
	}

	it('accepts every member into one country, a committee each', async () => {
		const { conference, applicant, friend, kenyaFirst, kenyaSecond } = await createTeamAndSeats();

		const { error } = await conference.supabase.rpc('accept_application_team', {
			application_ids: [applicant.applicationId, friend.applicationId],
			seat_ids: [kenyaFirst, kenyaSecond]
		});
		expect(error).toBeNull();

		const { data: seats } = await conference.supabase
			.from('seats')
			.select('id, user_id')
			.in('id', [kenyaFirst, kenyaSecond])
			.order('id');
		const holders = new Map(seats?.map((seat) => [seat.id, seat.user_id]));
		expect(holders.get(kenyaFirst)).toBe(applicant.userId);
		expect(holders.get(kenyaSecond)).toBe(friend.userId);
	});

	it('refuses two countries, and accepts nobody', async () => {
		const { conference, applicant, friend, kenyaFirst, japanSecond } = await createTeamAndSeats();

		const { error } = await conference.supabase.rpc('accept_application_team', {
			application_ids: [applicant.applicationId, friend.applicationId],
			seat_ids: [kenyaFirst, japanSecond]
		});
		expect(error?.message).toContain('one country');

		const { data } = await conference.supabase
			.from('applications')
			.select('status')
			.in('id', [applicant.applicationId, friend.applicationId]);
		expect(data?.map((row) => row.status)).toEqual(['submitted', 'submitted']);
	});

	it('accepts nobody when one of the seats has just been taken', async () => {
		const { conference, applicant, friend, kenyaFirst, kenyaSecond } = await createTeamAndSeats();
		const committeeId = (
			await conference.supabase.from('seats').select('committee_id').eq('id', kenyaFirst).single()
		).data?.committee_id as string;
		const latecomer = await addApplicant(conference, committeeId, 'Amara Okafor');
		await conference.supabase.rpc('accept_application', {
			application_id: latecomer.applicationId,
			seat_id: kenyaSecond
		});

		const { error } = await conference.supabase.rpc('accept_application_team', {
			application_ids: [applicant.applicationId, friend.applicationId],
			seat_ids: [kenyaFirst, kenyaSecond]
		});
		expect(error?.message).toContain('not free');

		const { data: seat } = await conference.supabase
			.from('seats')
			.select('user_id')
			.eq('id', kenyaFirst)
			.single();
		expect(seat?.user_id).toBeNull();
	});

	it('refuses applications that are not one team', async () => {
		const { conference, applicant, kenyaFirst, kenyaSecond } = await createTeamAndSeats();
		const committeeId = await addCommittee(conference.supabase, conference.conferenceId, 'DISEC');
		const loner = await addApplicant(conference, committeeId, 'Amara Okafor');

		const { error } = await conference.supabase.rpc('accept_application_team', {
			application_ids: [applicant.applicationId, loner.applicationId],
			seat_ids: [kenyaFirst, kenyaSecond]
		});
		expect(error?.message).toContain('not one team');
	});
});
