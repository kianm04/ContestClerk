import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	createTestUser,
	makeConferenceStaff,
	presetRoleId,
	signIn,
	type TestUser
} from './signed-in-user';
import { createDraftConferenceFor } from './draft-conference';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { waitUntilAnswered } from './chair-room-fixtures';
import { skipWithoutJavaScript } from './in-place';
import {
	AT_ONCE_TIMEOUT_MS,
	answerSlowly,
	answerWithError,
	sawSpinner,
	watchForSpinners
} from './instant';

// The two panels `specs/05-pages/organiser/committee-edit.md` gives the
// committee editor — Chairs and Background guide — and the line
// `specs/05-pages/organiser/committees.md` gives each row of the list, its
// background guide with "Papers 9/12" under it. They are the part of those two pages T21 could not
// build: a chair needs somebody with a `conference_staff` row (T22), and a
// guide needs the `documents` table (T34).
//
// What needs a real browser, and so is here rather than in a unit test:
//
// * the picker offers the conference's chair staff and nobody else, and adding
//   one with a title puts them in the list;
// * somebody who is not on the chair team is refused by the action itself, not
//   only left out of the picker;
// * removing a chair takes the row away and offers them again;
// * T175: "Invite a chair" writes a chair invitation to this committee, shows
//   its link and lists it under "Waiting to accept" until it is withdrawn, and
//   accepting it makes the person a chair of this committee; an address that
//   already chairs it, or an organiser's, is refused; "Chair it yourself" adds
//   the reader, and "Open chair room" opens this committee's room;
// * a PDF really reaches Supabase Storage, comes back with a name, a size and a
//   download link, and is replaced and removed;
// * a file that is not a PDF is refused;
// * the committees list says "Uploaded" once there is one and "Papers n/m" once
//   a delegate has handed one in;
// * the editor with both panels on it still fits a phone and a few screens.
//
// EVERY ACTION WITHOUT JAVASCRIPT
// That criterion is met by these tests running on the `desktop-no-js` project
// like every other browser test, rather than by a test of its own. "Add chair",
// each chair's own remove button, "Invite", "Withdraw", "Chair it yourself",
// "Upload guide", "Replace guide" and "Remove guide" are all real submit buttons in real `<form method="post">` elements,
// and the guide's form carries `enctype="multipart/form-data"`, so a browser
// with no script posts every one of them. The two tests that measure a page are
// the exception: they ask the browser for its own dimensions, and each runs on
// one project alone.
//
// WHAT THESE TESTS LEAVE BEHIND
// Each test creates its own conference through `./draft-conference`, with an
// organisation of its own, and what it creates stays in the database until the
// next `pnpm db:reset`. They are dated in 2020 for the reason
// `tests/e2e/manage-dashboard.spec.ts` gives: `/conferences` lists conferences
// that are published *and* have not finished, and
// `tests/e2e/conferences.spec.ts` counts what is in it. Nothing here takes a
// committee, a seat or a delegate from `supabase/seed.sql`, and nothing here
// publishes a conference.
//
// `createDraftConference`, `slugOf`, `readConferenceId`,
// `signInWithAConference`, `addCommittee` and `postFormAction` below are copies
// of the ones in `tests/e2e/manage-committees.spec.ts`, and are deliberately
// copies rather than shared imports for the reason that file gives about its
// own: each file wants its own dates and its own extra fields.

/**
 * How long an assertion that waits on a page reading the database may take.
 *
 * Longer than the five seconds Playwright waits by default, for the reason
 * `tests/e2e/conferences.spec.ts` gives: every test in the run asks the one
 * local database at once, and an answer has taken up to eight seconds.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * The days every conference these tests create runs on.
 * Both are in the past, for the reason at the top of this file.
 */
const CONFERENCE_FIRST_DAY = '2020-05-03';
const CONFERENCE_LAST_DAY = '2020-05-05';

