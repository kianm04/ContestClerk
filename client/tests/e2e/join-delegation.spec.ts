import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { createTestUser, giveApplication, signIn, type TestUser } from './signed-in-user';

// The acceptance criteria of `specs/05-pages/delegation/join.md` that need a
// real browser, for the page task T25 builds at `/join/[joinCode]`:
//
// * the card shows the delegation, its institution, its conference, the city,
//   the head names and the name of the person about to join, and nothing else;
// * a code typed in lower case finds the same delegation, because the page
//   normalises it before it looks anything up;
// * a code nobody has shows the empty state and no card at all;
// * pressing "Join delegation" writes a `member` row and lands on the
//   delegation's own page with the flash that names it;
// * somebody who is already in the delegation is sent straight to it instead of
//   being offered a button they cannot use;
// * every other row of the refusal table is drawn on the card in place of the
//   button, in the order `canJoinDelegation` decides them;
// * the refusals are the database's as well as the page's: posting the form for
//   a delegation the page would not offer is refused too, which is what "not
//   only the page" in the third criterion means;
// * a signed-out visitor is sent away with the address they were heading for;
// * the page does not spill off a phone screen or run on for screens on a
//   desktop.
//
// NOT TESTED HERE, AND NOT FORGOTTEN
// The whole of the first criterion — "and returns to this page after
// confirming" — cannot be followed here: it goes out through an email, and
// `tests/e2e/auth.spec.ts` is where registering and confirming are watched. What
// is checked below is the half this page owns, that somebody signed out is sent
// away carrying `next`.
//
// `/delegations/[delegationId]` is `tests/e2e/delegations.spec.ts`. The tests
// below land on it and read the flash, and nothing more; every card on it
// belongs to that file.
//
// The join code itself — ten characters with no 0, O, 1 or I — is minted by
// `create_delegation`, and `tests/e2e/delegations.spec.ts` is where a code made
// by the real form is read back and checked.
//
// Joining after the application window has closed is allowed while the
// delegation is accepted, and `canJoinDelegation` therefore has no window check
// at all. That absence is proved by its own tests in `src/lib/delegations.test.ts`
// rather than here, because arranging it would mean a seeded conference whose
// window this file had shut, and these tests write to no conference.
//
// EVERY BUTTON WITHOUT JAVASCRIPT
// The last criterion — that it works with scripting switched off on a phone — is
// met by these tests running on the `desktop-no-js` and `phone` projects like
// every other browser test. "Join delegation" is a real submit button in a real
// `<form method="post">`. The two tests that ask the browser for its own
// dimensions each run on one project alone.
//
// WHAT THESE TESTS LEAVE BEHIND
// Nothing but accounts, which stay until the next `pnpm db:reset` as they do
// everywhere else. Every delegation here is written to a conference of
// `supabase/seed.sql` and deleted again in a `finally`, which takes its members
// with it, and so is the one application a refusal needs. No conference is
// made, changed or deleted: a conference of this
// file's own would have to be published with dates still to come for anybody to
// be allowed to join it, and `/conferences` lists exactly those, so it would
// turn up in the directory `tests/e2e/conferences.spec.ts` counts.
//
// The delegations written to Amsterdam Open MUN 2027 are all left as drafts on
// purpose. `tests/e2e/manage-dashboard.spec.ts` reads that same conference's
// figures, and the delegations it counts are the ones that are no longer a
// draft, so a draft disturbs nothing there.
//
// `postFormAction` below is a copy of the one in
// `tests/e2e/manage-application-form.spec.ts`, deliberately rather than a shared
// import, for the reason that file gives about its own copies.

