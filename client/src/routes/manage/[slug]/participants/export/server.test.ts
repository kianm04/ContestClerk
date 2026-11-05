import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './+server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape the handler is given.
import type { RequestEvent } from './$types';
import type { Conference } from '$lib/conferences';
import type { Participant, ParticipantExportRow } from '$lib/participants';
import type { MyPermissions } from '$lib/permissions';

// The gate and the two readers are stood in for, so these tests are about what
// the endpoint itself does: who it lets in, which rows go into the file, and
// what it answers with. `$lib/participants` and `$lib/csv` are the real ones,
// which is what proves the file is built from the rows the filters matched.
vi.mock('$lib/server/access', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/access')>()),
	requireTeamMember: vi.fn()
}));

vi.mock('$lib/server/participants', () => ({
	listParticipants: vi.fn(),
	withExportDetails: vi.fn()
}));

import { requireTeamMember } from '$lib/server/access';
import { listParticipants, withExportDetails } from '$lib/server/participants';

const SUPABASE = {};

const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: 0
};

/** A registration desk: every participant and their welfare details, nothing else. */
const DESK: MyPermissions = {
	held: [
		{ permission: 'read_participants', scope: 'conference' },
		{ permission: 'read_welfare_details', scope: 'conference' }
	],
	committeeIds: [],
	rank: 2
};

/** A chair of another committee than the one both delegates sit in. */
const OTHER_CHAIR: MyPermissions = {
	held: [{ permission: 'read_participants', scope: 'committees' }],
	committeeIds: ['committee-hrc'],
	rank: 1
};

/** The gate lets this reader in with these permissions. */
function signedInAs(permissions: MyPermissions) {
	vi.mocked(requireTeamMember).mockResolvedValue({
		user: { id: 'user-reader', email: 'reader@example.com' },
		conference: CONFERENCE,
		permissions
	} as unknown as Awaited<ReturnType<typeof requireTeamMember>>);
}

const CONFERENCE = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027',
	timezone: 'Europe/Warsaw',
	startDate: '2027-01-28'
} as unknown as Conference;

const EXPORT_PATH = '/manage/riverside-mun-2027/participants/export';

const UNSC = { id: 'committee-unsc', name: 'Security Council', abbreviation: 'UNSC' };

const ANNA: Participant = {
	seatId: 'seat-france',
	seatName: 'France',
	seatKind: 'country',
	seatCountryCode: 'FR',
	committee: UNSC,
	userId: 'user-anna',
	fullName: 'Anna Kowalski',
	pronouns: null,
	avatarPath: null,
	institutionName: 'Lyceum 7, Warsaw',
	countryCode: 'PL',
	experienceLevel: 'intermediate',
	delegation: null,
	applicationId: 'application-anna',
	invoice: {
		id: 'invoice-1',
		number: 'T-0001',
		status: 'unpaid',
		paidAt: null,
		isGroupInvoice: false
	},
	paperStatus: 'missing'
};

const ZOFIA: Participant = {
	...ANNA,
	seatId: 'seat-germany',
	seatName: 'Germany',
	userId: 'user-zofia',
	fullName: 'Zofia Nowak',
	invoice: null,
	paperStatus: 'approved'
};

/** What the private-details reader adds, for whichever participants it was given. */
function withPrivateDetails(participants: Participant[]): ParticipantExportRow[] {
	return participants.map((participant) => ({
		...participant,
		email: `${participant.userId}@example.com`,
		dateOfBirth: '2008-04-11',
		phone: null,
		dietaryRequirements: null,
		emergencyContactName: null,
		emergencyContactPhone: null,
		delegationHeadName: null,
		awardTitles: []
	}));
}

function makeEvent(search: string = ''): RequestEvent {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost${EXPORT_PATH}${search}`),
		locals: { supabase: SUPABASE }
	} as unknown as RequestEvent;
}

beforeEach(() => {
	vi.clearAllMocks();

	signedInAs(ADMINISTRATOR);
	vi.mocked(listParticipants).mockResolvedValue([ZOFIA, ANNA]);
	vi.mocked(withExportDetails).mockImplementation(async (_supabase, participants) =>
		withPrivateDetails(participants)
	);
});

describe('GET', () => {
	it('is a 404 for anybody outside the team, and reads nothing', async () => {
		vi.mocked(requireTeamMember).mockRejectedValue({ status: 404 });

		await expect(GET(makeEvent())).rejects.toEqual({ status: 404 });
		expect(listParticipants).not.toHaveBeenCalled();
		expect(withExportDetails).not.toHaveBeenCalled();
	});

	it('is a 404 for a team member whose permissions do not open the participants', async () => {
		signedInAs({ ...ADMINISTRATOR, held: [{ permission: 'manage_team', scope: 'conference' }] });

		await expect(GET(makeEvent())).rejects.toMatchObject({ status: 404 });
		expect(listParticipants).not.toHaveBeenCalled();
		expect(withExportDetails).not.toHaveBeenCalled();
	});

	it('hands the browser a CSV file named after the conference', async () => {
		const response = await GET(makeEvent());

		expect(response.headers.get('content-type')).toContain('text/csv');
		expect(response.headers.get('content-disposition')).toMatch(
			/^attachment; filename="participants-riverside-mun-2027-\d{4}-\d{2}-\d{2}\.csv"$/
		);
	});

	it('writes only the rows the filters match, sorted as asked, private columns included', async () => {
		const response = await GET(makeEvent('?paper=missing&page=2'));
		const text = await response.text();
		const lines = text.trim().split(/\r?\n/);

		// The page is ignored: the file holds every match, not one page of them. The
		// reader's permissions on this conference go along, so a detail the views
		// answered through another conference is nulled before it is written.
		expect(withExportDetails).toHaveBeenCalledWith(SUPABASE, [ANNA], ADMINISTRATOR);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toContain('Email');
		expect(lines[0]).toContain('Emergency contact phone');
		expect(lines[1]).toContain('user-anna@example.com');
		// The comma in the institution is quoted, so it stays one cell.
		expect(lines[1]).toContain('"Lyceum 7, Warsaw"');
	});

	it('sorts the file the way the table was sorted', async () => {
		await GET(makeEvent('?sort=name'));

		expect(withExportDetails).toHaveBeenCalledWith(SUPABASE, [ANNA, ZOFIA], ADMINISTRATOR);
	});

	it('leaves out the columns the desk may not see, and ignores their filters', async () => {
		signedInAs(DESK);

		const response = await GET(makeEvent('?paper=missing&sort=name'));
		const header = (await response.text()).split(/\r?\n/)[0];

		// The paper filter is dropped with its column, so both delegates are in the file.
		expect(withExportDetails).toHaveBeenCalledWith(SUPABASE, [ANNA, ZOFIA], DESK);
		expect(header).toContain('Date of birth');
		expect(header).not.toContain('Email');
		expect(header).not.toContain('Invoice status');
		expect(header).not.toContain('Paper status');
	});

	it('holds only the committees where a chair reads the participants', async () => {
		signedInAs(OTHER_CHAIR);

		await GET(makeEvent());

		expect(withExportDetails).toHaveBeenCalledWith(SUPABASE, [], OTHER_CHAIR);
	});
});
