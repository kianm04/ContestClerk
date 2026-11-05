import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { MyPermissions } from '$lib/permissions';
import type { RoleSummary } from '$lib/roles';

// The gate, the queries and the flash cookie are stood in for, so these tests
// are about what the form decides. What the database allows is tested in
// `tests/db/`.
vi.mock('$lib/server/access', () => ({
	requirePermissionAndRank: vi.fn(),
	requireManagePage: vi.fn()
}));

vi.mock('$lib/server/roles', () => ({ createRole: vi.fn(), listRoleSummaries: vi.fn() }));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requirePermissionAndRank } from '$lib/server/access';
import { setFlash } from '$lib/server/flash';
import { createRole, listRoleSummaries } from '$lib/server/roles';

/** The reader: managing roles and reading applications, but not deciding them. */
const DEPUTY: MyPermissions = {
	held: [
		{ permission: 'manage_roles', scope: 'conference' },
		{ permission: 'read_applications', scope: 'conference' }
	],
	committeeIds: [],
	rank: 1
};

const CONFERENCE = { id: 'conference-1', slug: 'riverside-mun-2027' };
const COOKIES = {};

const SECRETARIAT: RoleSummary = {
	id: 'role-secretariat',
	name: 'Secretariat',
	position: 4,
	scope: 'committees',
	isPublic: true,
	permissions: ['read_applications', 'decide_applications'],
	memberCount: 3,
	invitationCount: 0
};

const ROLES_PATH = '/manage/riverside-mun-2027/team/roles';

function makeLoadEvent(search = ''): PageServerLoadEvent {
	return {
		url: new URL(`http://localhost${ROLES_PATH}/new${search}`),
		locals: { supabase: {} },
		parent: async () => ({ conference: CONFERENCE, permissions: DEPUTY })
	} as unknown as PageServerLoadEvent;
}

function makeCreateEvent(fields: Record<string, string>): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost${ROLES_PATH}/new`),
		locals: { supabase: {} },
		cookies: COOKIES,
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(listRoleSummaries).mockResolvedValue([SECRETARIAT]);
	vi.mocked(createRole).mockResolvedValue({ result: 'saved', roleId: 'role-new' });
	vi.mocked(requirePermissionAndRank).mockResolvedValue({
		user: { id: 'user-1', email: 'sofia@example.com' },
		conference: CONFERENCE,
		permissions: DEPUTY
	} as unknown as Awaited<ReturnType<typeof requirePermissionAndRank>>);
});

describe('load', () => {
	it('starts blank', async () => {
		expect(await load(makeLoadEvent())).toMatchObject({
			values: { name: '', scope: 'conference', permissions: [] },
			fromRoleId: null
		});
	});

	it('copies the scope and the permissions the reader may give from ?from=', async () => {
		expect(await load(makeLoadEvent(`?from=${SECRETARIAT.id}`))).toMatchObject({
			values: { name: '', scope: 'committees', permissions: ['read_applications'] },
			fromRoleId: SECRETARIAT.id
		});
	});
});

describe('the create action', () => {
	it('adds the role at the bottom of the order and goes back to the list', async () => {
		let location = '';

		try {
			await actions.create(makeCreateEvent({ name: 'Registration desk', scope: 'conference' }));
		} catch (thrown) {
			location = (thrown as { location: string }).location;
		}

		expect(createRole).toHaveBeenCalledWith(
			{},
			CONFERENCE.id,
			{ name: 'Registration desk', scope: 'conference', isPublic: false, permissions: [] },
			5
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Registration desk created.'
		});
		expect(location).toBe(ROLES_PATH);
	});

	it('keeps what was typed when the name is missing', async () => {
		const result = (await actions.create(makeCreateEvent({ name: '', isPublic: 'on' }))) as {
			status: number;
			data: { values: { isPublic: boolean }; errors: { name?: string } };
		};

		expect(result.status).toBe(400);
		expect(result.data.errors.name).toBe('Give the role a name.');
		expect(result.data.values.isPublic).toBe(true);
		expect(createRole).not.toHaveBeenCalled();
	});

	it('refuses a name the database found taken', async () => {
		vi.mocked(createRole).mockResolvedValue({ result: 'name-taken', roleId: null });

		const result = (await actions.create(makeCreateEvent({ name: 'Desk' }))) as {
			status: number;
			data: { errors: { name?: string } };
		};

		expect(result.status).toBe(400);
		expect(result.data.errors.name).toBe('There is already a role called Desk.');
	});
});
