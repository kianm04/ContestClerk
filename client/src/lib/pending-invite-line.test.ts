import { describe, expect, it } from 'vitest';
import { pendingInviteDetailLine } from './pending-invite-line';
import type { PendingStaffInvite } from './team';

/**
 * An invitation nobody has accepted, running out on 14 October 2026. October
 * rather than September, because Intl writes September as "Sept" in British
 * English and these tests are about the line, not about Intl.
 */
function makeInvite(overrides: Partial<PendingStaffInvite> = {}): PendingStaffInvite {
	return {
		id: 'invite-1',
		token: 'a'.repeat(32),
		email: 'chair@example.org',
		roleId: 'role-chair',
		roleName: 'Chair',
		committeeId: 'committee-1',
		committeeName: 'UNSC',
		title: null,
		expiresAt: '2026-10-14T12:00:00Z',
		...overrides
	};
}

describe('pendingInviteDetailLine', () => {
	it('names the role, the committee and the day the invitation runs out', () => {
		expect(pendingInviteDetailLine(makeInvite(), false)).toBe('Chair · UNSC · expires 14 Oct 2026');
	});

	it('says the invitation expired once it has', () => {
		expect(pendingInviteDetailLine(makeInvite(), true)).toBe('Chair · UNSC · expired 14 Oct 2026');
	});

	it('leaves the committee out when the invitation hands over none', () => {
		const invite = makeInvite({
			roleId: 'role-volunteer',
			roleName: 'Volunteer',
			committeeId: null,
			committeeName: null
		});

		expect(pendingInviteDetailLine(invite, false)).toBe('Volunteer · expires 14 Oct 2026');
	});

	it('names a role the conference made itself as the conference named it', () => {
		const invite = makeInvite({
			roleId: 'role-usg',
			roleName: 'USG delegate affairs',
			committeeId: null,
			committeeName: null
		});

		expect(pendingInviteDetailLine(invite, false)).toBe(
			'USG delegate affairs · expires 14 Oct 2026'
		);
	});

	it('reads the day in UTC, so the server and the browser write the same one', () => {
		const invite = makeInvite({ expiresAt: '2026-10-20T23:30:00Z' });

		expect(pendingInviteDetailLine(invite, false)).toBe('Chair · UNSC · expires 20 Oct 2026');
	});
});
