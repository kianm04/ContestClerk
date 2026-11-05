/**
 * The confirmation page a `ConfirmButton` falls back to when JavaScript is off.
 *
 * With JavaScript, `ConfirmButton` asks its question in a dialog. Without it
 * nothing can open that dialog, so the first press posts the form to `/confirm`
 * instead of to the action. That page shows the same question and a form that
 * sends every field on to the action, together with `confirm=1`. Either way the
 * reader is asked once before anything is destroyed.
 *
 * The question itself travels in the query string of `/confirm`, so the fields
 * the action receives are exactly the fields the button's form holds.
 */
import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';
import { pathOnThisSite } from '$lib/auth';

/** The looks a `Button` can have; the confirming button keeps the one it was given. */
export const CONFIRM_VARIANTS = ['primary', 'secondary', 'ghost', 'danger'] as const;

export type ConfirmVariant = (typeof CONFIRM_VARIANTS)[number];

/** The words of the question, the same ones the dialog shows. */
export type ConfirmationWords = {
	/** The heading: "Delete this committee?" */
	title: string;
	/** What will happen, in one sentence. */
	text: string;
	/** The words on the button that does it: "Delete committee". */
	label: string;
	variant: ConfirmVariant;
};

/** Everything the confirmation page needs to ask the question and pass the answer on. */
export type ConfirmationQuestion = ConfirmationWords & {
	/** Where the confirmed form posts, such as `/manage/thimun-2027/schedule?/deleteEvent`. */
	actionAddress: string;
	/** The page the question was asked on, where Cancel goes back to. */
	returnAddress: ResolvedPathname;
};

/** One field of the form, carried from the first press to the confirmed one. */
export type CarriedField = {
	name: string;
	value: string;
};

/**
 * The address of the page someone is on, without the `?/action` part a failed
 * form post leaves in it.
 *
 * SvelteKit names a form action with a query parameter whose name starts with
 * `/`. After a post the page is drawn at that address, and following it as a
 * link would only show the page again, so those parameters are dropped.
 */
export function pageAddress(pageUrl: URL): string {
	const parameters = new URLSearchParams();

	for (const [name, value] of pageUrl.searchParams) {
		if (!name.startsWith('/')) {
			parameters.append(name, value);
		}
	}

	const search = parameters.toString();

	return search ? `${pageUrl.pathname}?${search}` : pageUrl.pathname;
}

/**
 * The `/confirm` address a `ConfirmButton`'s first press posts to when there is
 * no JavaScript to open its dialog.
 *
 * `formaction` is what the button was given, often a relative address such as
 * `?/delete`. It is turned into a full path here, against the page the button is
 * on, because the confirmation page lives at a different address.
 */
export function confirmationPageUrl(
	words: ConfirmationWords,
	formaction: string,
	pageUrl: URL
): string {
	const action = new URL(formaction, pageUrl);

	const parameters = new URLSearchParams({
		title: words.title,
		text: words.text,
		label: words.label,
		variant: words.variant,
		action: `${action.pathname}${action.search}`,
		back: pageAddress(pageUrl)
	});

	return `${resolve('/confirm')}?${parameters.toString()}`;
}

/**
 * A path on this site for `address`, without its fragment, or `null` when it
 * points anywhere else or cannot be read at all.
 *
 * Which addresses stay on this site is `pathOnThisSite`'s to say, so that the
 * sign-in redirects and this page answer it the same way. It refuses the
 * tricks a hand-made address could try, `//example.com` and `/\example.com`,
 * the dot segments that normalise into them, such as `/.//example.com`, and
 * addresses such as `//` that do not parse and would otherwise be an error
 * page (security review M13). A form's action and the link back have no use
 * for a fragment, so it is dropped; a `#` always ends the path or the query
 * when an address is parsed, so neither can hold one, and the first `#` in
 * what `pathOnThisSite` returns is where the fragment starts.
 */
export function sameSitePath(address: string | null): string | null {
	const path = pathOnThisSite(address);

	if (path === null) {
		return null;
	}

	const fragmentStart = path.indexOf('#');

	return fragmentStart === -1 ? path : path.slice(0, fragmentStart);
}

function readVariant(variant: string | null): ConfirmVariant {
	const known = CONFIRM_VARIANTS.find((candidate) => candidate === variant);

	return known ?? 'danger';
}

/**
 * The question in a `/confirm` address, or `null` when it is missing a part or
 * would send the answer to another website.
 */
export function readConfirmationQuestion(url: URL): ConfirmationQuestion | null {
	const title = url.searchParams.get('title');
	const text = url.searchParams.get('text');
	const label = url.searchParams.get('label');
	const actionAddress = sameSitePath(url.searchParams.get('action'));

	if (!title || !text || !label || !actionAddress) {
		return null;
	}

	// A missing or foreign "back" address still leaves a way out: the home page.
	const returnPath = sameSitePath(url.searchParams.get('back')) ?? '/';

	return {
		title,
		text,
		label,
		variant: readVariant(url.searchParams.get('variant')),
		actionAddress,
		// `resolve()` only accepts the routes it knows by name, and this is any
		// page on the site. `sameSitePath` has already checked it stays here.
		returnAddress: returnPath as ResolvedPathname
	};
}

/**
 * The fields of the first press, to be sent again with the confirmed one.
 *
 * `confirm` is left out because the confirming button adds it. A file cannot be
 * carried in a hidden field, and no `ConfirmButton` holds one, so files are
 * dropped rather than half-sent.
 */
export function carriedFields(formData: FormData): CarriedField[] {
	const fields: CarriedField[] = [];

	for (const [name, value] of formData) {
		if (name === 'confirm' || typeof value !== 'string') {
			continue;
		}

		fields.push({ name, value });
	}

	return fields;
}