/**
 * How long an assertion that waits on a page reading the database may take.
 *
 * Longer than the five seconds Playwright waits by default, for the reason
 * `tests/e2e/conferences.spec.ts` gives: every test in the run asks the one
 * local database at once, and an answer has taken up to eight seconds.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * Amsterdam Open MUN 2027 of `supabase/seed.sql`: published, still to come, and
 * taking delegations.
 *
 * A delegation is joinable only while its conference has not happened yet, which
 * `canJoinDelegation` decides from the end date the preview carries, so the
 * delegations somebody really joins below have to sit on a conference still to
 * come. This is that conference, and it is read here and never written to.
 */
const JOINABLE_CONFERENCE_ID = '20000000-0000-4000-8000-000000000009';
const JOINABLE_CONFERENCE_NAME = 'Amsterdam Open MUN 2027';
const JOINABLE_CONFERENCE_CITY = 'Amsterdam';

/**
 * Rotterdam Spring MUN 2026 of `supabase/seed.sql`, which is over: its last day
 * was six months ago.
 *
 * Every refusal below that is not about the conference's own dates is arranged
 * here rather than on the conference above, because the first refusal wins and
 * these three are all decided before the end date is ever looked at. It also
 * keeps them off the conference whose figures another browser test reads.
 */
const FINISHED_CONFERENCE_ID = '20000000-0000-4000-8000-000000000016';
const FINISHED_CONFERENCE_NAME = 'Rotterdam Spring MUN 2026';
const FINISHED_CONFERENCE_SLUG = 'rotterdammun-2026';

/**
 * A join code that cannot belong to anything.
 *
 * `create_delegation` mints its codes from an alphabet without 0, O, 1 and I,
 * the four characters people read wrong, so a code made of them alone is one no
 * delegation in the database can ever have.
 */
const UNKNOWN_JOIN_CODE = 'OOOO1111';

/**
 * How many windows tall the join page may be on a desktop.
 *
 * Three, as every other page in this task is held to. It is a ceiling and not a
 * target: this page is one card, so at three it still catches it drawn many
 * times the size it should be.
 */
const JOIN_PAGE_SCREENS = 3;

/** A name nothing else in the database will match. */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * A join code for a delegation this file writes straight into the table.
 *
 * The rows below are written with the service-role client rather than through
 * `create_delegation`, which is what mints a real code, so the code has to come
 * from somewhere — and it is made of the same characters so that nothing reading
 * it has to care which path wrote it.
 */
function unusedJoinCode(): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	const characters: string[] = [];

	for (let position = 0; position < 8; position += 1) {
		characters.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
	}

	return characters.join('');
}

/** What a test wants to say about one delegation. Everything else is filled in. */
type DelegationSeed = {
	/** One of the two seeded conferences above. */
	conferenceId: string;
	name?: string;
	status?: 'draft' | 'submitted' | 'accepted' | 'rejected' | 'withdrawn';
};

/** One delegation a test has arranged, as the tests below name it. */
type TestDelegation = {
	id: string;
	name: string;
	institutionName: string;
	joinCode: string;
	/** The `/join/<code>` address this file is about. */
	joinPath: string;
};

/**
 * Give a test account a delegation it is the head of, and answer what the tests
 * need to find it again.
 *
 * The service-role client writes both rows, the way `giveApplication` in
 * `signed-in-user.ts` writes an application and for the same reason.
 * `guard_delegation_insert` only runs for the two roles a browser uses, so the
 * service role walks straight past it: that is the one reason a seeded
 * `rejected` row is possible at all, because through a browser a head may only
 * ever write `draft` or `submitted`.
 *
 * `check_one_route_per_conference` still fires, for everybody, so the account
 * given a delegation here must have no application and no other delegation at
 * the same conference.
 */
