import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { DATABASE_TIMEOUT_MS, makeChairedCommittee } from './chair-room-fixtures';
import { createTestUser, signIn } from './signed-in-user';
import { MAYA } from './walkthrough-seed';

// Step 9 of docs/roles-and-permissions.md, in a browser: a conference page's
// team section lists the people in the roles the conference marks as public,
// and nobody in a role it keeps private.
//
// Every test reads the page as a delegate of the conference. The team's names
// are profiles, which only somebody signed in may read, and who holds a role
// is read by the team and the conference's participants (section 7), so a
// signed-out visitor sees no team section at all, as before roles existed.

/** The team section of a conference page, once the page has arrived. */
async function openTeam(page: Page, conferenceSlug: string) {
	await page.goto(`/conferences/${conferenceSlug}`);

	const team = page.getByRole('main').getByRole('region', { name: 'Team' });
	await expect(team).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	return team;
}

test('lists the walkthrough’s USG delegate affairs, and not its Finance or registration desk', async ({
	page
}) => {
	// Maya holds Canada in the Human Rights Council of "about to start".
	await signIn(page, MAYA);
	const team = await openTeam(page, 'northbridge-about-to-start');

	// Olivia's role is public, and the line under her name is her title.
	await expect(team.getByText('Olivia Grant')).toBeVisible();
	await expect(team.getByText('Under-Secretary-General for Delegate Affairs')).toBeVisible();

	await expect(team.getByText('Rohan Mehta')).toHaveCount(0);
	await expect(team.getByText('Ellie Watson')).toHaveCount(0);
});

test('shows a role’s people once the conference makes the role public', async ({ page }) => {
	test.slow();

	const room = await makeChairedCommittee('Public Team MUN');
	const admin = createServiceRoleClient();
	const press = await createTestUser('Priya Press');
	const delegate = await createTestUser('Public Team Delegate');

	// A delegate in one of the Security Council's seats is a participant.
	const { data: seat } = await admin
		.from('seats')
		.select('id')
		.eq('committee_id', room.committeeId)
		.limit(1)
		.single();
	await admin.from('seats').update({ user_id: delegate.id }).eq('id', String(seat?.id));

	const { data: role, error: roleError } = await admin
		.from('conference_roles')
		.insert({
			conference_id: room.conferenceId,
			name: 'Press',
			position: 1,
			scope: 'conference',
			permissions: ['send_announcements'],
			is_public: false
		})
		.select('id')
		.single();

	if (roleError || !role) {
		throw new Error(`Could not make the Press role: ${roleError?.message}`);
	}

	await admin
		.from('conference_staff')
		.insert({ conference_id: room.conferenceId, user_id: press.id });
	await admin
		.from('conference_role_members')
		.insert({ conference_id: room.conferenceId, user_id: press.id, role_id: role.id });

	// The chair's preset role is public, so the section is there from the start.
	await signIn(page, delegate);
	let team = await openTeam(page, room.conferenceSlug);
	await expect(team.getByText(press.fullName)).toHaveCount(0);

	await admin.from('conference_roles').update({ is_public: true }).eq('id', role.id);

	team = await openTeam(page, room.conferenceSlug);
	await expect(team.getByText(press.fullName)).toBeVisible();
	await expect(team.getByText('Press', { exact: true })).toBeVisible();
});