/**
 * How many windows tall the editor may be with both of these panels on it.
 *
 * The same number `COMMITTEE_EDITOR_SCREENS` in
 * `tests/e2e/manage-committees.spec.ts` holds the page to, and that file says
 * why it is one more than the list beside it: the two panels are a sixth and a
 * seventh section on a page that was measured at three with five of them, and
 * the "Resolutions" settings since step 4 of `docs/committee-papers.md`.
 */
const EDITOR_SCREENS = 5;

/**
 * The name of the Chairs panel's picker of the conference's chair staff. It
 * is not simply "Chair", because a name is matched as a part of a longer one
 * and every button in the panel says "chair" somewhere.
 */
const CHAIR_PICKER_NAME = 'Or choose from your team';

/** A name nothing else in the database will match. */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * A small real PDF, as the bytes a file input hands over.
 *
 * It is the shortest thing a PDF reader will open: the header, one object and
 * the trailer. The bucket checks the type the browser declares rather than the
 * bytes, but a file that is really a PDF is what an organiser uploads.
 */
function pdfBytes(text: string): Buffer {
	return Buffer.from(`%PDF-1.4\n% ${text}\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n`);
}

/**
 * Give `user` a draft conference of its own, run by a brand-new organisation,
 * and answer its `/manage/<slug>` address.
 *
 * The rows are written straight into the database by `./draft-conference`,
 * whose comment says why: the one-step `/create` form these tests used to fill
 * in is gone, and the creation flow that replaced it has its own
 * `create-*.spec.ts` files.
 */
async function createDraftConference(user: TestUser, name: string): Promise<string> {
	const draft = await createDraftConferenceFor(user, {
		name,
		organizationName: unusedName(`${name} Society`),
		startDate: CONFERENCE_FIRST_DAY,
		endDate: CONFERENCE_LAST_DAY
	});

	return `/manage/${draft.slug}`;
}

/** The slug at the end of a `/manage/<slug>` address. */
function slugOf(managePath: string): string {
	return managePath.split('/').pop() ?? '';
}

/** The id of the conference a `/manage/<slug>` address names. */
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

/** A signed-in organiser with a conference and one committee of their own. */
type TestEditor = {
	user: TestUser;
	conferenceId: string;
	slug: string;
	committeeId: string;
	/** The `/manage/<slug>/committees` address of the list. */
	committeesPath: string;
	/** The `/manage/<slug>/committees/<id>` address of the editor. */
	editorPath: string;
};

/**
 * Write one committee straight into the table, and answer its id.
 *
 * The committee form is `tests/e2e/manage-committees.spec.ts`'s subject, so the
 * tests here are handed their committee rather than typing one in. The
 * service-role client stands in for the form and is never used to show that
 * something is allowed, which is what `tests/db/supabase-test-client.ts` warns
 * against.
 */
