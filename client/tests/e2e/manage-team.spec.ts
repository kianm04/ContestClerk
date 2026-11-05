import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	createTestUser,
	givePresetRole,
	PRESET_ROLE_NAMES,
	presetRoleId,
	readRoleNames,
	signIn,
	type TestUser
} from './signed-in-user';
import { createDraftConferenceFor } from './draft-conference';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { answerConfirmationPage } from './confirmation-page';
import { openManageNavigation } from './manage-navigation';
import { waitUntilAnswered } from './chair-room-fixtures';
import { skipWithoutJavaScript } from './in-place';
import {
	AT_ONCE_TIMEOUT_MS,
	answerSlowly,
	answerWithError,
	sawSpinner,
	watchForSpinners
} from './instant';
import { pickOption, setChecked } from './shadcn-controls';

// The acceptance criteria of the team page that need a real browser
// (`docs/roles-and-permissions.md`, section 6): `/manage/[slug]/team`, where an
// organiser invites the people who will run the conference and gives each of
// them their roles.
//
// * inviting somebody creates a pending invitation, and the page shows the link
//   to send them, because there is no email yet;
// * a second invitation to the same address, and an invitation to somebody who
//   is already on the team, are each refused with the words the spec gives;
// * the Role filter narrows the list through the address, so back and refresh
//   work and a filtered list can be linked to;
// * the line under the title counts the people and the invitations;
// * members of the organisation that runs the conference are listed, and cannot
//   be taken off the team here, because they are not on it: they run the
//   organisation above it;
// * roles (in the "Edit roles" dialog), a title, a committee and a removal can
//   each be saved;
// * the page does not spill off the side of a phone, and does not run on for
//   screens on a desktop.
//
// Accepting an invitation is the other half of this task and is
// `tests/e2e/invite-accept.spec.ts`. Nothing here presses "Accept": this file is
// about the organiser's side of the same invitation.
//
// EVERY ACTION WITHOUT JAVASCRIPT
// "Roles, title, committee assignment and removal work without JavaScript"
// is met by these tests running on the `desktop-no-js` project like
// every other browser test, rather than by tests of their own — which would
// leave those same actions unchecked on the two projects that do have
// JavaScript. Every control they use is a real submit button in a real
// `<form method="post">`, inside a `<details>` block the browser opens and
// closes by itself or a dialog that lives in the address (`?edit=`). The two tests that measure a page are the exception: they
// ask the browser for its own dimensions, and each runs on one project alone.
//
// WHAT THESE TESTS LEAVE BEHIND
// Each test makes its own conference through `./draft-conference`, with an
// organisation of its own, and works on that conference alone. What it creates
// stays in the database until the next `pnpm db:reset`, and that is safe for
// the reason `tests/e2e/manage-committees.spec.ts` gives: the conferences are
// dated in 2020, and `/conferences` lists conferences that are published *and*
// have not finished, so nothing `tests/e2e/conferences.spec.ts` counts can see
// them. Nothing here touches a conference, an invitation or a team row from
// `supabase/seed.sql`, so there is nothing for another suite to trip over and
// nothing to put back in a `finally`.
//
// The three projects run at the same time against the one local database, so
// every account, every conference and every address below is made fresh by the
// test that uses it. No test reaches for "the pending invitation" or "the first
// chair".
//
// `createDraftConference`, `slugOf`, `readConferenceId`,
// `signInWithAConference` and `pressAndConfirm` below are copies of the ones in
// `tests/e2e/manage-committees.spec.ts`, and are deliberately copies rather than
// shared imports for the reason that file gives: each suite wants its own dates
// and its own extra fields, and a helper shared between them would have to be
// told about every one of those.

/**
 * How long an assertion that waits on a page reading the database may take.
 *
 * Longer than the five seconds Playwright waits by default, for the reason
 * `tests/e2e/conferences.spec.ts` gives: every test in the run asks the one
 * local database at once, and an answer has taken up to eight seconds.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * How long a single try inside a retrying block may take.
 *
 * Short on purpose: the block around it is what waits, and a try that waited
 * the full fifteen seconds would only ever run once.
 */
const SINGLE_TRY_TIMEOUT_MS = 2_000;

/**
 * The days every conference these tests create runs on.
 *
 * Both are in the past, for the reason at the top of this file.
 */
const CONFERENCE_FIRST_DAY = '2020-05-03';
const CONFERENCE_LAST_DAY = '2020-05-05';

/**
 * How many windows tall the team page may be with a real team on it.
 *
 * Three is the ceiling the conference dashboard, the details editor and the
 * committees list are all held to, and the reason is the same: more than that
 * would mean these rows are being drawn too big to be scanned, which is exactly
 * what `tests/e2e/page-shape.ts` exists to notice.
 */
const MANAGE_TEAM_SCREENS = 3;

/**
 * A name nothing else in the database will match, so that a test can read its
 * own conference's page without another run's rows getting in the way.
 */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * An address nobody has an account for.
 *
 * Inviting one is the ordinary case — a conference invites a chair who has
 * never heard of MUNMeet — and it also keeps two tests running side by side
 * from inviting the same person.
 */
function unusedEmail(): string {
	return `e2e-invite-${crypto.randomUUID()}@example.com`;
}

/** What `createDraftConference` names the new conference and its organisation. */
type NewConference = {
	/** The conference's name. */
	name: string;
	/** The name of the new organisation, which the account owns. */
	organizationName: string;
};

