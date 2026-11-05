import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './+server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape the handler is given.
import type { RequestEvent } from './$types';
import type { ApplicationQuestion } from '$lib/application-questions';
import type { ApplicationExportRow } from '$lib/applications';
import type { Conference } from '$lib/conferences';

// The gate and the three queries are stood in for, so these tests are about
// what the endpoint itself does: who it lets in, which rows it asks for, and
// what it answers with. `requireTeamMember` has its own tests in
// `src/lib/server/access`, and what the database allows is tested in
// `tests/db/`.
//
// `$lib/applications` and `$lib/csv` are deliberately not stood in for: they
// are pure, and running the real ones is what proves the file the organiser
// downloads really is built from the rows the filter matched.
vi.mock('$lib/server/access', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/access')>();

	// The real page check, wrapped so one test can let in a reader the table does not yet.
	return {
		...actual,
		requireTeamMember: vi.fn(),
		requireManagePage: vi.fn(actual.requireManagePage)
	};
});

vi.mock('$lib/server/application-table', () => ({ listApplicationsForExport: vi.fn() }));

vi.mock('$lib/server/application-questions', () => ({ listApplicationQuestions: vi.fn() }));

vi.mock('$lib/server/application-form-settings', () => ({ readApplicationFormSettings: vi.fn() }));

import { requireManagePage, requireTeamMember } from '$lib/server/access';
import type { MyPermissions } from '$lib/permissions';
import { readApplicationFormSettings } from '$lib/server/application-form-settings';
import { listApplicationQuestions } from '$lib/server/application-questions';
import { listApplicationsForExport } from '$lib/server/application-table';

/** The Supabase client. The handler only hands it on. */
const SUPABASE = {};

const SIGNED_IN_USER = { id: 'user-organiser', email: 'daniel@example.com' };

const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: 0
};

/** The gate lets this reader in with these permissions. */
function signedInAs(permissions: MyPermissions) {
	vi.mocked(requireTeamMember).mockResolvedValue({
		user: SIGNED_IN_USER,
		conference: CONFERENCE,
		permissions
	} as unknown as Awaited<ReturnType<typeof requireTeamMember>>);
}

/** The conference. Its slug names the file and its timezone dates it. */
const CONFERENCE = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027',
	timezone: 'Europe/Warsaw'
} as unknown as Conference;

const EXPORT_PATH = '/manage/riverside-mun-2027/applications/export';

/** One custom question, so the file has a column the conference added itself. */
const DIETARY_QUESTION: ApplicationQuestion = {
	id: 'question-experience',
	label: 'Which conferences have you attended?',
	helpText: null,
	type: 'long_text',
	options: [],
	isRequired: false,
	position: 1
};

/** One applicant, with a comma in a cell so the quoting is exercised too. */
const ANNA: ApplicationExportRow = {
	applicantName: 'Anna Kowalski',
	email: 'anna@example.com',
	institutionName: 'Lyceum 7, Warsaw',
	countryName: 'Poland',
	experienceLevel: 'intermediate',
	dateOfBirth: '2008-04-11',
	phone: null,
	dietaryRequirements: null,
	emergencyContact: null,
	committeeNames: ['UNSC', 'UNHRC'],
	seatPreferences: null,
	motivation: null,
	answers: { 'question-experience': 'THIMUN 2026' },
	status: 'submitted',
	submittedAt: '2026-10-03T09:00:00+00:00',
	decidedAt: null,
	seatLabel: null,
	decisionNote: null,
	internalNote: null
};