async function giveDelegation(head: TestUser, seed: DelegationSeed): Promise<TestDelegation> {
	const admin = createServiceRoleClient();
	const name = seed.name ?? unusedName('Lycee Francais Delegation');
	const institutionName = 'Lycee Francais de La Haye';
	const joinCode = unusedJoinCode();
	const status = seed.status ?? 'draft';
	const isSent = status !== 'draft';

	const { data, error } = await admin
		.from('delegations')
		.insert({
			conference_id: seed.conferenceId,
			name,
			institution_name: institutionName,
			country_code: 'FR',
			status,
			requested_seats: 8,
			join_code: joinCode,
			submitted_at: isSent ? new Date().toISOString() : null
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test delegation: ${error?.message}`);
	}

	const { error: headError } = await admin
		.from('delegation_members')
		.insert({ delegation_id: data.id, user_id: head.id, role: 'head' });

	if (headError) {
		throw new Error(`Could not make the test account a head: ${headError.message}`);
	}

	return { id: data.id, name, institutionName, joinCode, joinPath: `/join/${joinCode}` };
}

/**
 * Take a test delegation away again, with everybody in it.
 *
 * Every test that makes one does this in a `finally`. The conferences here are
 * seeded ones that outlive the test, so nothing else would ever clear these
 * rows, and a delegation left on a sample conference is one more thing for the
 * next person to wonder about.
 */
async function deleteTestDelegation(delegationId: string): Promise<void> {
	await createServiceRoleClient().from('delegations').delete().eq('id', delegationId);
}

/**
 * Take the one application a test writes away again.
 *
 * It is written to a seeded conference, for the one refusal that is about
 * somebody having applied on their own, so nothing else would ever clear it.
 */
async function deleteTestApplication(applicationId: string): Promise<void> {
	await createServiceRoleClient().from('applications').delete().eq('id', applicationId);
}

/** What role somebody has in a delegation, or nothing when they are not in it. */
async function readMembership(delegationId: string, userId: string): Promise<string | null> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('delegation_members')
		.select('role')
		.eq('delegation_id', delegationId)
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not read the test membership: ${error.message}`);
	}

	return data ? String(data.role) : null;
}

/**
 * Post to the page's form action the way a browser posts a form.
 *
 * A copy of the one in `tests/e2e/manage-application-form.spec.ts`, and the same
 * two headers are written by hand for the same two reasons. `origin`, because
 * SvelteKit refuses a form post that looks as though it came from another
 * website and Playwright's request does not send that header itself. And
 * `accept: text/html`, because that is how SvelteKit tells a form post from a
 * page with no JavaScript from one made by `use:enhance`: with it the page is
 * drawn again carrying the status the action chose, which is what a browser with
 * no script really receives.
 *
 * The one test that uses it asks the action for a delegation whose card draws no
 * button at all, because the criterion is that the database refuses as well as
 * the page.
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

/**
 * Open a join link and wait until the page has really arrived.
 *
 * The heading is what says the page is there rather than the address, because
 * the address is right the moment the browser asks for it and the page arrives
 * afterwards. It is the same heading for a card, for a refusal and for a code
 * nobody has, which is why the tests below wait for it and then look for what
 * they are really about.
 */
async function openTheJoinPage(page: Page, joinPath: string): Promise<void> {
	await page.goto(joinPath);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		'Join a delegation',
		{ timeout: DATABASE_TIMEOUT_MS }
	);
}

/** The one link a refusal offers, as `join.md`'s link table names it (T177). */
type RefusalLink = {
	name: string;
	href: string;
};

/**
 * Open a join link and expect the reason on the card in place of the button,
 * with the one link that helps under it.
 *
 * `join.md`'s "Cannot join" state is the card without its button and the reason
 * from the refusal table beside it, so both halves are checked: a page that drew
 * the reason and left the button under it would let somebody press a button the
 * database is about to refuse. Its link table gives every refusal one way on,
 * drawn as the card's only button, so that is checked too.
 */
async function expectTheRefusal(
	page: Page,
	joinPath: string,
	reason: string,
	link: RefusalLink
): Promise<void> {
	await openTheJoinPage(page, joinPath);

	const main = page.getByRole('main');

	await expect(main.getByText(reason).first()).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByRole('button', { name: 'Join delegation' })).toHaveCount(0);
	// On a page drawn by the server `resolve()` writes a relative address, such
	// as `../conferences/x`, so only the end of the address is compared.
	await expect(main.getByRole('link', { name: link.name, exact: true })).toHaveAttribute(
		'href',
		new RegExp(`${link.href}$`)
	);
}

