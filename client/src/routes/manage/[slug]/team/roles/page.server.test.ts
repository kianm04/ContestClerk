import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { MyPermissions } from '$lib/permissions';
import type { RoleSummary } from '$lib/roles';

// The gate and the queries are stood in for, so these tests are about what
// the page decides. What the database allows is tested in `tests/db/`.
vi.mock('$lib/server/access', () => ({
	requirePermissionAndRank: vi.fn(),
	requireManagePage: vi.fn()
}));

vi.mock('$lib/server/roles', () => ({ listRoleSummaries: vi.fn(), moveRole: vi.fn() }));

import { requireManagePage, requirePermissionAndRank } from '$lib/server/access';
import { listRoleSummaries, moveRole } from '$lib/server/roles';

const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: -1
};

const CONFERENCE = { id: 'conference-1', slug: 'riverside-mun-2027' };

function role(name: string, position: number): RoleSummary {
	return {
		id: `role-${name.toLowerCase()}`,
		name,
		position,
		scope: 'conference',
		isPublic: false,
		permissions: [],
		memberCount: 0,
		invitationCount: 0
	};
}

const ROLES = [role('Organiser', 0), role('Press', 1)];

/** The page the move comes back to. */
const ROLES_PATH = '/manage/riverside-mun-2027/team/roles';

function makeLoadEvent(): PageServerLoadEvent {
	return {
		locals: { supabase: {} },
		parent: async () => ({ conference: CONFERENCE, permissions: ADMINISTRATOR })
	} as unknown as PageServerLoadEvent;
}

function makeMoveEvent(direction: string, roleId: string): RequestEvent {
	const formData = new FormData();
	formData.set('roleId', roleId);

	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost${ROLES_PATH}?/move&direction=${direction}`),
		locals: { supabase: {} },
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/** SvelteKit's `redirect` throws, so catching it is how a test sees where it went. */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(listRoleSummaries).mockResolvedValue(ROLES);
	vi.mocked(moveRole).mockResolvedValue(true);
	vi.mocked(requirePermissionAndRank).mockResolvedValue({
		user: { id: 'user-1', email: 'sofia@example.com' },
		conference: CONFERENCE,
		permissions: ADMINISTRATOR
	} as unknown as Awaited<ReturnType<typeof requirePermissionAndRank>>);
});

describe('load', () => {
	it('opens for manage_roles and lists the roles with what the reader may do', async () => {
		const result = (await load(makeLoadEvent())) as unknown as {
			roles: { name: string; canMoveUp: boolean }[];
		};

		expect(requireManagePage).toHaveBeenCalledWith(ADMINISTRATOR, 'roles');
		expect(result.roles.map((row) => [row.name, row.canMoveUp])).toEqual([
			['Organiser', false],
			['Press', true]
		]);
	});
});

describe('the move action', () => {
	it('asks for manage_roles again, moves the role and comes back to the list', async () => {
		const redirect = await catchRedirect(() => actions.move(makeMoveEvent('up', 'role-press')));

		expect(requirePermissionAndRank).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			CONFERENCE.slug,
			'manage_roles'
		);
		expect(moveRole).toHaveBeenCalledWith({}, 'role-press', 'up');
		expect(redirect.location).toBe(ROLES_PATH);
	});

	it('refuses a direction that is neither up nor down', async () => {
		const result = (await actions.move(makeMoveEvent('sideways', 'role-press'))) as {
			status: number;
		};

		expect(result.status).toBe(400);
		expect(moveRole).not.toHaveBeenCalled();
	});

	it('says so when the rank rule refused the move', async () => {
		vi.mocked(moveRole).mockResolvedValue(false);

		const result = (await actions.move(makeMoveEvent('down', 'role-organiser'))) as {
			status: number;
			data: { message: string };
		};

		expect(result.status).toBe(403);
		expect(result.data.message).toBe('You can only move roles below your own.');
	});
});
