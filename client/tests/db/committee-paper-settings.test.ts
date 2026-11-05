import { describe, expect, it } from 'vitest';
import { Constants } from '$lib/database.types';
import { PRESET_ROLES } from '$lib/permissions';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addChair,
	addCommittee,
	addSeat,
	createConferenceOwnedByMe,
	openForApplications
} from './conference-fixtures';
import {
	addDaisMember,
	addSeatedDelegate,
	createPaperCommittee,
	expectRefusal,
	expectSuccess,
	type PaperCommittee
} from './committee-paper-fixtures';

// A committee's resolution settings, docs/committee-papers.md section 5, and
// the Chair preset's new permission from section 8: the fourteen settings and
// the ranges they are kept to, who may change them, "Start from" and "Copy to
// other committees", the kinds of paper each format offers, and what a
// support minimum comes to in seats. What submitting a paper does with the
// settings is tested beside the paper, in committee-papers.test.ts.
//
// Every change goes through the client of the person who would make it. A
// refused update comes back empty rather than with an error, so the stored
// committee is read back past Row Level Security, and a refused function call
// is expected by its code and its words, which are what the page shows.
//
// The functions and triggers it covers, which the describe titles name:
//
//   * `protect_committees_columns` (the trigger `committees_protect_columns`)
//     lets a chair who edits only their own committee change its description,
//     agenda, format and resolution settings, and nothing else of it. The
//     people who edit every committee change the rest;
//   * `apply_committee_procedure` is "Start from": it fills every setting from
//     North American or THIMUN procedure, and leaves the format alone;
//   * `copy_committee_procedure` is "Copy to other committees": it copies
//     every setting but the format from one committee to others of its
//     conference, and only between committees the person edits;
//   * `committee_offers_paper_kind` says which kinds of paper a committee of
//     each format writes;
//   * `paper_support_needed` turns a minimum into a number of supporters. It
//     runs as whoever asks, so it counts only the seats they may see;
//   * `preset_conference_roles` is the three roles every conference is made
//     with, which $lib/permissions.ts repeats for the page. The Chair now
//     answers directives.

/** North American procedure, section 5's first column, which every new committee starts with. */
const NORTH_AMERICAN = {
	crisis_allows_resolutions: false,
	paper_words: 'sponsors_and_signatories',
	has_working_papers: true,
	sponsor_limit: 5,
	support_minimum: 20,
	support_unit: 'percent',
	support_counts_sponsors: true,
	one_sponsorship_per_topic: false,
	has_friendly_amendments: true,
	amendment_support_minimum: 10,
	amendment_support_unit: 'percent',
	preamble_amendable: false,
	has_second_degree_amendments: false,
	checks_format: true
};

/** THIMUN procedure, section 5's second column. "None" for unfriendly amendments is 0 seats. */
const THIMUN = {
	crisis_allows_resolutions: false,
	paper_words: 'submitters',
	has_working_papers: false,
	sponsor_limit: null,
	support_minimum: 3,
	support_unit: 'seats',
	support_counts_sponsors: true,
	one_sponsorship_per_topic: false,
	has_friendly_amendments: false,
	amendment_support_minimum: 0,
	amendment_support_unit: 'seats',
	preamble_amendable: false,
	has_second_degree_amendments: true,
	checks_format: true
};

/**
 * The five settings both procedures share, set the other way. A committee
 * set like this differs from either procedure in every setting, so applying
 * one has to write all fourteen for the test to see it.
 */
const NEITHER_PROCEDURE = {
	crisis_allows_resolutions: true,
	support_counts_sponsors: false,
	one_sponsorship_per_topic: true,
	preamble_amendable: true,
	checks_format: false
};

/** The two minimums, each kept in range together with its unit by one check. */
const MINIMUMS = [
	{
		name: 'support a draft resolution needs',
		minimum: 'support_minimum',
		unit: 'support_unit',
		check: 'committees_support_minimum_in_range'
	},
	{
		name: 'support an unfriendly amendment needs',
		minimum: 'amendment_support_minimum',
		unit: 'amendment_support_unit',
		check: 'committees_amendment_support_minimum_in_range'
	}
] as const;

/** A committee as the database holds it, read past Row Level Security. */
async function storedCommittee(committeeId: string) {
	const { data, error } = await createServiceRoleClient()
		.from('committees')
		.select('*')
		.eq('id', committeeId)
		.single();

	if (error || !data) throw new Error(`Could not read the stored committee: ${error?.message}`);

	return data;
}

/**
 * Changes a committee as `person`, the way the committee's settings page
 * saves, and answers what came back: the committee's id when the change was
 * made, nothing when the update policy kept the person out.
 */