/**
 * Give `user` a draft conference of its own, run by a brand-new organisation,
 * and answer its `/manage/<slug>` address.
 *
 * The rows are written straight into the database by `./draft-conference`,
 * whose comment says why: the one-step `/create` form these tests used to fill
 * in is gone, and the creation flow that replaced it has its own
 * `create-*.spec.ts` files.
 */
async function createDraftConference(user: TestUser, conference: NewConference): Promise<string> {
	const draft = await createDraftConferenceFor(user, {
		name: conference.name,
		organizationName: conference.organizationName,
		startDate: CONFERENCE_FIRST_DAY,
		endDate: CONFERENCE_LAST_DAY
	});

	return `/manage/${draft.slug}`;
}

/** The slug at the end of a `/manage/<slug>` address. */
function slugOf(managePath: string): string {
	return managePath.split('/').pop() ?? '';
}

/**
 * The id of the conference a `/manage/<slug>` address names. `./draft-conference`
 * makes the slug with a random suffix, so the id can only be looked up afterwards.
 */
async function readConferenceId(slug: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.select('id')
		.eq('slug', slug)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not find the conference "${slug}": ${error?.message}`);
	}

	return data.id;
}

/** A signed-in account with a conference of its own, ready for a test to work on. */
type TestConference = {
	/** The account that created it, and so the owner of the organisation above it. */
	user: TestUser;
	id: string;
	slug: string;
	name: string;
	/** The organisation named on the form, which the owner's Title cell names. */
	organizationName: string;
	/** The `/manage/<slug>/team` address this file is about. */
	teamPath: string;
};

/** Sign a brand-new account in and give it a conference of its own. */
async function signInWithAConference(page: Page, prefix: string): Promise<TestConference> {
	const user = await createTestUser('Priya Nair');
	await signIn(page, user);

	const name = unusedName(prefix);
	const organizationName = unusedName(`${prefix} Society`);
	const managePath = await createDraftConference(user, { name, organizationName });
	const slug = slugOf(managePath);
	const id = await readConferenceId(slug);

	return { user, id, slug, name, organizationName, teamPath: `${managePath}/team` };
}

/**
 * Sign in, make a conference and open its team page, which is where every test
 * below starts.
 *
 * Waiting for the heading rather than simply for the address is what says the
 * page has arrived: a test that pressed too early would press the page it was
 * leaving.
 */
async function openTeamPage(page: Page, prefix: string): Promise<TestConference> {
	const conference = await signInWithAConference(page, prefix);

	await page.goto(conference.teamPath);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Team', {
		timeout: DATABASE_TIMEOUT_MS
	});

	return conference;
}

/*
	The three blocks of the page. `ManageSection` draws a
	`<section aria-label="…">`, and a `<section>` with a name is a landmark a
	screen reader can jump to, which is the `region` role below. Everything a
	test presses is looked for inside one of these, because the same words turn
	up in more than one place: "Title" labels a box in the invite form and a box
	in every person's row, and "Chair" is a role in a dropdown as well as in
	the Roles cell of a row.

	The People block draws everybody twice: as a table from `md` up and as a
	list of cards on a phone, with the other one hidden by CSS. So the helpers
	that find something in a row ask for the copy that is on screen
	(`filter({ visible: true })`), and the same test works on every project.
*/

/** The "Invite someone" form at the top of the page. */
function inviteSection(page: Page): Locator {
	return page.getByRole('region', { name: 'Invite someone' });
}

/** The list of invitations nobody has accepted yet. It is not drawn when there are none. */
function pendingSection(page: Page): Locator {
	return page.getByRole('region', { name: 'Waiting to accept' });
}

/** The invitations still waiting, one `<li>` each. */
function pendingInvites(page: Page): Locator {
	return pendingSection(page).getByRole('listitem');
}

/** The list of people, under the tabs. */
function teamSection(page: Page): Locator {
	return page.getByRole('region', { name: 'People', exact: true });
}

/** The Role dropdown above the list, which filters it through the address. */
function roleFilter(page: Page): Locator {
	return teamSection(page).getByLabel('Role');
}

/**
 * Show only the people holding one role, or "Everyone". Without JavaScript the
 * "Show" button sends the filter; with it, the pick is enough.
 */
async function filterByRole(page: Page, testInfo: TestInfo, optionLabel: string): Promise<void> {
	await pickOption(page, testInfo, roleFilter(page), optionLabel);

	if (testInfo.project.use.javaScriptEnabled === false) {
		await teamSection(page).getByRole('button', { name: 'Show' }).press('Enter');
	}
}

/** The line under the page's title, such as "3 people · 1 invitation waiting". */
function summaryLine(page: Page, text: string): Locator {
	// `.first()`: the filter row beside the list may say the same words, and
	// the title's line comes first on the page.
	return page.getByRole('main').getByText(text, { exact: true }).first();
}

/** The "Edit roles" link on a person's row, which only rows below the reader carry. */
function editRolesLink(page: Page, name: string): Locator {
	return teamSection(page)
		.locator('tr, li')
		.filter({ hasText: name })
		.filter({ visible: true })
		.getByRole('link', { name: 'Edit roles' });
}

/**
 * Open somebody's "Edit roles" dialog, tick exactly these roles, and save.
 * The dialog is in the address, so it opens without JavaScript as well.
 */
async function saveRoles(
	page: Page,
	testInfo: TestInfo,
	name: string,
	roles: { tick: string[]; untick: string[] }
): Promise<void> {
	await editRolesLink(page, name).click();

	// Found by its heading rather than its name: the dialog is named by its
	// title only once JavaScript has run.
	const dialog = page
		.getByRole('dialog')
		.filter({ has: page.getByRole('heading', { name: `Roles for ${name}` }) });
	await expect(dialog).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	for (const role of roles.untick) {
		await setChecked(testInfo, dialog.getByLabel(role, { exact: true }), false);
	}

	for (const role of roles.tick) {
		await setChecked(testInfo, dialog.getByLabel(role, { exact: true }), true);
	}

	await dialog.getByRole('button', { name: 'Save roles' }).press('Enter');
	await expect(page.getByText(`Roles saved for ${name}.`)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/**
 * The line in a person's row that holds their name and nothing else.
 *
 * `exact` matters here: the row also carries "Manage {name}" on the summary of
 * its own controls, and a loose match would find both and refuse to choose.
 */
function personRow(page: Page, name: string): Locator {
	return teamSection(page).getByText(name, { exact: true }).filter({ visible: true });
}

/**
 * Words in the People block that are on screen, such as a person's title.
 * Every row is drawn twice (see above), so this is the copy that shows.
 */
function shownInTeam(page: Page, text: string): Locator {
	return teamSection(page).getByText(text).filter({ visible: true });
}

/**
 * The Committee cell of a person's row, which names the committees they chair.
 *
 * A committee's name is in three places on this page once somebody chairs it:
 * that cell, the dropdown that assigned it, and the button that takes it away
 * again. The other two are inside the person's shut `<details>` block, which
 * the browser does not draw, so the copy on screen is the cell.
 */
function chairedCommitteesLine(page: Page, committeeName: string): Locator {
	return shownInTeam(page, committeeName);
}

/**
 * The `<details>` block holding one person's controls.
 *
 * A `<details>` is a `group` to a screen reader, and it takes no name of its
 * own from the words on its summary, so the block is found by filtering the
 * groups on the page down to the one whose text holds "Manage {name}". Those
 * words are hidden from sight behind the "⋯" but are still its text.
 */
function managePanel(page: Page, name: string): Locator {
	return page
		.getByRole('main')
		.getByRole('group')
		.filter({ hasText: `Manage ${name}` })
		.filter({ visible: true });
}

/**
 * Open one person's controls.
 *
 * `<details>` is the browser's own collapsible block: clicking the summary
 * opens it with or without JavaScript. Until it is open the browser hides
 * everything inside it, so a button in a shut block is genuinely not there to
 * be pressed — and a form post closes it again, which is why the tests below
 * open it once per action.
 */
async function openManagePanel(page: Page, name: string): Promise<void> {
	// The summary is the "⋯" button; its words are only for a screen reader.
	// It is pressed from the keyboard, like the buttons below, because the
	// step footer that sticks to the bottom of the window can sit over a row.
	await managePanel(page, name).locator('summary').press('Enter');
}

/**
 * Press a `ConfirmButton` and answer the question it asks.
 *
 * With JavaScript the press opens a `<dialog>` and the dialog's own button is
 * what submits. Without it — which is the `desktop-no-js` project, and also any
 * page whose script has not landed yet — the press opens a confirmation page
 * asking the same question, whose own button is what submits. Both are the
 * right behaviour, so this waits to see which of the two happened rather than
 * assuming one. It is a copy of the one in `manage-committees.spec.ts`, taking
 * the block the button is in as well, because this page draws one of these
 * buttons per person.
 */
async function pressAndConfirm(page: Page, scope: Locator, label: string): Promise<void> {
	// The dialog holds a second button with the same words on it, so the one in
	// the page itself is the first of the two. While the dialog is shut the
	// browser hides everything inside it, so until then there is only one.
	const button = scope.getByRole('button', { name: label }).first();
	const dialogButton = page.getByRole('dialog').getByRole('button', { name: label });

	await button.press('Enter');

	// `waitFor` throws when nothing turns up in the time it is given, and that is
	// the "no dialog, so no script" answer: the press opened the confirmation page
	// instead.
	const isAsking = await dialogButton
		.waitFor({ state: 'visible', timeout: SINGLE_TRY_TIMEOUT_MS })
		.then(() => true)
		.catch(() => false);

	if (isAsking) {
		await dialogButton.press('Enter');
	} else {
		await answerConfirmationPage(page, label);
	}
}

/** What `createInvitationThroughTheForm` fills the "Invite someone" form in with. */
type NewInvitation = {
	email: string;
	/** The words on the choice in the Role dropdown, such as "Volunteer". */
	role: string;
	/** The words on the choice in the Committee dropdown. Left alone when not given. */
	committee?: string;
	title?: string;
};

/** Fill the invite form in and send it, the way an organiser does. */
async function createInvitationThroughTheForm(
	page: Page,
	testInfo: TestInfo,
	invitation: NewInvitation
): Promise<void> {
	const form = inviteSection(page);

	await form.getByLabel('Email').fill(invitation.email);
	await pickOption(page, testInfo, form.getByLabel('Role'), invitation.role);

	if (invitation.committee !== undefined) {
		await pickOption(page, testInfo, form.getByLabel('Committee'), invitation.committee);
	}

	if (invitation.title !== undefined) {
		await form.getByLabel('Title').fill(invitation.title);
	}

	await form.getByRole('button', { name: 'Send invitation' }).press('Enter');
}

/**
 * Put somebody on the conference's team, and answer nothing.
 *
 * `makeConferenceStaff` in `./signed-in-user` writes the same row, and this
 * file uses its own for two reasons the team page depends on: that one knows
 * only `organiser` and `chair`, and the page has a Volunteers tab, and it
 * cannot set the `title` column, which is the words under a person's name.
 * Inviting is what these rows really come from, and inviting somebody who has
 * an account and then accepting on their behalf is a whole second browser
 * session per person; `tests/e2e/invite-accept.spec.ts` does exactly that once,
 * which is where that half is proved.
 */
async function addStaff(
	conferenceId: string,
	user: TestUser,
	role: 'organiser' | 'chair' | 'volunteer',
	title?: string
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('conference_staff')
		.insert({ conference_id: conferenceId, user_id: user.id, title: title ?? null });

	if (error) {
		throw new Error(`Could not put the test account on the team: ${error.message}`);
	}

	await givePresetRole(user.id, conferenceId, PRESET_ROLE_NAMES[role]);
}

/**
 * Add a role of the conference's own, conference-wide, and answer its id. It
 * shares the top place with Organiser, so everybody holding a preset role but
 * Organiser ranks below it.
 */
async function addRole(conferenceId: string, name: string, permissions: string[]): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conference_roles')
		.insert({ conference_id: conferenceId, name, position: 0, scope: 'conference', permissions })
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test role: ${error?.message}`);
	}

	return data.id;
}