/** "Back to {conference}", the link under every refusal that is about the delegation or the day. */
function backToFinishedConference(): RefusalLink {
	return {
		name: `Back to ${FINISHED_CONFERENCE_NAME}`,
		href: `/conferences/${FINISHED_CONFERENCE_SLUG}`
	};
}

/*
	Every test here writes a delegation, signs a brand-new account in and then
	reads a page that asks the database several questions. That is more than most
	browser tests do, and thirty seconds — what Playwright allows a test by
	default — is not always enough for it while the whole suite is asking the one
	local database at once. `test.slow()` triples that allowance.
*/
test.beforeEach(() => {
	test.slow();
});

test('shows the delegation, its conference and its heads, and who is joining', async ({ page }) => {
	const head = await createTestUser('Amira Haddad');
	const delegation = await giveDelegation(head, {
		conferenceId: JOINABLE_CONFERENCE_ID,
		name: 'Lycee Francais Delegation'
	});

	try {
		const student = await createTestUser('Youssef Benali');

		await signIn(page, student);
		await openTheJoinPage(page, delegation.joinPath);

		const main = page.getByRole('main');

		// Everything the preview is allowed to say, and it is everything on the
		// card: the delegation, the school behind it, the conference with its city,
		// and who runs it.
		await expect(main.getByText(delegation.name).first()).toBeVisible();
		await expect(main.getByText(delegation.institutionName).first()).toBeVisible();
		await expect(main.getByText(JOINABLE_CONFERENCE_NAME).first()).toBeVisible();
		await expect(main.getByText(JOINABLE_CONFERENCE_CITY).first()).toBeVisible();
		await expect(main.getByText(head.fullName).first()).toBeVisible();

		// And whose name is about to be added to it, which is what the "You will
		// join as" line is for: a student signed in as somebody else should see that
		// before they press anything.
		await expect(main.getByText(student.fullName).first()).toBeVisible();
		await expect(main.getByRole('button', { name: 'Join delegation' })).toBeVisible();
	} finally {
		await deleteTestDelegation(delegation.id);
	}
});

test('finds the same delegation from a code typed in lower case', async ({ page }) => {
	const head = await createTestUser('Amira Haddad');
	const delegation = await giveDelegation(head, { conferenceId: JOINABLE_CONFERENCE_ID });

	try {
		const student = await createTestUser('Youssef Benali');

		await signIn(page, student);

		// A code read off a whiteboard and typed in by hand arrives in whatever case
		// it was typed. The page puts it into upper case before it looks anything
		// up, so this is the same delegation as the test above.
		await openTheJoinPage(page, `/join/${delegation.joinCode.toLowerCase()}`);

		const main = page.getByRole('main');

		await expect(main.getByText(delegation.name).first()).toBeVisible();
		await expect(main.getByRole('button', { name: 'Join delegation' })).toBeVisible();
	} finally {
		await deleteTestDelegation(delegation.id);
	}
});

