/**
 * Checks and wording shared by the sign in, sign up, password and email link
 * pages.
 *
 * Nothing in here talks to Supabase or to Svelte. They are plain functions over
 * plain strings, so they are easy to read on their own and easy to reuse.
 */

/**
 * The shortest password we accept when somebody creates an account or picks a
 * new one. Supabase enforces its own minimum as well (six characters unless the
 * project says otherwise), so this can only ever be stricter, never looser.
 */
export const MINIMUM_PASSWORD_LENGTH = 8;

/**
 * The longest name the sign up form takes. `profiles.full_name` has no limit of
 * its own, so this is only here to catch somebody pasting a paragraph into the
 * field.
 */
export const MAXIMUM_FULL_NAME_LENGTH = 100;

/**
 * What we say when something failed for a reason the visitor can do nothing
 * about. `03-design/writing-style.md` asks us never to show a raw error from
 * the database or from Supabase, because it explains nothing and worries people.
 */
export const UNEXPECTED_ERROR_TEXT = 'Something went wrong on our side. Please try again.';

/**
 * What the create account page says when Supabase turns a sign up down, which
 * with email confirmation off (as locally) is what it does to an address that
 * already has an account. It does not say the address is taken, so the page
 * still cannot be used to find out who has an account; the "Log in instead"
 * line under it is the way on for the person who has one.
 */
export const SIGN_UP_REFUSED_TEXT = 'We could not create an account with this address.';

/**
 * Enough to catch obvious typing mistakes. It is deliberately not a full email
 * specification, because the real check is whether the confirmation email we
 * send actually arrives.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A line of feedback to show under a form, and whether it is good news. */
export type AuthMessage = {
	text: string;
	isSuccess: boolean;
};

/** What the log in action sends back to its page. */
export type AuthFormResult = {
	/** The address the visitor typed, so the field can be filled back in. */
	email: string;
	/** What to tell them about the attempt. */
	message: AuthMessage;
};

/** The same, plus the name the sign up form also has to fill back in. */
export type RegisterFormResult = AuthFormResult & {
	fullName: string;
	/**
	 * Whether the message comes with "Already have an account? Log in instead".
	 * True when the sign up was turned down and on the "Almost done" answer,
	 * because either can be what a person who already has an account sees.
	 */
	offersLogIn: boolean;
};

/**
 * Returns a message to show the visitor, or `null` when the address looks usable.
 */
export function validateEmail(email: string): string | null {
	if (email.trim() === '') {
		return 'Please enter your email address.';
	}

	if (!EMAIL_PATTERN.test(email)) {
		return 'That does not look like an email address.';
	}

	return null;
}

/**
 * Returns a message to show the visitor, or `null` when the password is long
 * enough. Length is the only rule: forcing symbols and capitals makes people
 * pick worse passwords, not better ones.
 */
export function validatePassword(password: string): string | null {
	if (password.length < MINIMUM_PASSWORD_LENGTH) {
		return `Please use at least ${MINIMUM_PASSWORD_LENGTH} characters.`;
	}

	return null;
}

/**
 * Returns a message to show the visitor, or `null` when the name is usable.
 *
 * Any name at all is accepted as long as there is one. A person's name is
 * theirs, so we do not ask it to have two words or to be spelled with letters
 * we recognise.
 */
export function validateFullName(fullName: string): string | null {
	if (fullName.trim() === '') {
		return 'Please enter your name.';
	}

	if (fullName.trim().length > MAXIMUM_FULL_NAME_LENGTH) {
		return 'Please use a shorter name.';
	}

	return null;
}

/**
 * Turns a failed sign in into something worth reading. Supabase reports the
 * reason in `error.code`; these two are common enough to explain properly, and
 * anything else falls back to the text the caller passes in, which is normally
 * `UNEXPECTED_ERROR_TEXT`.
 */
export function describeSignInError(code: string | undefined, fallbackText: string): string {
	if (code === 'invalid_credentials') {
		return 'That email and password do not match an account.';
	}

	if (code === 'email_not_confirmed') {
		return 'Please confirm your email address first. Check your inbox for the link we sent.';
	}

	return fallbackText;
}

/**
 * The website every address below is measured against. `.invalid` is a name
 * the internet reserves for exactly this: it can never be a real site, so an
 * address that parses to any other origin was pointing away from this one.
 */
const THIS_SITE = 'https://munmeet.invalid';

