import { expect, test, type Page } from '@playwright/test';
import { makeChairedCommittee, startSession, waitForConsoleScript } from './chair-room-fixtures';
import { addWorkingPaper, makePaperCommittee } from './committee-paper-fixtures';
import {
	createOrganisationFor,
	createPublishedConferenceFor,
	deleteConferencesOf
} from './draft-conference';
import { waitForEditor } from './paper-editor';
import { createTestUser, signIn } from './signed-in-user';

// Security review L41: the headers every page is sent with, and the
// Content-Security-Policy among them. `vite.config.ts` writes the policy and
// `src/hooks.server.ts` the other five.
//
// A policy lists where a page may load scripts, styles, pictures and
// connections from. A browser that meets something not on the list drops it
// and says so in its console alone, so a policy that blocks something a page
// needs is worse than none: the page half works and nothing fails loudly.
// After checking the headers once, this file therefore opens the pages a
// visitor, a delegate, an organiser, a chair and a paper's author really use,
// and fails on any console line that names the policy. Add a page here when it
// starts loading something from somewhere new.
//
// Every test runs on the three projects. The one without JavaScript matters as
// much as the others: the browser checks the `style="…"` the server rendered
// whether or not a script runs, and reports a refusal the same way.

// Each test signs in and opens half a dozen pages, which on a shared machine
// takes longer than the thirty seconds a test gets by default.
test.describe.configure({ timeout: 120_000 });

/**
 * A browser line about the policy. Chrome writes "Refused to apply inline
 * style because it violates the following Content Security Policy directive";
 * WebKit names "the Content Security Policy" as well.
 */
const POLICY_LINE = /content security policy/i;

/** A seeded conference whose applications are open. */
const OPEN_CONFERENCE_SLUG = 'amsterdammun-2027';

/** A seeded committee page, with its flags from flagcdn. */
const COMMITTEE_PATH = '/conferences/hagueimun-2026/committees/general-assembly-first';

/**
 * Start writing down every console line and page error about the policy. The
 * list is answered at once and fills up as pages are opened, so a test reads
 * it at the end.
 */
function listenForRefusals(page: Page): string[] {
	const refusals: string[] = [];

	page.on('console', (message) => {
		if (POLICY_LINE.test(message.text())) {
			refusals.push(`${page.url()}  ${message.text()}`);
		}
	});
	page.on('pageerror', (error) => {
		if (POLICY_LINE.test(error.message)) {
			refusals.push(`${page.url()}  ${error.message}`);
		}
	});

	return refusals;
}

/**
 * Open a page and wait until it has stopped loading things: the document, its
 * scripts and styles, and whatever those asked for next. Only then has the
 * browser met everything the policy could refuse.
 */
async function open(page: Page, path: string): Promise<void> {
	const response = await page.goto(path);

	expect(response?.ok(), `${path} answered ${response?.status()}`).toBe(true);
	await page.waitForLoadState('networkidle');
}

test('every answer carries the headers, and the policy the nonce SvelteKit adds', async ({
	page
}) => {
	// A public page, a page with a form, and a page that does not exist: the
	// error page is rendered by the same server and must be sent the same way.
	for (const path of ['/', '/login', '/nowhere-at-all']) {
		const response = await page.goto(path);
		const headers = response?.headers() ?? {};

		expect(headers['x-content-type-options'], path).toBe('nosniff');
		expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
		expect(headers['x-frame-options'], path).toBe('DENY');
		expect(headers['permissions-policy'], path).toBe('camera=(), microphone=(), geolocation=()');
		expect(headers['strict-transport-security'], path).toBe('max-age=31536000; includeSubDomains');

		const policy = headers['content-security-policy'] ?? '';

		expect(policy, path).toContain("default-src 'self'");
		expect(policy, path).toContain("frame-ancestors 'none'");
		expect(policy, path).toContain("object-src 'none'");
		// SvelteKit starts every page with a small inline script. The policy
		// allows scripts from this site alone, so SvelteKit adds a one-time nonce
		// for that script to the header and to the tag; without it no page would
		// come to life.
		expect(policy, path).toMatch(/script-src 'self' 'nonce-[^']+'/);
	}
});

test('a visitor meets no refusal on the public pages', async ({ page }) => {
	const refusals = listenForRefusals(page);

	for (const path of [
		'/',
		'/conferences',
		`/conferences/${OPEN_CONFERENCE_SLUG}`,
		COMMITTEE_PATH,
		'/for-organisers',
		'/login',
		'/register',
		'/styleguide',
		'/terms'
	]) {
		await open(page, path);
	}

	expect(refusals).toEqual([]);
});

test('a delegate meets no refusal on their own pages', async ({ page }) => {
	const refusals = listenForRefusals(page);
	const delegate = await createTestUser('Csp Delegate');

	// The login form is opened and submitted with the listener already on, so
	// signing in is checked along with everything after it.
	await signIn(page, delegate);

	for (const path of [
		'/home',
		'/profile',
		'/applications',
		'/invoices',
		'/notifications',
		'/settings',
		`/conferences/${OPEN_CONFERENCE_SLUG}/apply`
	]) {
		await open(page, path);
	}

	expect(refusals).toEqual([]);
});

test('an organiser meets no refusal on the management pages', async ({ page }) => {
	const refusals = listenForRefusals(page);
	const organiser = await createTestUser('Csp Organiser');
	const organisation = await createOrganisationFor(organiser);
	const conference = await createPublishedConferenceFor(organiser, {
		organizationId: organisation.id
	});

	try {
		await signIn(page, organiser);

		for (const path of [
			`/manage/${conference.slug}`,
			`/manage/${conference.slug}/applications`,
			`/manage/${conference.slug}/allocation`,
			`/manage/${conference.slug}/fees`,
			`/manage/${conference.slug}/schedule`,
			`/manage/organizations/${organisation.slug}`
		]) {
			await open(page, path);
		}

		expect(refusals).toEqual([]);
	} finally {
		// An upcoming published conference left behind would push the seeded
		// ones off the directory's first page (`tests/e2e/conferences.spec.ts`).
		await deleteConferencesOf(organisation.id);
	}
});

test('a chair meets no refusal in the committee room', async ({ page }, testInfo) => {
	const refusals = listenForRefusals(page);
	const room = await makeChairedCommittee('Csp');

	await signIn(page, room.chair);
	await open(page, room.roomPath);
	// The room before its first session is a page like any other. Starting the
	// session draws the live console, which is the page this test is about.
	await startSession(page);

	// With a script, the console listens to the database over a WebSocket: the
	// one connection a page makes to somewhere other than this site. The top
	// bar reports on it once the socket is open, and a socket the policy
	// refused is a console line.
	if (testInfo.project.use.javaScriptEnabled !== false) {
		await waitForConsoleScript(page);
	}

	expect(refusals).toEqual([]);
});

test("a paper's author meets no refusal in the editor", async ({ page }, testInfo) => {
	const refusals = listenForRefusals(page);
	const room = await makePaperCommittee('Csp');
	const paperId = await addWorkingPaper(room.committeeId, {
		title: 'Meaningful human control',
		body: 'Recalling the Convention on Certain Conventional Weapons,',
		authorSeatIds: [room.franceSeatId]
	});

	await signIn(page, room.clara);
	await open(page, `${room.papersPath}/${paperId}`);

	// The editor writes a <style> of its own into the page as it starts, which
	// is what the policy's style rule is loosened for (see `vite.config.ts`),
	// so the page only counts once the editor is on it.
	if (testInfo.project.use.javaScriptEnabled !== false) {
		await waitForEditor(page);
	}

	expect(refusals).toEqual([]);
});