/**
 * The few pieces of a request the handler actually reads.
 *
 * SvelteKit hands it a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
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
	vi.mocked(listApplicationsForExport).mockResolvedValue([ANNA]);
	vi.mocked(listApplicationQuestions).mockResolvedValue([DIETARY_QUESTION]);
	vi.mocked(readApplicationFormSettings).mockResolvedValue({
		committeePreferenceCount: 2,
		askMotivation: true
	});
});

describe('who may download it', () => {
	/*
		The gate throws a 404 at anybody outside the team, exactly as it does for
		the pages beside this endpoint. It is the first line of the handler, so
		nothing below it runs.
	*/
	it('never reaches the query when the gate turns the caller away', async () => {
		vi.mocked(requireTeamMember).mockRejectedValue({ status: 404 });

		await expect(GET(makeEvent())).rejects.toEqual({ status: 404 });
		expect(listApplicationsForExport).not.toHaveBeenCalled();
	});

	it('is a 404 for a team member whose permissions do not open the applications', async () => {
		signedInAs({ ...ADMINISTRATOR, held: [{ permission: 'manage_team', scope: 'conference' }] });

		await expect(GET(makeEvent())).rejects.toMatchObject({ status: 404 });
		expect(listApplicationsForExport).not.toHaveBeenCalled();
	});
});

describe('which rows it writes', () => {
	it('asks for the same rows the table is showing, and for all of them', async () => {
		const committeeId = '6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b';

		await GET(makeEvent(`?status=accepted&q=anna&committee=${committeeId}&page=3`));

		// `page` is in the address because the table is paged, but the download is
		// not: the query is handed on whole and `listApplicationsForExport` ignores
		// the paging.
		expect(listApplicationsForExport).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.objectContaining({ status: 'accepted', q: 'anna', committee: committeeId })
		);
	});

	it('builds the file out of those rows, headings first', async () => {
		const response = await GET(makeEvent());
		const lines = (await response.text()).split('\r\n');

		expect(lines[0]).toBe(
			'Name,Email,Institution,Country,Experience,Date of birth,Phone,Dietary requirements,' +
				'Emergency contact,Preference 1,Preference 2,Seat preferences,Motivation,' +
				'Which conferences have you attended?,Status,Submitted,Decided,Seat,Decision note,' +
				'Internal note'
		);
		// The institution holds a comma, so the cell is quoted rather than
		// splitting the row in two.
		expect(lines[1]).toContain('"Lyceum 7, Warsaw"');
		expect(lines[1]).toContain('Anna Kowalski');
	});

	/*
		The column count comes from the conference's own
		`committee_preference_count`, so two downloads taken with different filters
		have the same columns.
	*/
	it('draws one preference column per preference the conference asks for', async () => {
		vi.mocked(readApplicationFormSettings).mockResolvedValue({
			committeePreferenceCount: 3,
			askMotivation: true
		});

		const response = await GET(makeEvent());
		const headings = (await response.text()).split('\r\n')[0];

		expect(headings).toContain('Preference 1,Preference 2,Preference 3');
	});
});

describe('which columns it writes', () => {
	it('leaves out the contact columns for a reader without read_contact_details', async () => {
		// The applications open to administrators only until their own step lands,
		// so the page check is waved through here for a welfare-only reader.
		vi.mocked(requireManagePage).mockImplementationOnce(() => undefined);
		signedInAs({
			held: [{ permission: 'read_welfare_details', scope: 'conference' }],
			committeeIds: [],
			rank: 2
		});

		const response = await GET(makeEvent());
		const headings = (await response.text()).split('\r\n')[0];

		expect(headings).not.toContain('Email');
		expect(headings).not.toContain('Phone');
		expect(headings).toContain('Date of birth');
		expect(headings).toContain('Emergency contact');
	});

	it('writes every private column for an administrator', async () => {
		const response = await GET(makeEvent());
		const headings = (await response.text()).split('\r\n')[0];

		expect(headings).toContain('Email');
		expect(headings).toContain('Phone');
	});
});

describe('what the browser is told', () => {
	it('answers as a CSV file', async () => {
		const response = await GET(makeEvent());

		expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
	});

	it('names the file after the conference and the day it was taken', async () => {
		// The day is read in the conference's own timezone, so the name does not
		// depend on where the organiser is sitting.
		const response = await GET(makeEvent());
		const disposition = response.headers.get('content-disposition') ?? '';

		expect(disposition).toMatch(
			/^attachment; filename="applications-riverside-mun-2027-\d{4}-\d{2}-\d{2}\.csv"$/
		);
	});
});