/**
 * The control characters, such as a tab or a line break, which no real address
 * carries. A browser drops them before it reads an address, so `/<tab>/evil`
 * is `//evil` to it, and a line break inside a redirect header would let the
 * rest of the value be read as another header. `\p{Cc}` is Unicode's name for
 * the whole set.
 */
const CONTROL_CHARACTERS = /\p{Cc}/u;

/**
 * The path, query and fragment of `address` when it points inside this site,
 * or `null` when it points anywhere else.
 *
 * `new URL` settles every trick a hand-made address could try. `//evil.example`
 * and `/\evil.example` both come out with another origin, because a browser
 * reads a backslash after the first slash as a second slash, which a check on
 * the first two characters alone let through (security review M13). Whatever
 * the parser decides lives elsewhere is refused, and what it keeps is the
 * normalised path, never the text that came in.
 *
 * Normalising can itself make a second slash. `/.//evil.example`,
 * `/a/..//evil.example`, `/%2e//evil.example` and `/./\evil.example` all stay on
 * this site for `new URL`, because the dot segment is still holding the first
 * slash, but each comes out as a path starting with two slashes, here
 * `//evil.example`, and a browser reads a redirect to that as another website.
 * So a normalised path that starts with two slashes is refused as well,
 * whichever way it was written.
 *
 * Some addresses do not parse at all: `//` alone, `///` or `//@` name a
 * website with no name, and `new URL` throws on them. Those are refused like
 * the rest, rather than the throw becoming an error page.
 */