/** Put somebody on the team with a role that is not one of the presets. */
async function addStaffWithRole(conferenceId: string, user: TestUser, roleId: string) {
	const admin = createServiceRoleClient();

	const staff = await admin
		.from('conference_staff')
		.insert({ conference_id: conferenceId, user_id: user.id });
	const member = await admin
		.from('conference_role_members')
		.insert({ conference_id: conferenceId, user_id: user.id, role_id: roleId });

	if (staff.error || member.error) {
		throw new Error(
			`Could not put the test account on the team: ${(staff.error ?? member.error)?.message}`
		);
	}
}

/**
 * Somebody's place on the team as the tests below read it back, or nothing at
 * all: the names of the roles they hold, sorted, and their title.
 */
type StaffRow = {
	roles: string[];
	title: string | null;
};

/** What the database says somebody is on this conference, or `null` when they are on nothing. */
async function readStaff(conferenceId: string, userId: string): Promise<StaffRow | null> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conference_staff')
		.select('title')
		.eq('conference_id', conferenceId)
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not read the test team row: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	return { roles: await readRoleNames(userId, conferenceId), title: data.title };
}

/**
 * Write one committee straight into the table, and answer its id.
 *
 * The committees editor is `manage-committees.spec.ts`; here a committee is
 * only something for a chair to be given, so the tests are handed one rather
 * than filling that form in. It is given no abbreviation, so the words in the
 * Committee dropdown and in the "Not chair of …" button are its name and
 * nothing else.
 */