function updateCommittee(
	person: SignedInClient,
	committeeId: string,
	changes: Record<string, unknown>
) {
	return person.supabase.from('committees').update(changes).eq('id', committeeId).select('id');
}

/** Changes a committee as its organiser, failing the test if the change is not made. */
async function organiserSets(
	organiser: SignedInClient,
	committeeId: string,
	changes: Record<string, unknown>
): Promise<void> {
	const { data, error } = await updateCommittee(organiser, committeeId, changes);

	if (error || data?.length !== 1)
		throw new Error(`Could not change the fixture committee: ${error?.message}`);
}

/** "Start from" as `person`, and what apply_committee_procedure answered. */
function applyProcedure(person: SignedInClient, committeeId: string, procedureName: string) {
	return person.supabase.rpc('apply_committee_procedure', {
		committee_id: committeeId,
		procedure_name: procedureName
	});
}

/** "Copy to other committees" as `person`, and what copy_committee_procedure answered. */
function copyProcedure(person: SignedInClient, fromCommitteeId: string, toCommitteeIds: string[]) {
	return person.supabase.rpc('copy_committee_procedure', {
		from_committee_id: fromCommitteeId,
		to_committee_ids: toCommitteeIds
	});
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

/**
 * Makes the room's chair a chair of another committee as well. Their Chair
 * role already reaches every committee they are assigned to, so the
 * assignment is all it takes.
 */
async function assignChairToo(committee: PaperCommittee, committeeId: string): Promise<void> {
	const { error } = await committee.supabase
		.from('committee_chairs')
		.insert({ committee_id: committeeId, user_id: committee.chair.userId });

	if (error) throw new Error(`Could not assign the fixture chair: ${error.message}`);
}

/**
 * A committee of a second conference in the same organisation. The organiser
 * edits it too, so only the rule that a procedure is copied within one
 * conference keeps it out.
 */
async function committeeOfAnotherConference(committee: PaperCommittee): Promise<string> {
	const { data: conference, error } = await committee.supabase
		.from('conferences')
		.insert({
			name: 'Second Fixture Conference',
			slug: `second-fixture-conference-${crypto.randomUUID()}`,
			city: 'Utrecht',
			country_code: 'NL',
			start_date: '2020-03-01',
			end_date: '2020-03-03',
			organization_id: committee.organizationId,
			created_by: committee.userId
		})
		.select('id')
		.single();

	if (error || !conference)
		throw new Error(`Could not create the second fixture conference: ${error?.message}`);

	return addCommittee(committee.supabase, conference.id);
}

/** What paper_support_needed answers `reader` for a minimum in this unit. */
async function supportNeeded(
	reader: SignedInClient,
	committeeId: string,
	minimum: number,
	unit: 'seats' | 'percent'
): Promise<number> {
	const { data, error } = await reader.supabase.rpc('paper_support_needed', {
		committee_id: committeeId,
		minimum,
		unit
	});

	if (error) throw new Error(`Could not ask for the support needed: ${error.message}`);

	return data;
}

/** The kinds committee_offers_paper_kind says a committee like this writes, in the enum's order. */
async function offeredKinds(
	person: SignedInClient,
	format: 'standard' | 'crisis',
	crisisAllowsResolutions: boolean
): Promise<string[]> {
	const kinds: string[] = [];

	for (const kind of Constants.public.Enums.paper_kind) {
		const { data, error } = await person.supabase.rpc('committee_offers_paper_kind', {
			format,
			crisis_allows_resolutions: crisisAllowsResolutions,
			kind
		});

		if (error) throw new Error(`Could not ask which kinds are offered: ${error.message}`);

		if (data === true) kinds.push(kind);
	}

	return kinds;
}

describe('the resolution settings of a committee', () => {
	it('start as North American procedure, in a standard committee', async () => {
		const organiser = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);

		expect(await storedCommittee(committeeId)).toMatchObject({
			format: 'standard',
			...NORTH_AMERICAN
		});
	});

	it('keep the most sponsors between 1 and 1,000, or set no limit at all', async () => {
		const organiser = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);

		for (const sponsorLimit of [0, -1, 1001]) {
			await expectRefusal(
				updateCommittee(organiser, committeeId, { sponsor_limit: sponsorLimit }),
				'23514',
				'new row for relation "committees" violates check constraint "committees_sponsor_limit_in_range"'
			);
		}

		for (const sponsorLimit of [1, 1000, null]) {
			await organiserSets(organiser, committeeId, { sponsor_limit: sponsorLimit });

			expect((await storedCommittee(committeeId)).sponsor_limit).toBe(sponsorLimit);
		}
	});

	for (const { name, minimum, unit, check } of MINIMUMS) {
		it(`keep the ${name} to a share of at most 100%, or to at most 1,000 seats`, async () => {
			const organiser = await createConferenceOwnedByMe();
			const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
			const refusal = `new row for relation "committees" violates check constraint "${check}"`;
			const outOfRange = [
				{ value: 101, inUnit: 'percent' },
				{ value: -1, inUnit: 'percent' },
				{ value: -1, inUnit: 'seats' },
				{ value: 1001, inUnit: 'seats' }
			];
			const inRange = [
				{ value: 0, inUnit: 'percent' },
				{ value: 100, inUnit: 'percent' },
				{ value: 0, inUnit: 'seats' },
				{ value: 101, inUnit: 'seats' },
				{ value: 1000, inUnit: 'seats' }
			];

			for (const { value, inUnit } of outOfRange) {
				await expectRefusal(
					updateCommittee(organiser, committeeId, { [minimum]: value, [unit]: inUnit }),
					'23514',
					refusal
				);
			}

			for (const { value, inUnit } of inRange) {
				await organiserSets(organiser, committeeId, { [minimum]: value, [unit]: inUnit });

				expect(await storedCommittee(committeeId)).toMatchObject({
					[minimum]: value,
					[unit]: inUnit
				});
			}

			// The check reads the two together, so 1,000 seats cannot turn into 1,000%.
			await expectRefusal(
				updateCommittee(organiser, committeeId, { [unit]: 'percent' }),
				'23514',
				refusal
			);
		});
	}
});