export function pathOnThisSite(address: string | null): string | null {
	if (!address || !address.startsWith('/') || CONTROL_CHARACTERS.test(address)) {
		return null;
	}

	let parsed: URL;

	try {
		parsed = new URL(address, THIS_SITE);
	} catch {
		return null;
	}

	if (parsed.origin !== THIS_SITE) {
		return null;
	}

	if (parsed.pathname.startsWith('//')) {
		return null;
	}

	return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * Keeps a `next=` parameter from an email link pointing inside this site.
 *
 * Without this check somebody could send out a link like
 * `/auth/confirm?next=https://example.com`, and we would bounce whoever clicked
 * it straight to their page while looking like the link came from us. Anything
 * `pathOnThisSite` refuses becomes `/`, which every reader of `next` treats as
 * "nowhere in particular".
 */
export function safeRedirectPath(next: string | null): string {
	return pathOnThisSite(next) ?? '/';
}

/**
 * The two pages whose address already carries a `?next=` of their own: the
 * visitor was on their way somewhere else when they were sent there.
 */
const PAGES_CARRYING_NEXT = ['/login', '/register'];

/**
 * Where the top bar's "Log in" and "Sign up" bring a visitor back to
 * once they are in: the page they are on, which is what
 * `03-design/app-shell.md` asks for.
 *
 * On `/login` and `/register` the page they are on is not where they were
 * going. Pressing "Apply as a delegate" signed out lands on
 * `/login?next=/conferences/<slug>/apply`, and the top bar there has to hand on
 * that `next` rather than `/login` itself, or signing up through it ends on
 * `/home` and the conference has to be found again (T164). `nextParameter` is
 * the `?next=` of the current address, or null when it has none; it goes
 * through `safeRedirectPath`, so `/` means "nowhere in particular".
 */
export function authLinkDestination(pathname: string, nextParameter: string | null): string {
	if (PAGES_CARRYING_NEXT.includes(pathname)) {
		return safeRedirectPath(nextParameter);
	}

	return pathname;
}

/**
 * Where to send somebody once a sign in, a sign up or an email link has done
 * its job.
 *
 * `next` is the page they were trying to reach, carried in `?next=` and in a
 * hidden field on every auth form. `fallback` is where they go when there was
 * no such page: build it with a helper from `$lib/urls.ts`.
 */
export function destinationAfterAuth(next: string | null, fallback: string): string {
	const safePath = safeRedirectPath(next);

	// `safeRedirectPath` answers `/` both when there was no `next` at all and
	// when it pointed at another website. Neither is a page the visitor asked
	// for, so both go to the fallback instead.
	if (safePath === '/') {
		return fallback;
	}

	return safePath;
}

/** Why a link from one of our emails did not work. */
export const AUTH_ERROR_REASONS = ['expired', 'used', 'invalid'] as const;

export type AuthErrorReason = (typeof AUTH_ERROR_REASONS)[number];

/**
 * Reads the `?reason=` on `/auth/error`.
 *
 * The value is only text somebody put in an address bar, so anything we do not
 * recognise is treated as `invalid`, which is the vaguest of the three and
 * therefore the safe thing to say.
 */
export function parseAuthErrorReason(value: string | null): AuthErrorReason {
	if (AUTH_ERROR_REASONS.includes(value as AuthErrorReason)) {
		return value as AuthErrorReason;
	}

	return 'invalid';
}

/** What `/auth/error` tells the visitor for each of the three reasons. */
export function describeAuthErrorReason(reason: AuthErrorReason): string {
	if (reason === 'expired') {
		return 'The link has expired. Links are valid for a limited time.';
	}

	if (reason === 'used') {
		return 'This link was already used.';
	}

	return 'The link is incomplete or was copied wrongly. Open it straight from the email.';
}

/**
 * How long after opening a reset link `/reset-password` still accepts a new
 * password, in seconds: fifteen minutes, long enough to type one twice.
 */
export const PASSWORD_RECOVERY_WINDOW_SECONDS = 15 * 60;

/**
 * The names Supabase gives a sign-in that came from an emailed link. GoTrue
 * v2.196 writes `otp` for a verified recovery link; other versions have
 * written `recovery`, so both are taken to mean the same thing.
 */
const RECOVERY_METHODS = ['recovery', 'otp'];

/**
 * What a session's history says about choosing a new password without the old
 * one: `recent` when a reset link was opened inside the window, `stale` when
 * one was opened but the window has passed, and `none` when the session never
 * came from a reset link at all.
 */
export type PasswordRecoveryState = 'recent' | 'stale' | 'none';

/**
 * Reads the `amr` claim of a verified access token: Supabase's record of how
 * the session was signed in, one entry per method with the moment it was used,
 * in seconds since 1970. A reset link that was opened an hour ago leaves a
 * session that is still live, and only this record says it was a reset link
 * and when, which is what lets `/reset-password` turn a password-signed-in
 * session away (security review L37).
 *
 * `amr` is `unknown` because it is read straight off the token. An entry
 * without a time, which the RFC-8176 string form of the claim is, cannot show
 * it was recent, so it does not count.
 */
export function passwordRecoveryState(amr: unknown, now: Date): PasswordRecoveryState {
	if (!Array.isArray(amr)) {
		return 'none';
	}

	const nowInSeconds = now.getTime() / 1000;
	let state: PasswordRecoveryState = 'none';

	for (const entry of amr) {
		if (typeof entry !== 'object' || entry === null) {
			continue;
		}

		const { method, timestamp } = entry as Record<string, unknown>;
		const isRecovery = typeof method === 'string' && RECOVERY_METHODS.includes(method);

		if (!isRecovery || typeof timestamp !== 'number') {
			continue;
		}

		// A negative age means the token's clock is a little ahead of ours, which
		// the Docker clock has been seen to be (`src/hooks.server.ts`); that is
		// still recent.
		if (nowInSeconds - timestamp <= PASSWORD_RECOVERY_WINDOW_SECONDS) {
			return 'recent';
		}

		state = 'stale';
	}

	return state;
}

/**
 * The kinds of link Supabase emails, as the `type=` in each link names them.
 * They are the values Supabase's `verifyOtp` accepts for an email link.
 */
export const EMAIL_LINK_TYPES = [
	'signup',
	'invite',
	'magiclink',
	'recovery',
	'email_change',
	'email'
] as const;

export type EmailLinkType = (typeof EMAIL_LINK_TYPES)[number];

/**
 * Reads the `?type=` of a link on `/auth/confirm`, or `null` when it is not one
 * Supabase sends. The value is only text in an address bar, so it is checked
 * against the list rather than passed on.
 */
export function parseEmailLinkType(value: string | null): EmailLinkType | null {
	const known = EMAIL_LINK_TYPES.find((type) => type === value);

	return known ?? null;
}

/** The heading of `/auth/confirm` and the words on its one button. */
export type EmailLinkWords = {
	title: string;
	buttonLabel: string;
};

/**
 * What `/auth/confirm` says for each kind of link. The link is not acted on
 * until the button is pressed (security review L42), so the button has to say
 * what pressing it does.
 */
export function describeEmailLink(type: EmailLinkType): EmailLinkWords {
	if (type === 'recovery') {
		return { title: 'Reset your password.', buttonLabel: 'Choose a new password' };
	}

	if (type === 'magiclink' || type === 'email') {
		return { title: 'Log in to MUNMeet.', buttonLabel: 'Log in' };
	}

	if (type === 'email_change') {
		return { title: 'Confirm your new email address.', buttonLabel: 'Confirm email address' };
	}

	return { title: 'Confirm your email address.', buttonLabel: 'Confirm email address' };
}