async function addCommittee(conferenceId: string, name: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committees')
		.insert({
			conference_id: conferenceId,
			name,
			// A slug is unique within the conference, and a random one keeps two
			// committees of the same test from clashing.
			slug: `committee-${crypto.randomUUID().slice(0, 8)}`,
			level: 'intermediate',
			topics: [],
			position: 0
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test committee: ${error?.message}`);
	}

	return data.id;
}

/** Put somebody in the chair of a committee without going through the page. */
async function addChair(committeeId: string, userId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('committee_chairs')
		.insert({ committee_id: committeeId, user_id: userId, title: 'Chair' });

	if (error) {
		throw new Error(`Could not write the test chair: ${error.message}`);
	}
}

/** The committees somebody chairs, so that a test can see what the page changed. */
async function readChairedCommitteeIds(userId: string): Promise<string[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committee_chairs')
		.select('committee_id')
		.eq('user_id', userId);

	if (error || !data) {
		throw new Error(`Could not read the test chair rows: ${error?.message}`);
	}

	return data.map((row) => row.committee_id);
}

/**
 * Write a pending invitation straight into the table, and answer its token.
 *
 * The two tests that measure the page want a pending invitation on it without
 * spending a form post on one, and the shape of a row is what they are about.
 * The invite form itself is proved by the first two tests below. `token` holds
 * 32 url-safe characters, which is what a UUID with its dashes taken out is.
 */
async function addInvite(
	conferenceId: string,
	invitedBy: string,
	email: string,
	role: 'organiser' | 'chair' | 'volunteer'
): Promise<string> {
	const admin = createServiceRoleClient();
	const token = crypto.randomUUID().replaceAll('-', '');

	const { error } = await admin.from('invites').insert({
		kind: 'conference_staff',
		conference_id: conferenceId,
		email,
		role_id: await presetRoleId(conferenceId, PRESET_ROLE_NAMES[role]),
		token,
		invited_by: invitedBy
	});

	if (error) {
		throw new Error(`Could not write the test invitation: ${error.message}`);
	}

	return token;
}

/** The token of the invitation this conference has for this address. */
async function readInviteToken(conferenceId: string, email: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('invites')
		.select('token')
		.eq('conference_id', conferenceId)
		.eq('email', email)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not find the invitation for ${email}: ${error?.message}`);
	}

	return data.token;
}

/** How many invitations this conference is still waiting on. */
async function countPendingInvites(conferenceId: string): Promise<number> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('invites')
		.select('id')
		.eq('conference_id', conferenceId)
		.is('accepted_at', null);

	if (error || !data) {
		throw new Error(`Could not count the test invitations: ${error?.message}`);
	}

	return data.length;
}