test('shows an empty state for a code nobody has', async ({ page }) => {
	const student = await createTestUser('Youssef Benali');

	await signIn(page, student);
	await openTheJoinPage(page, `/join/${UNKNOWN_JOIN_CODE}`);

	const main = page.getByRole('main');

	await expect(main.getByText('No delegation found for this link.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(
		main.getByText('Codes are 10 letters and digits; check for typing mistakes.')
	).toBeVisible();

	// No card and no button: there is nothing to preview, so the only thing left
	// to offer is a way back to the conferences.
	await expect(main.getByRole('button', { name: 'Join delegation' })).toHaveCount(0);
	await expect(main.getByRole('link', { name: 'Browse conferences' })).toHaveAttribute(
		'href',
		/\/conferences$/
	);
});

test('joins the delegation and lands on its own page', async ({ page }) => {
	const head = await createTestUser('Amira Haddad');
	const delegation = await giveDelegation(head, {
		conferenceId: JOINABLE_CONFERENCE_ID,
		name: 'Lycee Francais Delegation'
	});

	try {
		const student = await createTestUser('Youssef Benali');

		await signIn(page, student);
		await openTheJoinPage(page, delegation.joinPath);

		await page.getByRole('main').getByRole('button', { name: 'Join delegation' }).press('Enter');

		await expect(page).toHaveURL(`/delegations/${delegation.id}`, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// The flash floats above the page rather than inside `<main>`, which is why
		// this assertion is not scoped to it.
		await expect(page.getByText(`You joined ${delegation.name}.`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// A member and not a head: `join_delegation` writes one role and the head is
		// the person who registered the group.
		expect(await readMembership(delegation.id, student.id)).toBe('member');
	} finally {
		await deleteTestDelegation(delegation.id);
	}
});

test('sends somebody who is already in the delegation straight to it', async ({ page }) => {
	const head = await createTestUser('Amira Haddad');
	const delegation = await giveDelegation(head, { conferenceId: JOINABLE_CONFERENCE_ID });

	try {
		// The head opening their own link is the ordinary way this happens: they
		// send it to their students and then try it themselves to see that it works.
		await signIn(page, head);
		await page.goto(delegation.joinPath);

		await expect(page).toHaveURL(`/delegations/${delegation.id}`, {
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(page.getByText('You are already in this delegation.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
	} finally {
		await deleteTestDelegation(delegation.id);
	}
});

test('shows the reason the delegation itself gives, in place of the button', async ({ page }) => {
	/*
		Three delegations, each with a head of its own, because
		`check_one_route_per_conference` lets one person into one delegation per
		conference and all three sit on the same one.

		That conference is the one that is already over. The first refusal wins, and
		"was not accepted" and "withdrew its request" are both decided before the end
		date is ever looked at, so putting them here proves the order as well as the
		wording — and keeps them off the conference whose figures another browser
		test reads.
	*/
	const rejectedHead = await createTestUser('Amira Haddad');
	const withdrawnHead = await createTestUser('Tomas Novak');
	const finishedHead = await createTestUser('Sofia Marino');

	const wasRejected = await giveDelegation(rejectedHead, {
		conferenceId: FINISHED_CONFERENCE_ID,
		status: 'rejected'
	});
	const wasWithdrawn = await giveDelegation(withdrawnHead, {
		conferenceId: FINISHED_CONFERENCE_ID,
		status: 'withdrawn'
	});
	const conferenceIsOver = await giveDelegation(finishedHead, {
		conferenceId: FINISHED_CONFERENCE_ID
	});

	try {
		const student = await createTestUser('Youssef Benali');

		await signIn(page, student);

		await expectTheRefusal(
			page,
			wasRejected.joinPath,
			'This delegation was not accepted, so it cannot take members.',
			backToFinishedConference()
		);
		await expectTheRefusal(
			page,
			wasWithdrawn.joinPath,
			'This delegation withdrew its request.',
			backToFinishedConference()
		);

		// The delegation itself is a perfectly good draft; it is the conference that
		// has been and gone.
		await expectTheRefusal(
			page,
			conferenceIsOver.joinPath,
			`${FINISHED_CONFERENCE_NAME} has already taken place.`,
			backToFinishedConference()
		);

		// And the link goes where it says: the conference's own page.
		await page
			.getByRole('main')
			.getByRole('link', { name: `Back to ${FINISHED_CONFERENCE_NAME}` })
			.click();
		await expect(page).toHaveURL(`/conferences/${FINISHED_CONFERENCE_SLUG}`, {
			timeout: DATABASE_TIMEOUT_MS
		});
	} finally {
		await deleteTestDelegation(wasRejected.id);
		await deleteTestDelegation(wasWithdrawn.id);
		await deleteTestDelegation(conferenceIsOver.id);
	}
});

test('shows the reason the reader brings with them, in place of the button', async ({ page }) => {
	const head = await createTestUser('Amira Haddad');
	const delegation = await giveDelegation(head, {
		conferenceId: JOINABLE_CONFERENCE_ID,
		name: 'Lycee Francais Delegation'
	});

	// One link, opened by two people who each took a road into this conference
	// already: `check_one_route_per_conference` allows exactly one.
	const student = await createTestUser('Youssef Benali');
	const applicant = await createTestUser('Lena Fischer');
	const studentsGroup = await giveDelegation(student, {
		conferenceId: JOINABLE_CONFERENCE_ID,
		name: 'Sciences Po Delegation'
	});

	// A draft application, so that the figures `tests/e2e/manage-dashboard.spec.ts`
	// reads off this same conference, which count everything that is no longer a
	// draft, are left alone.
	const applicationId = await giveApplication(applicant, {
		conferenceId: JOINABLE_CONFERENCE_ID,
		status: 'draft'
	});

	try {
		await signIn(page, student);
		await expectTheRefusal(
			page,
			delegation.joinPath,
			`You are already in the ${studentsGroup.name} delegation for ${JOINABLE_CONFERENCE_NAME}.`,
			{ name: `Open ${studentsGroup.name}`, href: `/delegations/${studentsGroup.id}` }
		);

		// The link opens the student's own delegation.
		await page
			.getByRole('main')
			.getByRole('link', { name: `Open ${studentsGroup.name}` })
			.click();
		await expect(page).toHaveURL(`/delegations/${studentsGroup.id}`, {
			timeout: DATABASE_TIMEOUT_MS
		});

		// Clearing the cookies is what ends the first session; without it `/login`
		// would send an account that is already signed in straight back to its home
		// page. `tests/e2e/manage-application-form.spec.ts` changes accounts the same
		// way.
		await page.context().clearCookies();

		await signIn(page, applicant);
		await expectTheRefusal(
			page,
			delegation.joinPath,
			`You already applied to ${JOINABLE_CONFERENCE_NAME} on your own. ` +
				'Withdraw that application first to join a delegation.',
			{ name: 'View your application', href: `/applications/${applicationId}` }
		);
	} finally {
		await deleteTestDelegation(delegation.id);
		await deleteTestDelegation(studentsGroup.id);
		await deleteTestApplication(applicationId);
	}
});

test('is refused by the database as well as by the page', async ({ page }) => {
	const head = await createTestUser('Amira Haddad');
	const wasRejected = await giveDelegation(head, {
		conferenceId: FINISHED_CONFERENCE_ID,
		status: 'rejected'
	});

	try {
		const student = await createTestUser('Youssef Benali');

		await signIn(page, student);
		await openTheJoinPage(page, wasRejected.joinPath);

		/*
			The card drew no button, and the test above says so. This asks the action
			anyway, which is what the third criterion of `join.md` means by "enforced
			by the database function, not only the page": the action does not repeat
			the page's own check, it calls `join_delegation` and shows what the
			database said. A page and a database are two different moments, and the
			delegation can be turned down in between.
		*/
		const response = await postFormAction(page, wasRejected.joinPath, {
			joinCode: wasRejected.joinCode
		});

		expect(response.status()).toBe(400);
		expect(await response.text()).toContain(
			'This delegation was not accepted, so it cannot take members.'
		);

		// And nobody was let in.
		expect(await readMembership(wasRejected.id, student.id)).toBeNull();
	} finally {
		await deleteTestDelegation(wasRejected.id);
	}
});

/*
	The same criterion, for the one row of the refusal table that is about the
	conference rather than the delegation. It is worth its own test because this
	is the row the database used to let through: `join_delegation` asked about
	the delegation and never about the conference it belonged to, so a delegation
	still open for members at a conference that finished last year took anyone
	who pressed the button.
*/
test('refuses the conference that has already taken place in the database too', async ({
	page
}) => {
	const head = await createTestUser('Amira Haddad');

	// `accepted`, so that nothing about the delegation itself would refuse: the
	// only thing standing in the way is the conference's own last day.
	const atAFinishedConference = await giveDelegation(head, {
		conferenceId: FINISHED_CONFERENCE_ID,
		status: 'accepted'
	});

	try {
		const student = await createTestUser('Youssef Benali');

		await signIn(page, student);

		const response = await postFormAction(page, atAFinishedConference.joinPath, {
			joinCode: atAFinishedConference.joinCode
		});

		expect(response.status()).toBe(400);
		expect(await response.text()).toContain(`${FINISHED_CONFERENCE_NAME} has already taken place.`);

		expect(await readMembership(atAFinishedConference.id, student.id)).toBeNull();
	} finally {
		await deleteTestDelegation(atAFinishedConference.id);
	}
});

test('sends a visitor to the register form, carrying where they were going', async ({ page }) => {
	const head = await createTestUser('Amira Haddad');
	const delegation = await giveDelegation(head, { conferenceId: JOINABLE_CONFERENCE_ID });

	try {
		/*
			Nobody is signed in. The **Access:** line of `join.md` sends them to
			`/register`, and not to `/login` the way every other guarded page does:
			most people opening a teacher's link have no account yet. The register
			page carries `next` on to its own "Already have an account? Log in" link,
			so the few who do are one press away.

			This is why the page cannot simply call `requireOnboarded`, which always
			goes to `/login`; it asks `getVerifiedClaims` itself first.
		*/
		await page.goto(delegation.joinPath);

		await expect(page).toHaveURL(`/register?next=${encodeURIComponent(delegation.joinPath)}`, {
			timeout: DATABASE_TIMEOUT_MS
		});

		/*
			And from there the link that keeps `next`, so the few who do have an
			account come back here as well. It is looked for inside `<main>`, because
			the app shell's own banner holds a second "Log in" link and Playwright
			refuses a locator that matches two elements.
		*/
		const logIn = page.getByRole('main').getByRole('link', { name: 'Log in' });

		await expect(logIn).toHaveAttribute('href', /next=/, { timeout: DATABASE_TIMEOUT_MS });
		expect(await logIn.getAttribute('href')).toContain(encodeURIComponent(delegation.joinPath));
	} finally {
		await deleteTestDelegation(delegation.id);
	}
});

test('does not spill off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const head = await createTestUser('Amira Haddad');
	const delegation = await giveDelegation(head, {
		conferenceId: JOINABLE_CONFERENCE_ID,
		name: 'Lycee Francais de La Haye Senior Delegation'
	});

	try {
		const student = await createTestUser('Youssef Benali');

		await signIn(page, student);
		await openTheJoinPage(page, delegation.joinPath);

		await expectNoSidewaysOverflow(page);
	} finally {
		await deleteTestDelegation(delegation.id);
	}
});

test('fits in a few screens', async ({ page }, testInfo) => {
	test.skip(
		testInfo.project.name !== 'desktop',
		'One project measures the page, and the desktop window is the one the design is drawn for.'
	);

	const head = await createTestUser('Amira Haddad');
	const delegation = await giveDelegation(head, { conferenceId: JOINABLE_CONFERENCE_ID });

	try {
		const student = await createTestUser('Youssef Benali');

		await signIn(page, student);
		await openTheJoinPage(page, delegation.joinPath);

		// The picture is saved whether the measurement passes or fails, so that a
		// failure can be looked at rather than guessed at.
		await saveFullPageScreenshot(page, 'join-delegation');
		await expectPageFitsInScreens(page, JOIN_PAGE_SCREENS);
	} finally {
		await deleteTestDelegation(delegation.id);
	}
});