describe('changing the settings (protect_committees_columns)', () => {
	it('lets a chair who edits only their own committee change its settings, description and agenda', async () => {
		const committee = await createPaperCommittee();
		const changes = {
			format: 'crisis',
			description: 'The cabinet of 1914.',
			topics: ['The July Crisis'],
			...THIMUN,
			...NEITHER_PROCEDURE
		};

		expect(await updateCommittee(committee.chair, committee.committeeId, changes)).toMatchObject({
			error: null,
			data: [{ id: committee.committeeId }]
		});
		expect(await storedCommittee(committee.committeeId)).toMatchObject(changes);
	});

	it('stops that chair changing anything else of the committee, with the settings or without', async () => {
		const committee = await createPaperCommittee();
		const before = await storedCommittee(committee.committeeId);
		const otherChanges: Record<string, unknown>[] = [
			{ name: 'Crisis Cabinet' },
			{ abbreviation: 'CC' },
			{ room: 'Room 2' },
			{ position: 7 },
			{ default_speaking_time_seconds: 75 },
			{ level: 'advanced' },
			{ planned_seat_count: 30 },
			{ slug: `crisis-cabinet-${crypto.randomUUID()}` }
		];

		for (const change of otherChanges) {
			for (const changes of [change, { ...THIMUN, ...change }]) {
				await expectRefusal(
					updateCommittee(committee.chair, committee.committeeId, changes),
					'P0001',
					'Only the people who edit every committee can change more than its description, agenda and resolution settings'
				);
			}
		}

		expect(await storedCommittee(committee.committeeId)).toEqual(before);

		// The organiser edits every committee, so the same change is theirs to make.
		await organiserSets(committee, committee.committeeId, { name: 'Crisis Cabinet' });
		expect((await storedCommittee(committee.committeeId)).name).toBe('Crisis Cabinet');
	});

	it('leaves out the chair of another committee, and a delegate', async () => {
		const committee = await createPaperCommittee();
		const generalAssemblyId = await addCommittee(
			committee.supabase,
			committee.conferenceId,
			'General Assembly'
		);

		expect(await updateCommittee(committee.chair, generalAssemblyId, THIMUN)).toMatchObject({
			error: null,
			data: []
		});
		expect(await updateCommittee(committee.france, committee.committeeId, THIMUN)).toMatchObject({
			error: null,
			data: []
		});

		expect(await storedCommittee(generalAssemblyId)).toMatchObject(NORTH_AMERICAN);
		expect(await storedCommittee(committee.committeeId)).toMatchObject(NORTH_AMERICAN);
	});
});