/*
	Every test here signs a brand-new account in, seeds a draft conference,
	opens the team page and then fills a form in, sometimes several times. That is
	a great deal more than most browser tests do, and thirty seconds — what
	Playwright allows a test by default — is not always enough for it while the
	whole suite is asking the one local database at once. `test.slow()` triples
	that allowance. It is an allowance and not a wait: a test that is quick still
	finishes as quickly as it can.
*/
test.beforeEach(() => {
	test.slow();
});

test('invites somebody and shows the link to send them', async ({ page }, testInfo) => {
	const conference = await openTeamPage(page, 'Invite Chair MUN');
	const committeeName = unusedName('Security Council');
	const invited = unusedEmail();

	await addCommittee(conference.id, committeeName);
	await page.reload();

	// The organiser area's sidebar has a line for this page. `aria-label` is what
	// names a navigation for a screen reader, and this page has two of them: the
	// top bar's "Main" and the organiser area's "Manage". On a phone the links
	// are in a section menu, which `openManageNavigation` opens first.
	const manageNavigation = await openManageNavigation(page);
	await expect(manageNavigation.getByRole('link', { name: 'Team' })).toBeVisible();

	// Chair works per committee, so an invitation to it names the committee.
	await createInvitationThroughTheForm(page, testInfo, {
		email: invited,
		role: 'Chair',
		committee: committeeName,
		title: 'Deputy Chair'
	});

	// Email delivery is Phase 2, so the page hands the organiser the link and
	// asks them to send it themselves.
	await expect(page.getByText(`Copy this link and send it to ${invited}`)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// And the link really is this invitation's: the token in the box is the token
	// in the row that was just written. The box is read-only, so its value is
	// what is checked rather than the words on the page.
	const token = await readInviteToken(conference.id, invited);

	await expect(page.getByRole('textbox', { name: /link/i })).toHaveValue(
		new RegExp(`/invites/${token}$`)
	);
	await expect(page.getByRole('button', { name: 'Copy link' }).first()).toBeVisible();

	// The invitation is read back through the page rather than out of the
	// database, because "creates a pending invitation" means the organiser can
	// see one: the list under "Waiting to accept" holds it, and the row offers
	// the two things that can still be done with it.
	const pending = pendingSection(page);

	await expect(pendingInvites(page)).toHaveCount(1);
	// `exact`, because the row also carries a line for a screen reader that reads
	// "Invitation link for {address}", and a loose match would find both.
	await expect(pending.getByText(invited, { exact: true })).toBeVisible();
	// The role they were invited as, the committee, and the day the link stops
	// working, on one line under the address.
	await expect(
		pending.getByText(`Chair · ${committeeName} · expires`, { exact: false })
	).toBeVisible();
	await expect(pending.getByRole('button', { name: 'Revoke' })).toBeVisible();
	await expect(pending.getByRole('button', { name: 'Copy link' })).toBeVisible();

	// Nobody has accepted it, so it has put nobody on the team yet: the line
	// under the title counts the owner and the invitation, and nobody else.
	await expect(summaryLine(page, '1 person · 1 invitation waiting')).toBeVisible();
});

test('refuses a second invitation to the same address, and one to somebody already on the team', async ({
	page
}, testInfo) => {
	const conference = await openTeamPage(page, 'Duplicate Invite MUN');
	const invited = unusedEmail();

	await createInvitationThroughTheForm(page, testInfo, { email: invited, role: 'Volunteer' });

	await expect(page.getByText(`Copy this link and send it to ${invited}`)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// The same address a second time. Both messages are looked for under the
	// Email field, which is where the spec puts them.
	await createInvitationThroughTheForm(page, testInfo, { email: invited, role: 'Organiser' });

	await expect(
		inviteSection(page).getByText('There is already a pending invitation for that address.')
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// And the organiser's own address. Creating a conference makes the account
	// the owner of the organisation that runs it, and an organisation member is
	// already on the team even without a `conference_staff` row of their own.
	await createInvitationThroughTheForm(page, testInfo, {
		email: conference.user.email,
		role: 'Volunteer'
	});

	await expect(inviteSection(page).getByText('That person is already on the team.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Neither refusal wrote anything: the one invitation from the top of the test
	// is still the only one.
	await expect(pendingInvites(page)).toHaveCount(1);
	expect(await countPendingInvites(conference.id)).toBe(1);
});

test('filters the team by role through the address, and counts what it lists', async ({
	page
}, testInfo) => {
	const conference = await openTeamPage(page, 'Team Filter MUN');

	const organiser = await createTestUser('Noor Haddad');
	const firstChair = await createTestUser('Aiko Tanaka');
	const secondChair = await createTestUser('Luis Moreno');
	const volunteer = await createTestUser('Emma Janssen');

	await addStaff(conference.id, organiser, 'organiser');
	await addStaff(conference.id, firstChair, 'chair');
	await addStaff(conference.id, secondChair, 'chair');
	await addStaff(conference.id, volunteer, 'volunteer');

	await page.reload();

	// The line under the title counts everybody, the owner among them. Roles are
	// not counted there, because somebody can hold several.
	await expect(summaryLine(page, '5 people')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// Everybody is on the unfiltered list.
	await expect(personRow(page, organiser.fullName)).toBeVisible();
	await expect(personRow(page, firstChair.fullName)).toBeVisible();
	await expect(personRow(page, secondChair.fullName)).toBeVisible();
	await expect(personRow(page, volunteer.fullName)).toBeVisible();

	// The filter is a GET form, so the address is what says which role is
	// picked and the browser's back button works. It names the role by its id,
	// because a conference's roles are its own rows.
	const chairRoleId = await presetRoleId(conference.id, PRESET_ROLE_NAMES.chair);
	const volunteerRoleId = await presetRoleId(conference.id, PRESET_ROLE_NAMES.volunteer);

	await filterByRole(page, testInfo, 'Chair');

	await expect(page).toHaveURL(`${conference.teamPath}?role=${chairRoleId}`, {
		timeout: DATABASE_TIMEOUT_MS
	});

	await expect(personRow(page, firstChair.fullName)).toBeVisible();
	await expect(personRow(page, secondChair.fullName)).toBeVisible();
	await expect(personRow(page, volunteer.fullName)).toHaveCount(0);
	await expect(personRow(page, organiser.fullName)).toHaveCount(0);
	await expect(teamSection(page).getByText('2 people', { exact: true })).toBeVisible();

	await filterByRole(page, testInfo, 'Volunteer');

	await expect(page).toHaveURL(`${conference.teamPath}?role=${volunteerRoleId}`, {
		timeout: DATABASE_TIMEOUT_MS
	});

	await expect(personRow(page, volunteer.fullName)).toBeVisible();
	await expect(personRow(page, firstChair.fullName)).toHaveCount(0);

	// And a refresh keeps it, because the address holds it.
	await page.reload();
	await expect(personRow(page, volunteer.fullName)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(personRow(page, firstChair.fullName)).toHaveCount(0);

	// Back to everybody.
	await filterByRole(page, testInfo, 'Everyone');

	await expect(page).toHaveURL(new RegExp(`${conference.teamPath}\\?role=all$`), {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(personRow(page, volunteer.fullName)).toBeVisible();
	await expect(personRow(page, firstChair.fullName)).toBeVisible();
});

test('lists the organisation members, and offers no way to change them', async ({ page }) => {
	const conference = await openTeamPage(page, 'Organisation Members MUN');

	// Creating a conference makes the account the owner of the organisation that
	// runs it. That is the row this test is about: it is on the page, because
	// these are the people who can already do everything, and it is not on the
	// team, because the team is what this page adds to.
	await expect(personRow(page, conference.user.fullName)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(shownInTeam(page, `Owner of ${conference.organizationName}`)).toBeVisible();

	// An organisation member has no controls at all: nothing to open, no roles
	// to edit.
	await expect(teamSection(page).getByText(`Manage ${conference.user.fullName}`)).toHaveCount(0);
	await expect(editRolesLink(page, conference.user.fullName)).toHaveCount(0);

	// Somebody who is on the team does, and "Remove from the team" is inside it.
	const chair = await createTestUser('Noor Haddad');

	await addStaff(conference.id, chair, 'chair');
	await page.reload();

	await expect(personRow(page, chair.fullName)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(editRolesLink(page, chair.fullName)).toBeVisible();

	await openManagePanel(page, chair.fullName);

	await expect(
		managePanel(page, chair.fullName).getByRole('button', { name: 'Remove from the team' })
	).toBeVisible();

	// And the owner still has none, now that there is one on the page to compare
	// it with: the only way off this page for them is the organisation itself.
	await expect(teamSection(page).getByText(`Manage ${conference.user.fullName}`)).toHaveCount(0);
});

test('lists an organiser who chairs a committee once, in their organisation row', async ({
	page
}) => {
	const conference = await openTeamPage(page, 'Organiser Chairs MUN');
	const committeeName = unusedName('Security Council');
	const committeeId = await addCommittee(conference.id, committeeName);

	/*
		"Chair it yourself" in the committee editor writes a `committee_chairs`
		row for the organiser. That makes them both an organisation member and
		somebody with a committee, and they are still one person: one row, the
		organisation's, which also says what they chair.
	*/
	await addChair(committeeId, conference.user.id);
	await page.reload();

	await expect(personRow(page, conference.user.fullName)).toHaveCount(1, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(shownInTeam(page, `Owner of ${conference.organizationName}`)).toBeVisible();
	await expect(chairedCommitteesLine(page, committeeName)).toHaveText(`Chairs ${committeeName}`);

	// They are counted once.
	await expect(summaryLine(page, '1 person')).toBeVisible();
});

test('says there is nobody on the team yet, until somebody is', async ({ page }) => {
	const conference = await openTeamPage(page, 'Empty Team MUN');

	// A conference of an hour old has an organisation behind it and nobody on its
	// team, and the section says so: the empty state is about the team, not
	// about the page, so the owner being listed above it does not answer it.
	await expect(personRow(page, conference.user.fullName)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(teamSection(page).getByText('No staff yet.')).toBeVisible();
	await expect(
		teamSection(page).getByText('Invite your chairs and volunteers by email.')
	).toBeVisible();

	// And it goes away the moment somebody is on the team.
	const chair = await createTestUser('Noor Haddad');

	await addStaff(conference.id, chair, 'chair');
	await page.reload();

	await expect(personRow(page, chair.fullName)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(teamSection(page).getByText('No staff yet.')).toHaveCount(0);
});

test('saves a new title, and gives somebody a second role and takes one away', async ({
	page
}, testInfo) => {
	const conference = await openTeamPage(page, 'Change Role MUN');
	const person = await createTestUser('Noor Haddad');

	await addStaff(conference.id, person, 'volunteer');
	await page.reload();

	await expect(personRow(page, person.fullName)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// The title first, in the row's own "⋯" panel.
	await openManagePanel(page, person.fullName);
	await managePanel(page, person.fullName).getByLabel('Title').fill('Deputy Chair');
	await managePanel(page, person.fullName)
		.getByRole('button', { name: 'Save title' })
		.press('Enter');

	await expect(page.getByText('Title saved.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(shownInTeam(page, 'Deputy Chair')).toBeVisible();

	// Then the roles. A person may hold several, so the dialog is a tick box per
	// role rather than one dropdown.
	await saveRoles(page, testInfo, person.fullName, { tick: ['Organiser'], untick: [] });
	await waitUntilAnswered(page);
	expect(await readStaff(conference.id, person.id)).toEqual({
		roles: ['Organiser', 'Volunteer'],
		title: 'Deputy Chair'
	});

	await saveRoles(page, testInfo, person.fullName, { tick: [], untick: ['Volunteer'] });
	await waitUntilAnswered(page);
	expect(await readStaff(conference.id, person.id)).toEqual({
		roles: ['Organiser'],
		title: 'Deputy Chair'
	});

	// Saving closes the dialog: the address no longer asks for it.
	await expect(page).not.toHaveURL(/edit=/);
});

test('makes a chair the chair of a committee, and takes the committee away again', async ({
	page
}) => {
	const conference = await openTeamPage(page, 'Assign Committee MUN');
	const committeeName = unusedName('Security Council');
	const committeeId = await addCommittee(conference.id, committeeName);
	const chair = await createTestUser('Aiko Tanaka');

	await addStaff(conference.id, chair, 'chair');
	await page.reload();

	await expect(personRow(page, chair.fullName)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	await openManagePanel(page, chair.fullName);
	await managePanel(page, chair.fullName)
		.getByLabel('Committee')
		.selectOption({ label: committeeName });
	await managePanel(page, chair.fullName)
		.getByRole('button', { name: 'Assign committee' })
		.press('Enter');

	// The committees somebody chairs are part of their row, so the page says so
	// without being asked anything else.
	await expect(chairedCommitteesLine(page, committeeName)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	expect(await readChairedCommitteeIds(chair.id)).toEqual([committeeId]);

	// And back off it. The button says which committee it drops, because a chair
	// can hold several.
	await openManagePanel(page, chair.fullName);
	await managePanel(page, chair.fullName)
		.getByRole('button', { name: `Not chair of ${committeeName}` })
		.press('Enter');

	await expect(chairedCommitteesLine(page, committeeName)).toHaveCount(0, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	expect(await readChairedCommitteeIds(chair.id)).toEqual([]);

	// Dropping the committee leaves the person on the team; only the committee
	// went away.
	expect(await readStaff(conference.id, chair.id)).toEqual({ roles: ['Chair'], title: null });
});

test('removes somebody from the team once the question is answered', async ({ page }) => {
	const conference = await openTeamPage(page, 'Remove Staff MUN');
	const person = await createTestUser('Luis Moreno');

	await addStaff(conference.id, person, 'volunteer');
	await page.reload();

	await expect(personRow(page, person.fullName)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	await openManagePanel(page, person.fullName);
	await pressAndConfirm(page, managePanel(page, person.fullName), 'Remove from the team');

	await expect(personRow(page, person.fullName)).toHaveCount(0, {
		timeout: DATABASE_TIMEOUT_MS
	});

	// The row is gone rather than merely hidden: the team row went with it, and
	// the line under the title counts the owner alone.
	await waitUntilAnswered(page);
	expect(await readStaff(conference.id, person.id)).toBeNull();
	await expect(summaryLine(page, '1 person')).toBeVisible();
});

test('offers no actions on somebody at or above the reader’s own role', async ({ page }) => {
	// The reader manages the team through a role of their own, rather than
	// owning the organisation, so the rank rule has a role to measure from. It
	// is not Organiser: an administrator may change anybody.
	const owner = await createTestUser('Priya Nair');
	const name = unusedName('Rank Rule MUN');
	const managePath = await createDraftConference(owner, {
		name,
		organizationName: unusedName('Rank Rule Society')
	});
	const conferenceId = await readConferenceId(slugOf(managePath));

	const reader = await createTestUser('Sofia Rossi');
	const peer = await createTestUser('Noor Haddad');
	const volunteer = await createTestUser('Tom Bakker');

	const headOfStaffRoleId = await addRole(conferenceId, 'Head of staff', ['manage_team']);

	await addStaffWithRole(conferenceId, reader, headOfStaffRoleId);
	await addStaffWithRole(conferenceId, peer, headOfStaffRoleId);
	await addStaff(conferenceId, volunteer, 'volunteer');

	await signIn(page, reader);
	await page.goto(`${managePath}/team`);

	await expect(personRow(page, volunteer.fullName)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// Below the reader: both ways in.
	await expect(editRolesLink(page, volunteer.fullName)).toBeVisible();
	await expect(
		teamSection(page).getByText(`Manage ${volunteer.fullName}`).filter({ visible: true })
	).toHaveCount(1);

	// The same role as the reader, and the reader's own row: neither.
	for (const person of [peer, reader]) {
		await expect(editRolesLink(page, person.fullName)).toHaveCount(0);
		await expect(teamSection(page).getByText(`Manage ${person.fullName}`)).toHaveCount(0);
	}

	// And the address that would open the dialog for the peer opens nothing.
	await page.goto(`${managePath}/team?edit=${peer.id}`);
	await expect(personRow(page, peer.fullName)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

// T142: with JavaScript a new title shows the moment "Save title" is pressed,
// before the server has saved it and with no spinner, and a removal the server
// refuses puts the person back with a toast saying what did not happen.
test('changes a title at once, and puts a refused removal back', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);

	const conference = await openTeamPage(page, 'Instant Team MUN');
	const person = await createTestUser('Mei Lin');

	await addStaff(conference.id, person, 'chair');
	await page.reload();
	await expect(personRow(page, person.fullName)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	await answerSlowly(page, 'updateTitle');
	await watchForSpinners(page);

	await openManagePanel(page, person.fullName);
	await managePanel(page, person.fullName).getByLabel('Title').fill('Rapporteur');
	await managePanel(page, person.fullName)
		.getByRole('button', { name: 'Save title' })
		.press('Enter');

	await expect(shownInTeam(page, 'Rapporteur')).toBeVisible({ timeout: AT_ONCE_TIMEOUT_MS });

	await waitUntilAnswered(page);
	expect(await sawSpinner(page)).toBe(false);
	expect(await readStaff(conference.id, person.id)).toEqual({
		roles: ['Chair'],
		title: 'Rapporteur'
	});

	await answerWithError(page, 'removeStaff');
	await openManagePanel(page, person.fullName);
	await pressAndConfirm(page, managePanel(page, person.fullName), 'Remove from the team');

	await expect(page.getByRole('alert')).toContainText('They were not removed from the team.', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	await expect(personRow(page, person.fullName)).toBeVisible();
	expect(await readStaff(conference.id, person.id)).toEqual({
		roles: ['Chair'],
		title: 'Rapporteur'
	});
});

test('does not spill off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	// Long names and a long address on purpose. A line that may not wrap is as
	// wide as its text however narrow its column is, which is what pushes a page
	// sideways, and a short name would never show it.
	const conference = await openTeamPage(
		page,
		'Phone Team International Model United Nations Conference'
	);

	const chair = await createTestUser('Maximiliano Alessandro Fernández de la Vega');
	const committeeId = await addCommittee(
		conference.id,
		'United Nations Educational, Scientific and Cultural Organization'
	);

	await addStaff(conference.id, chair, 'chair', 'Deputy Chair of the Historical Security Council');
	await addChair(committeeId, chair.id);
	await addInvite(
		conference.id,
		conference.user.id,
		'a-new-chair-with-a-long-address@averylongschoolnameindeed.example.com',
		'chair'
	);

	await page.reload();

	// Wait for the page to be the one this test is about before measuring it.
	await expect(personRow(page, chair.fullName)).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	await expectNoSidewaysOverflow(page);

	/*
		On a phone each person is a card, with their roles under the name.
		Measuring the two boxes is the only way to see it, and the page would not
		overflow if the roles stayed beside the name either, because a role is
		short. So this is its own assertion rather than part of the one above.
	*/
	// One card of the phone's list: the person, their role and their controls.
	const row = teamSection(page)
		.getByRole('listitem')
		.filter({ hasText: chair.fullName })
		.filter({ visible: true });

	// `.first()` because "Chair" may be in this card more than once; the roles
	// come first in the markup.
	const nameBox = await row.getByText(chair.fullName, { exact: true }).boundingBox();
	const roleBox = await row.getByText('Chair', { exact: true }).first().boundingBox();

	expect(nameBox).not.toBeNull();
	expect(roleBox).not.toBeNull();
	expect(roleBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height);

	// And with a person's controls open, which is the widest thing the page
	// draws: four small forms in a column no wider than the row above them.
	await openManagePanel(page, chair.fullName);

	await expect(
		managePanel(page, chair.fullName).getByRole('button', { name: 'Save title' })
	).toBeVisible();

	await expectNoSidewaysOverflow(page);
});

test('fits in a few screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const conference = await openTeamPage(page, 'Height Check Team MUN');

	// A team of the size a small conference has: an organiser beside the owner,
	// four chairs, two volunteers and two invitations still out.
	const team: { name: string; role: 'organiser' | 'chair' | 'volunteer'; title: string }[] = [
		{ name: 'Noor Haddad', role: 'organiser', title: 'Secretary General' },
		{ name: 'Aiko Tanaka', role: 'chair', title: 'Chair' },
		{ name: 'Luis Moreno', role: 'chair', title: 'Chair' },
		{ name: 'Emma Janssen', role: 'chair', title: 'Vice Chair' },
		{ name: 'Omar Farouk', role: 'chair', title: 'Chair' },
		{ name: 'Sara Lindqvist', role: 'volunteer', title: 'Press' },
		{ name: 'Tom Bakker', role: 'volunteer', title: 'Runner' }
	];

	for (const member of team) {
		const user = await createTestUser(member.name);

		await addStaff(conference.id, user, member.role, member.title);
	}

	await addInvite(conference.id, conference.user.id, unusedEmail(), 'chair');
	await addInvite(conference.id, conference.user.id, unusedEmail(), 'volunteer');

	await page.reload();

	await expect(pendingInvites(page)).toHaveCount(2, { timeout: DATABASE_TIMEOUT_MS });

	// Saved before the assertion, so that a failure leaves a picture of the page
	// that failed it.
	await saveFullPageScreenshot(page, 'manage-team');
	await expectPageFitsInScreens(page, MANAGE_TEAM_SCREENS);
});