async function addCommittee(conferenceId: string, name: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committees')
		.insert({
			conference_id: conferenceId,
			name,
			abbreviation: 'UNSC',
			slug: `committee-${crypto.randomUUID().slice(0, 8)}`,
			level: 'advanced',
			topics: ['The first topic'],
			position: 0
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test committee: ${error?.message}`);
	}

	return data.id;
}

/** Sign a brand-new organiser in, give them a conference and open one committee's editor. */
async function openCommitteeEditor(page: Page, prefix: string): Promise<TestEditor> {
	const user = await createTestUser('Priya Nair');
	await signIn(page, user);

	const managePath = await createDraftConference(user, unusedName(prefix));
	const slug = slugOf(managePath);
	const conferenceId = await readConferenceId(slug);
	const committeeId = await addCommittee(conferenceId, 'Security Council');
	const editorPath = `${managePath}/committees/${committeeId}`;

	await page.goto(editorPath);

	// Waiting for the heading rather than for the address is what says the page
	// has arrived: the editor's title is the committee's full name.
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		'Security Council',
		{ timeout: DATABASE_TIMEOUT_MS }
	);

	return {
		user,
		conferenceId,
		slug,
		committeeId,
		committeesPath: `${managePath}/committees`,
		editorPath
	};
}

/** The Chairs panel. `FormSection` gives each panel its title as an `aria-label`. */
function chairsPanel(page: Page) {
	return page.getByRole('region', { name: 'Chairs' });
}

/** The Background guide panel. */
function guidePanel(page: Page) {
	return page.getByRole('region', { name: 'Background guide' });
}

/**
 * Post straight to a form action, without a form.
 *
 * It is how a test reaches a refusal that no button on the page can ask for:
 * the picker does not offer somebody who is not on the chair team, so the only
 * way to see the server refuse them is to send the request by hand. `origin`
 * and `accept` are what SvelteKit wants before it will run an action.
 */
async function postFormAction(
	page: Page,
	action: string,
	fields: Record<string, string> = {}
): Promise<APIResponse> {
	const origin = new URL(page.url()).origin;

	return page.request.post(action, {
		form: fields,
		headers: { origin, accept: 'text/html' }
	});
}

/** Put a new chair on the conference's staff, and answer the account. */
async function addChairToTheTeam(conferenceId: string, fullName: string): Promise<TestUser> {
	const chair = await createTestUser(fullName);

	await makeConferenceStaff(chair, conferenceId, 'chair');

	return chair;
}

/** Make `chair` a chair of the committee `committeeId`, the way "Add chair" saves it. */
async function makeCommitteeChair(committeeId: string, chair: TestUser): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('committee_chairs')
		.insert({ committee_id: committeeId, user_id: chair.id });

	if (error) {
		throw new Error(`Could not make the test account a chair: ${error.message}`);
	}
}

/** The user ids of everybody who chairs the committee `committeeId`, as the database says. */
async function readCommitteeChairIds(committeeId: string): Promise<string[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('committee_chairs')
		.select('user_id')
		.eq('committee_id', committeeId);

	if (error) {
		throw new Error(`Could not read the committee's chairs: ${error.message}`);
	}

	return data.map((row) => row.user_id);
}

test('a committee with no chairs says so, and offers inviting and chairing it yourself', async ({
	page
}) => {
	await openCommitteeEditor(page, 'Chairs Empty MUN');
	const panel = chairsPanel(page);

	await expect(panel.getByText('No chairs yet.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// T175: the panel invites its own chairs, so nobody has to be on the team
	// first and there is no link away to the team page any more.
	await expect(panel.getByRole('textbox', { name: 'Invite a chair' })).toBeVisible();
	await expect(panel.getByRole('button', { name: 'Chair it yourself' })).toBeVisible();
	await expect(panel.getByRole('link', { name: 'Invite chairs →' })).toHaveCount(0);

	// The conference has no chair on its staff, so there is nobody to choose.
	await expect(panel.getByText('Or choose from your team')).toHaveCount(0);
	await expect(panel.getByRole('combobox', { name: CHAIR_PICKER_NAME })).toHaveCount(0);
});

/** The `invites` rows written for the committee `committeeId`, as the database holds them. */
async function readCommitteeInvites(committeeId: string) {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('invites')
		.select('kind, role_id, email, title, conference_id, token')
		.eq('committee_id', committeeId);

	if (error) {
		throw new Error(`Could not read the committee's invitations: ${error.message}`);
	}

	return data;
}

/** Type an address into "Invite a chair" and press "Invite". */
async function inviteChairByEmail(page: Page, email: string): Promise<void> {
	const panel = chairsPanel(page);

	await panel.getByRole('textbox', { name: 'Invite a chair' }).fill(email);
	await panel.getByRole('button', { name: 'Invite', exact: true }).press('Enter');
}

test('a chair invited by email is listed with its link until it is withdrawn', async ({
	page,
	browserName
}, testInfo) => {
	const editor = await openCommitteeEditor(page, 'Chairs Invite MUN');
	const email = `new-chair-${crypto.randomUUID().slice(0, 8)}@example.com`;

	await inviteChairByEmail(page, email);

	await expect(page.getByText(`Copy this link and send it to ${email}`)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// The same shape of row the team page's form writes for a chair of this
	// committee: an invitation to the conference's Chair role.
	const invites = await readCommitteeInvites(editor.committeeId);

	expect(invites).toEqual([
		expect.objectContaining({
			kind: 'conference_staff',
			role_id: await presetRoleId(editor.conferenceId, 'Chair'),
			email,
			title: null,
			conference_id: editor.conferenceId
		})
	]);

	const panel = chairsPanel(page);

	await expect(panel.getByText('Waiting to accept')).toBeVisible();
	await expect(panel.getByText(email, { exact: true })).toBeVisible();
	await expect(panel.getByRole('button', { name: 'Copy link' })).toBeVisible();
	await expect(panel.getByRole('textbox', { name: `Invitation link for ${email}` })).toHaveValue(
		new RegExp(`/invites/${invites[0].token}$`)
	);

	/*
		"Copy link" is the one button here that needs JavaScript: it writes to the
		browser's clipboard. The desktop project presses it and reads the clipboard
		back, which Chromium allows once the page is granted both permissions.
		Safari never lets a script read the clipboard back, so the check is
		Chromium's alone (T163). Without JavaScript the box above is how the link
		is copied.
	*/
	if (testInfo.project.name === 'desktop' && browserName === 'chromium') {
		await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
		await panel.getByRole('button', { name: 'Copy link' }).click();

		await expect
			.poll(() => page.evaluate(() => navigator.clipboard.readText()))
			.toMatch(new RegExp(`/invites/${invites[0].token}$`));
	}

	await panel.getByRole('button', { name: 'Withdraw' }).press('Enter');

	await expect(chairsPanel(page).getByText(email, { exact: true })).toHaveCount(0, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect.poll(() => readCommitteeInvites(editor.committeeId)).toEqual([]);
});

test('an address that already chairs the committee, or an organiser, is not invited', async ({
	page
}) => {
	const editor = await openCommitteeEditor(page, 'Chairs Invite Refused MUN');
	const chair = await addChairToTheTeam(editor.conferenceId, 'Aiko Tanaka');

	await makeCommitteeChair(editor.committeeId, chair);
	await page.reload();

	await inviteChairByEmail(page, chair.email);

	await expect(
		chairsPanel(page).getByText('That person already chairs this committee.')
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// The organiser themselves: accepting a chair invitation would demote them.
	await inviteChairByEmail(page, editor.user.email);

	await expect(
		chairsPanel(page).getByText('That person organises this conference.', { exact: false })
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	expect(await readCommitteeInvites(editor.committeeId)).toEqual([]);
});

test('accepting a chair invitation makes the person a chair of this committee', async ({
	page
}) => {
	const editor = await openCommitteeEditor(page, 'Chairs Invite Accept MUN');
	const invited = await createTestUser('Nadia Rahman');

	await inviteChairByEmail(page, invited.email);

	await expect(page.getByText(`Copy this link and send it to ${invited.email}`)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	const [invite] = await readCommitteeInvites(editor.committeeId);

	// The invited person opens the link in their own session.
	await page.context().clearCookies();
	await signIn(page, invited);
	await page.goto(`/invites/${invite.token}`);
	await page.getByRole('button', { name: 'Accept invite' }).press('Enter');

	await expect.poll(() => readCommitteeChairIds(editor.committeeId)).toEqual([invited.id]);
});

test('an organiser can chair the committee themselves, then open its chair room', async ({
	page
}) => {
	const editor = await openCommitteeEditor(page, 'Chairs Yourself MUN');

	await chairsPanel(page).getByRole('button', { name: 'Chair it yourself' }).press('Enter');

	await expect(page.getByText('You now chair Security Council.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(chairsPanel(page).getByText(editor.user.fullName)).toBeVisible();

	// Only the reader was added, and the button goes once they chair it.
	expect(await readCommitteeChairIds(editor.committeeId)).toEqual([editor.user.id]);
	await expect(chairsPanel(page).getByRole('button', { name: 'Chair it yourself' })).toHaveCount(0);

	await page.getByRole('main').getByRole('link', { name: 'Open chair room' }).click();

	await expect(page).toHaveURL(new RegExp(`/conferences/${editor.slug}/committees/[^/]+/chair$`), {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('link', { name: 'Dashboard', exact: true }).first()).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('only the conference chair staff can be added as chairs, with a title', async ({ page }) => {
	const editor = await openCommitteeEditor(page, 'Chairs Add MUN');
	const chair = await addChairToTheTeam(editor.conferenceId, 'Aiko Tanaka');
	const stranger = await createTestUser('Nobody Here');

	await page.reload();

	const panel = chairsPanel(page);
	const picker = panel.getByRole('combobox', { name: CHAIR_PICKER_NAME });

	// The picker offers the conference's own chair staff and nobody else.
	await expect(picker).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(picker.getByRole('option', { name: chair.fullName })).toHaveCount(1);
	await expect(picker.getByRole('option', { name: stranger.fullName })).toHaveCount(0);

	await picker.selectOption({ label: chair.fullName });
	await panel.getByLabel('Title').fill('Vice Chair');
	await panel.getByRole('button', { name: 'Add chair' }).click();

	await expect(page.getByText('Chair added.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(chairsPanel(page).getByText(chair.fullName)).toBeVisible();
	await expect(chairsPanel(page).getByText('Vice Chair')).toBeVisible();

	// And they are no longer on offer, because they already chair it.
	await expect(
		chairsPanel(page).getByRole('combobox', { name: CHAIR_PICKER_NAME }).getByRole('option', {
			name: chair.fullName
		})
	).toHaveCount(0);

	// The committees list names the chair, and stops offering to invite one.
	await page.goto(editor.committeesPath);

	await expect(page.getByRole('main').getByText(`Chairs: ${chair.fullName}`)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('main').getByRole('link', { name: 'Invite a chair to' })).toHaveCount(
		0
	);
});

test('the server refuses a chair who is not on this conference team', async ({ page }) => {
	const editor = await openCommitteeEditor(page, 'Chairs Refused MUN');
	const stranger = await createTestUser('Outside Person');

	// Nobody can press a button for this: the picker never offers them. The
	// request is sent by hand, because a name that is not drawn is not a rule.
	const refused = await postFormAction(page, `${editor.editorPath}?/addChair`, {
		userId: stranger.id,
		title: 'Chair'
	});

	expect(refused.status()).toBe(400);
	expect(await refused.text()).toContain('Only a chair on this conference team can chair');

	await page.reload();

	await expect(chairsPanel(page).getByText('No chairs yet.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('a chair can be taken off the committee again', async ({ page }) => {
	const editor = await openCommitteeEditor(page, 'Chairs Remove MUN');
	const chair = await addChairToTheTeam(editor.conferenceId, 'Luis Moreno');

	await page.reload();

	const panel = chairsPanel(page);

	await panel
		.getByRole('combobox', { name: CHAIR_PICKER_NAME })
		.selectOption({ label: chair.fullName }, { timeout: DATABASE_TIMEOUT_MS });
	await panel.getByRole('button', { name: 'Add chair' }).click();

	await expect(chairsPanel(page).getByText(chair.fullName)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await chairsPanel(page)
		.getByRole('button', { name: `Remove ${chair.fullName} as a chair` })
		.click();

	await expect(chairsPanel(page).getByText('No chairs yet.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// They are on the team still, so the picker offers them once more.
	await expect(
		chairsPanel(page).getByRole('combobox', { name: CHAIR_PICKER_NAME }).getByRole('option', {
			name: chair.fullName
		})
	).toHaveCount(1);
});

// T142: with JavaScript a chair leaves the list the moment "Remove" is pressed,
// before the server has saved it and with no spinner, and a removal the server
// refuses puts the chair back with a toast saying what did not happen.
test('a chair goes at once, and a refused removal comes back', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);

	const editor = await openCommitteeEditor(page, 'Instant Chairs MUN');
	const leaving = await addChairToTheTeam(editor.conferenceId, 'Omar Haddad');
	const staying = await addChairToTheTeam(editor.conferenceId, 'Zara Ahmed');

	await makeCommitteeChair(editor.committeeId, leaving);
	await makeCommitteeChair(editor.committeeId, staying);
	await page.reload();
	await expect(chairsPanel(page).getByText(staying.fullName)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await answerSlowly(page, 'removeChair');
	await watchForSpinners(page);

	const leavingButton = chairsPanel(page).getByRole('button', {
		name: `Remove ${leaving.fullName} as a chair`
	});
	await leavingButton.click();

	await expect(leavingButton).toHaveCount(0, { timeout: AT_ONCE_TIMEOUT_MS });

	await waitUntilAnswered(page);
	expect(await sawSpinner(page)).toBe(false);
	expect(await readCommitteeChairIds(editor.committeeId)).toEqual([staying.id]);

	await answerWithError(page, 'removeChair');
	await chairsPanel(page)
		.getByRole('button', { name: `Remove ${staying.fullName} as a chair` })
		.click();

	await expect(page.getByRole('alert')).toContainText('The chair was not removed.', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	await expect(
		chairsPanel(page).getByRole('button', { name: `Remove ${staying.fullName} as a chair` })
	).toBeVisible();
	expect(await readCommitteeChairIds(editor.committeeId)).toEqual([staying.id]);
});

test('a background guide can be uploaded, replaced, downloaded and removed', async ({ page }) => {
	const editor = await openCommitteeEditor(page, 'Guide MUN');
	const panel = guidePanel(page);

	// The panel says what the file is called and how big it is, so the size is
	// counted from the bytes being uploaded rather than written out: a change to
	// `pdfBytes` above must not turn into a puzzle here.
	const firstGuide = pdfBytes('first');
	const secondGuide = pdfBytes('second');

	await expect(panel.getByText('No background guide yet.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await panel.getByLabel('Background guide').setInputFiles({
		name: 'unsc-guide.pdf',
		mimeType: 'application/pdf',
		buffer: firstGuide
	});
	await panel.getByRole('button', { name: 'Upload guide' }).click();

	await expect(page.getByText('Background guide uploaded.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(
		guidePanel(page).getByText(`unsc-guide.pdf · ${firstGuide.length} bytes`)
	).toBeVisible();

	// The link is a signed address at Supabase Storage rather than a page of
	// ours, and it really serves the bytes that were uploaded.
	const download = guidePanel(page).getByRole('link', { name: 'Download' });

	await expect(download).toBeVisible();

	const signedUrl = await download.getAttribute('href');
	const downloaded = await page.request.get(signedUrl ?? '');

	expect(downloaded.status()).toBe(200);
	expect(await downloaded.text()).toContain('% first');

	// Replacing it writes the new file over the old one, and there is still only
	// one guide: `documents_one_guide_per_committee` allows a committee one.
	await guidePanel(page).getByLabel('Background guide').setInputFiles({
		name: 'unsc-guide-v2.pdf',
		mimeType: 'application/pdf',
		buffer: secondGuide
	});
	await guidePanel(page).getByRole('button', { name: 'Replace guide' }).click();

	await expect(
		guidePanel(page).getByText(`unsc-guide-v2.pdf · ${secondGuide.length} bytes`)
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(
		guidePanel(page).getByText(`unsc-guide.pdf · ${firstGuide.length} bytes`)
	).toHaveCount(0);

	// The list says the committee has one now, in its "Background guide" column.
	await page.goto(editor.committeesPath);

	await expect(page.getByRole('main').getByText('Uploaded', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await page.goto(editor.editorPath);

	await guidePanel(page)
		.getByRole('button', { name: 'Remove guide' })
		.click({ timeout: DATABASE_TIMEOUT_MS });

	await expect(page.getByText('Background guide removed.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(guidePanel(page).getByText('No background guide yet.')).toBeVisible();

	await page.goto(editor.committeesPath);

	// `exact`, because the row's chairs cell says "None yet ·" as well.
	await expect(page.getByRole('main').getByText('None yet', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('a file that is not a PDF is refused', async ({ page }) => {
	const editor = await openCommitteeEditor(page, 'Guide Refused MUN');

	// The file box carries `accept="application/pdf"`, which is the browser being
	// helpful rather than a rule, so the file is chosen past it to reach the
	// server's own answer.
	await guidePanel(page)
		.getByLabel('Background guide')
		.setInputFiles({
			name: 'notes.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from('Not a guide at all.')
		});
	await guidePanel(page).getByRole('button', { name: 'Upload guide' }).click();

	await expect(page.getByText('Please upload a PDF.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await page.goto(editor.editorPath);

	await expect(guidePanel(page).getByText('No background guide yet.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('"Papers n/m" counts position papers against filled seats', async ({ page }) => {
	const editor = await openCommitteeEditor(page, 'Papers MUN');
	const admin = createServiceRoleClient();
	const delegate = await createTestUser('Amina Otoo');

	// One seat, filled. Allocation is T16's and T28's work and has no form on
	// this page, so the row is written the way `giveSeat` in `signed-in-user.ts`
	// writes one.
	const { data: seat, error: seatError } = await admin
		.from('seats')
		.insert({
			committee_id: editor.committeeId,
			name: 'Ghana',
			position: 0,
			user_id: delegate.id,
			allocated_at: new Date().toISOString()
		})
		.select('id')
		.single();

	if (seatError || !seat) {
		throw new Error(`Could not seat the test delegate: ${seatError?.message}`);
	}

	await page.goto(editor.committeesPath);

	// Nobody has handed anything in yet. The papers line sits under the row's
	// background guide, which is still "None yet" (`exact`, because the chairs
	// cell says "None yet ·" as well).
	await expect(page.getByRole('main').getByText('Papers 0/1', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('main').getByText('None yet', { exact: true })).toBeVisible();

	// The delegate's own upload form is T37's page, so the row is written here
	// the way that page will. Only the row is needed: the count reads the table.
	const { error: paperError } = await admin.from('documents').insert({
		conference_id: editor.conferenceId,
		committee_id: editor.committeeId,
		seat_id: seat.id,
		uploaded_by: delegate.id,
		kind: 'position_paper',
		title: 'Ghana position paper',
		storage_path: `${editor.conferenceId}/position-papers/${seat.id}-${crypto.randomUUID()}.pdf`,
		file_name: 'ghana.pdf',
		file_size_bytes: 1024,
		mime_type: 'application/pdf',
		review_status: 'submitted'
	});

	if (paperError) {
		throw new Error(`Could not write the test position paper: ${paperError.message}`);
	}

	await page.reload();

	await expect(page.getByRole('main').getByText('Papers 1/1', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('the editor with both panels does not spill off a phone', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone can overflow sideways.');

	const editor = await openCommitteeEditor(page, 'Panels Phone MUN');

	await addChairToTheTeam(editor.conferenceId, 'Wilhelmina Vandersteen');

	await page.reload();

	await expect(chairsPanel(page).getByText('No chairs yet.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// A waiting invitation's row carries a long address and its link (T175).
	await inviteChairByEmail(page, `a-rather-long-address-${crypto.randomUUID()}@example.com`);

	await expect(chairsPanel(page).getByText('Waiting to accept')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await expectNoSidewaysOverflow(page);
});

test('the editor with both panels still fits in a few screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const editor = await openCommitteeEditor(page, 'Panels Height MUN');
	const chair = await addChairToTheTeam(editor.conferenceId, 'Aiko Tanaka');

	await page.reload();

	const panel = chairsPanel(page);

	await panel
		.getByRole('combobox', { name: CHAIR_PICKER_NAME })
		.selectOption({ label: chair.fullName }, { timeout: DATABASE_TIMEOUT_MS });
	await panel.getByRole('button', { name: 'Add chair' }).click();

	await expect(chairsPanel(page).getByText(chair.fullName)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await guidePanel(page)
		.getByLabel('Background guide')
		.setInputFiles({
			name: 'unsc-guide.pdf',
			mimeType: 'application/pdf',
			buffer: pdfBytes('height')
		});
	await guidePanel(page).getByRole('button', { name: 'Upload guide' }).click();

	await expect(guidePanel(page).getByRole('link', { name: 'Download' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Saved before the assertion, so that a failure leaves a picture of the page
	// that failed it.
	await saveFullPageScreenshot(page, 'manage-committee-edit-panels');
	await expectPageFitsInScreens(page, EDITOR_SCREENS);
});
