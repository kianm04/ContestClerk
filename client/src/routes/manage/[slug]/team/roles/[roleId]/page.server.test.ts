import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { MyPermissions } from '$lib/permissions';
import type { RoleSummary } from '$lib/roles';

// The gate, the queries and the flash cookie are stood in for, so these tests
// are about what the editor decides. What the database allows is tested in
// `tests/db/`.
vi.mock('$lib/server/access', () => ({
	requirePermissionAndRank: vi.fn(),
	requireManagePage: vi.fn()
}));

vi.mock('$lib/server/roles', () => ({
	deleteRole: vi.fn(),
	listRoleSummaries: vi.fn(),
	updateRole: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requirePermissionAndRank } from '$lib/server/access';
import { setFlash } from '$lib/server/flash';
import { deleteRole, listRoleSummaries, updateRole } from '$lib/server/roles';

/** The reader: second in the order, managing roles, sending announcements. */
const DEPUTY: MyPermissions = {
	held: [
		{ permission: 'manage_roles', scope: 'conference' },
		{ permission: 'send_announcements', scope: 'conference' }
	],
	committeeIds: [],
	rank: 1
};

const CONFERENCE = { id: 'conference-1', slug: 'riverside-mun-2027' };
const COOKIES = {};

function role(name: string, position: number, extra: Partial<RoleSummary> = {}): RoleSummary {
	return {
		id: `role-${name.toLowerCase()}`,
		name,
		position,
		scope: 'conference',
		isPublic: false,
		permissions: [],
		memberCount: 0,
		invitationCount: 0,
		...extra
	};
}

const ORGANISER = role('Organiser', 0, { permissions: ['administrator'] });
const DEPUTY_ROLE = role('Deputy', 1, { permissions: ['manage_roles'] });
const PRESS = role('Press', 2, { permissions: ['send_announcements'] });
const DESK = role('Desk', 3, { memberCount: 2 });
const ROLES = [ORGANISER, DEPUTY_ROLE, PRESS, DESK];

const ROLES_PATH = '/manage/riverside-mun-2027/team/roles';

function makeLoadEvent(roleId: string, search = ''): PageServerLoadEvent {
	return {
		params: { slug: CONFERENCE.slug, roleId },
		url: new URL(`http://localhost${ROLES_PATH}/${roleId}${search}`),
		locals: { supabase: {} },
		parent: async () => ({ conference: CONFERENCE, permissions: DEPUTY })
	} as unknown as PageServerLoadEvent;
}

function makeActionEvent(roleId: string, fields: Record<string, string | string[]> = {}) {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		for (const each of [value].flat()) {
			formData.append(name, each);
		}
	}

	return {
		params: { slug: CONFERENCE.slug, roleId },
		url: new URL(`http://localhost${ROLES_PATH}/${roleId}`),
		locals: { supabase: {} },
		cookies: COOKIES,
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/** SvelteKit's `redirect` and `error` throw, so catching is how a test sees them. */
async function catchThrown(run: () => unknown): Promise<{ status: number; location?: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location?: string };
	}

	throw new Error('Nothing was thrown.');
}

type Refusal = { status: number; data: { message: string | null; errors: { name?: string } } };

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(listRoleSummaries).mockResolvedValue(ROLES);
	vi.mocked(updateRole).mockResolvedValue('saved');
	vi.mocked(deleteRole).mockResolvedValue('deleted');
	vi.mocked(requirePermissionAndRank).mockResolvedValue({
		user: { id: 'user-1', email: 'sofia@example.com' },
		conference: CONFERENCE,
		permissions: DEPUTY
	} as unknown as Awaited<ReturnType<typeof requirePermissionAndRank>>);
});

describe('load', () => {
	it('opens a role below the reader with its values', async () => {
		expect(await load(makeLoadEvent(PRESS.id))).toMatchObject({
			values: { name: 'Press', scope: 'conference', permissions: ['send_announcements'] },
			deleteRefusal: null,
			isDeleteOpen: false
		});
	});

	it('answers 404 for the reader’s own role and those above it', async () => {
		for (const roleId of [ORGANISER.id, DEPUTY_ROLE.id, 'role-gone']) {
			expect((await catchThrown(() => load(makeLoadEvent(roleId)))).status).toBe(404);
		}
	});

	it('opens the delete confirmation only while nobody holds the role', async () => {
		expect(await load(makeLoadEvent(PRESS.id, '?delete=1'))).toMatchObject({ isDeleteOpen: true });
		expect(await load(makeLoadEvent(DESK.id, '?delete=1'))).toMatchObject({
			isDeleteOpen: false,
			deleteRefusal: 'To delete this role, first take it off its 2 members on the team page.'
		});
	});
});

describe('the save action', () => {
	it('saves the form and stays on the editor', async () => {
		const thrown = await catchThrown(() =>
			actions.save(
				makeActionEvent(PRESS.id, { name: 'Press office', scope: 'conference', isPublic: 'on' })
			)
		);

		expect(updateRole).toHaveBeenCalledWith({}, PRESS.id, {
			name: 'Press office',
			scope: 'conference',
			isPublic: true,
			permissions: []
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Changes saved.' });
		expect(thrown.location).toBe(`${ROLES_PATH}/${PRESS.id}`);
	});

	it('refuses a name another role has, but not the role’s own', async () => {
		const result = (await actions.save(makeActionEvent(PRESS.id, { name: 'desk' }))) as Refusal;

		expect(result.status).toBe(400);
		expect(result.data.errors.name).toBe('There is already a role called desk.');

		await catchThrown(() => actions.save(makeActionEvent(PRESS.id, { name: 'Press' })));
		expect(updateRole).toHaveBeenCalledTimes(1);
	});

	it('answers 404 for a role the reader may not change', async () => {
		const thrown = await catchThrown(() =>
			actions.save(makeActionEvent(ORGANISER.id, { name: 'Organiser' }))
		);

		expect(thrown.status).toBe(404);
		expect(updateRole).not.toHaveBeenCalled();
	});

	it('says so when the database refused', async () => {
		vi.mocked(updateRole).mockResolvedValue('refused');

		const result = (await actions.save(makeActionEvent(PRESS.id, { name: 'Press' }))) as Refusal;

		expect(result.status).toBe(403);
		expect(result.data.message).toBe('You can only give a role the permissions you hold yourself.');
	});
});

describe('the delete action', () => {
	it('deletes an empty role and goes back to the list', async () => {
		const thrown = await catchThrown(() => actions.delete(makeActionEvent(PRESS.id)));

		expect(deleteRole).toHaveBeenCalledWith({}, PRESS.id);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Press deleted.' });
		expect(thrown.location).toBe(ROLES_PATH);
	});

	it('refuses a role somebody holds, and says what to do first', async () => {
		const result = (await actions.delete(makeActionEvent(DESK.id))) as Refusal;

		expect(result.status).toBe(400);
		expect(result.data.message).toBe(
			'To delete this role, first take it off its 2 members on the team page.'
		);
		expect(deleteRole).not.toHaveBeenCalled();
	});

	it('says so when somebody was given the role in the meantime', async () => {
		vi.mocked(deleteRole).mockResolvedValue('in-use');

		const result = (await actions.delete(makeActionEvent(PRESS.id))) as Refusal;

		expect(result.status).toBe(400);
		expect(setFlash).not.toHaveBeenCalled();
	});
});