describe('apply_committee_procedure', () => {
	it('fills every setting from THIMUN procedure, and leaves the format', async () => {
		const committee = await createPaperCommittee();
		await organiserSets(committee, committee.committeeId, {
			format: 'crisis',
			...NEITHER_PROCEDURE
		});

		await expectSuccess(applyProcedure(committee.chair, committee.committeeId, 'thimun'));

		expect(await storedCommittee(committee.committeeId)).toMatchObject({
			format: 'crisis',
			...THIMUN
		});
	});

	it('fills every setting back from North American procedure', async () => {
		const committee = await createPaperCommittee();
		await organiserSets(committee, committee.committeeId, { ...THIMUN, ...NEITHER_PROCEDURE });

		await expectSuccess(applyProcedure(committee.chair, committee.committeeId, 'north_american'));

		expect(await storedCommittee(committee.committeeId)).toMatchObject({
			format: 'standard',
			...NORTH_AMERICAN
		});
	});

	it('is pressed only by the people who edit the committee, with a procedure it knows', async () => {
		const committee = await createPaperCommittee();
		const daisMember = await addDaisMember(committee);
		const otherChair = await chairOfAnotherCommittee(committee);
		const before = await storedCommittee(committee.committeeId);

		for (const person of [committee.france, daisMember, otherChair]) {
			await expectRefusal(
				applyProcedure(person, committee.committeeId, 'thimun'),
				'42501',
				'Only the people who edit this committee can change its procedure.'
			);
		}

		// A committee that does not exist is refused in the same words, even to the organiser.
		await expectRefusal(
			applyProcedure(committee, crypto.randomUUID(), 'thimun'),
			'42501',
			'Only the people who edit this committee can change its procedure.'
		);
		await expectRefusal(
			applyProcedure(committee.chair, committee.committeeId, 'custom'),
			'22023',
			'Choose North American or THIMUN procedure.'
		);

		expect(await storedCommittee(committee.committeeId)).toEqual(before);
	});
});

describe('copy_committee_procedure', () => {
	it('copies every setting but the format to the committees chosen', async () => {
		const committee = await createPaperCommittee();
		const generalAssemblyId = await addCommittee(
			committee.supabase,
			committee.conferenceId,
			'General Assembly'
		);
		const humanRightsCouncilId = await addCommittee(
			committee.supabase,
			committee.conferenceId,
			'Human Rights Council'
		);
		const economicAndSocialCouncilId = await addCommittee(
			committee.supabase,
			committee.conferenceId,
			'Economic and Social Council'
		);
		// Every setting differs from North American procedure, which the other
		// committees start with, so a setting left behind shows.
		const settings = { ...THIMUN, ...NEITHER_PROCEDURE, sponsor_limit: 8, support_minimum: 4 };
		await organiserSets(committee, committee.committeeId, { format: 'crisis', ...settings });

		// The committee copied from may be among those chosen; it stays as it is.
		await expectSuccess(
			copyProcedure(committee, committee.committeeId, [
				committee.committeeId,
				generalAssemblyId,
				humanRightsCouncilId
			])
		);

		expect(await storedCommittee(generalAssemblyId)).toMatchObject({
			format: 'standard',
			...settings
		});
		expect(await storedCommittee(humanRightsCouncilId)).toMatchObject({
			format: 'standard',
			...settings
		});
		expect(await storedCommittee(committee.committeeId)).toMatchObject({
			format: 'crisis',
			...settings
		});
		expect(await storedCommittee(economicAndSocialCouncilId)).toMatchObject({
			format: 'standard',
			...NORTH_AMERICAN
		});
	});

	it('copies only between committees the person edits, all or nothing', async () => {
		const committee = await createPaperCommittee();
		const generalAssemblyId = await addCommittee(
			committee.supabase,
			committee.conferenceId,
			'General Assembly'
		);
		const humanRightsCouncilId = await addCommittee(
			committee.supabase,
			committee.conferenceId,
			'Human Rights Council'
		);
		// The chair edits their own room and the General Assembly, and not the
		// Human Rights Council.
		await assignChairToo(committee, generalAssemblyId);
		await organiserSets(committee, committee.committeeId, THIMUN);
		const refusal = 'Only the people who edit these committees can copy a procedure between them.';

		await expectRefusal(
			copyProcedure(committee.chair, committee.committeeId, [
				generalAssemblyId,
				humanRightsCouncilId
			]),
			'42501',
			refusal
		);
		await expectRefusal(
			copyProcedure(committee.chair, humanRightsCouncilId, [generalAssemblyId]),
			'42501',
			refusal
		);
		await expectRefusal(
			copyProcedure(committee.france, committee.committeeId, [generalAssemblyId]),
			'42501',
			refusal
		);
		expect(await storedCommittee(generalAssemblyId)).toMatchObject(NORTH_AMERICAN);

		await expectSuccess(copyProcedure(committee.chair, committee.committeeId, [generalAssemblyId]));
		expect(await storedCommittee(generalAssemblyId)).toMatchObject(THIMUN);
		expect(await storedCommittee(humanRightsCouncilId)).toMatchObject(NORTH_AMERICAN);
	});

	it('copies only within one conference, between committees that exist', async () => {
		const committee = await createPaperCommittee();
		const generalAssemblyId = await addCommittee(
			committee.supabase,
			committee.conferenceId,
			'General Assembly'
		);
		const elsewhereId = await committeeOfAnotherConference(committee);
		await organiserSets(committee, committee.committeeId, THIMUN);
		const refusal = 'Only the people who edit these committees can copy a procedure between them.';

		await expectRefusal(
			copyProcedure(committee, committee.committeeId, [elsewhereId]),
			'42501',
			refusal
		);
		await expectRefusal(
			copyProcedure(committee, committee.committeeId, [generalAssemblyId, crypto.randomUUID()]),
			'42501',
			refusal
		);
		await expectRefusal(
			copyProcedure(committee, crypto.randomUUID(), [generalAssemblyId]),
			'42501',
			refusal
		);

		expect(await storedCommittee(generalAssemblyId)).toMatchObject(NORTH_AMERICAN);
		expect(await storedCommittee(elsewhereId)).toMatchObject(NORTH_AMERICAN);
	});
});

describe('committee_offers_paper_kind', () => {
	const STANDARD_KINDS = ['working_paper', 'draft_resolution'];
	const CRISIS_KINDS = [
		'committee_directive',
		'joint_directive',
		'personal_directive',
		'press_release'
	];

	it('offers a standard committee working papers and draft resolutions, whatever the crisis setting', async () => {
		const person = await createSignedInClient();

		expect(await offeredKinds(person, 'standard', false)).toEqual(STANDARD_KINDS);
		expect(await offeredKinds(person, 'standard', true)).toEqual(STANDARD_KINDS);
	});

	it('offers a crisis committee the four crisis kinds, and the standard two only once allowed', async () => {
		const person = await createSignedInClient();

		expect(await offeredKinds(person, 'crisis', false)).toEqual(CRISIS_KINDS);
		expect(await offeredKinds(person, 'crisis', true)).toEqual([
			...STANDARD_KINDS,
			...CRISIS_KINDS
		]);
	});
});

describe('paper_support_needed', () => {
	it('is the minimum itself when it is in seats', async () => {
		const committee = await createPaperCommittee();

		for (const minimum of [0, 3, 40]) {
			expect(await supportNeeded(committee, committee.committeeId, minimum, 'seats')).toBe(minimum);
		}
	});

	it('is a share of the seats that have a delegate, rounded up, leaving empty seats out', async () => {
		const committee = await createPaperCommittee();
		await addSeatedDelegate(committee, 'Italy', 'IT');
		await addSeat(committee.supabase, committee.committeeId, 'Japan', 'JP');
		// France, Germany and Italy hold three of the four seats; Japan's is empty.
		const shares = [
			{ percent: 0, needed: 0 },
			{ percent: 20, needed: 1 },
			{ percent: 34, needed: 2 },
			{ percent: 60, needed: 2 },
			{ percent: 67, needed: 3 },
			{ percent: 100, needed: 3 }
		];

		// The organiser and the chair see every seat of the committee.
		for (const reader of [committee, committee.chair]) {
			for (const { percent, needed } of shares) {
				expect(await supportNeeded(reader, committee.committeeId, percent, 'percent')).toBe(needed);
			}
		}
	});

	it('counts the seats its reader may see: all of them for a delegate, none for a stranger', async () => {
		const committee = await createPaperCommittee();
		// A delegate sees the seats of a published conference only.
		await openForApplications(committee.supabase, committee.conferenceId);
		const stranger = await createSignedInClient('Stranger');

		expect(await supportNeeded(committee.france, committee.committeeId, 100, 'percent')).toBe(2);
		expect(await supportNeeded(stranger, committee.committeeId, 100, 'percent')).toBe(0);
	});
});

describe('preset_conference_roles', () => {
	it('makes the roles $lib/permissions.ts lists, the Chair among them answering directives', async () => {
		const person = await createSignedInClient();
		const { data, error } = await person.supabase.rpc('preset_conference_roles');

		expect(error).toBeNull();

		const roles: { name: string; role_position: number; permissions: string[] }[] = [...data].sort(
			(first, second) => first.role_position - second.role_position
		);

		expect(roles).toEqual(
			PRESET_ROLES.map((role, position) => ({
				name: role.name,
				role_position: position,
				scope: role.scope,
				permissions: role.permissions,
				is_public: role.isPublic
			}))
		);
		expect(roles.find((role) => role.name === 'Chair')?.permissions).toContain('answer_directives');
	});
});
