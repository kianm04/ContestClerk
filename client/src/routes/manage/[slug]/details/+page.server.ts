import { fail, redirect } from '@sveltejs/kit';
import {
	hasErrors,
	readConferenceEdit,
	validateConferenceEdit,
	validateConferenceImage,
	type ConferenceEditErrors,
	type ConferenceEditValues
} from '$lib/conference-details';
import { LEVEL_OPTIONS, type Conference } from '$lib/conferences';
import { currencyOptions } from '$lib/money';
import { stepUrlAfter } from '$lib/setup-steps';
import { timezoneOptions } from '$lib/timezones';
import { manageDetailsUrl } from '$lib/urls';
import { requireManagePage, requirePermission } from '$lib/server/access';
import {
	hasInvoices,
	readConferenceCurrency,
	removeConferenceImage,
	updateConference,
	uploadConferenceImage,
	type ConferenceImageKind
} from '$lib/server/conferences';
import { setFlash } from '$lib/server/flash';
import type { Actions, PageServerLoad } from './$types';

/**
 * Turn a column that may be null into the text a form field wants.
 *
 * Most of these columns are nullable, because "not filled in" is a real answer,
 * but an `<input value={null}>` would show the word "null". Empty text is what
 * a blank field sends back, so that is what a blank column becomes.
 * `$lib/server/profiles.ts` turns the profile's own columns the same way.
 */
function textOrEmpty(value: string | null): string {
	return value ?? '';
}

/** The same for a number column: 250 becomes "250", and nothing at all becomes ''. */
function numberOrEmpty(value: number | null): string {
	if (value === null) {
		return '';
	}

	return String(value);
}

/**
 * The saved conference as the form holds it: every field is text, because text
 * is all an `<input>` can carry.
 *
 * The currency is passed in rather than read off the conference. The
 * `Conference` type carries no `currency` on purpose, which T19 wrote down: a
 * column exactly one page asks about does not belong in the shape every page in
 * the app displays a conference in.
 */
function toEditValues(conference: Conference, currency: string): ConferenceEditValues {
	return {
		name: conference.name,
		description: textOrEmpty(conference.description),
		city: textOrEmpty(conference.city),
		countryCode: textOrEmpty(conference.countryCode),
		startDate: conference.startDate,
		endDate: conference.endDate,
		websiteUrl: textOrEmpty(conference.websiteUrl),
		tagline: textOrEmpty(conference.tagline),
		venueName: textOrEmpty(conference.venueName),
		venueAddress: textOrEmpty(conference.venueAddress),
		timezone: conference.timezone,
		level: conference.level,
		language: conference.language,
		expectedDelegates: numberOrEmpty(conference.expectedDelegates),
		minAge: numberOrEmpty(conference.minAge),
		maxAge: numberOrEmpty(conference.maxAge),
		currency,
		contactEmail: textOrEmpty(conference.contactEmail),
		instagramUrl: textOrEmpty(conference.instagramUrl),
		contactPhone: textOrEmpty(conference.contactPhone),
		facebookUrl: textOrEmpty(conference.facebookUrl),
		linkedinUrl: textOrEmpty(conference.linkedinUrl),
		youtubeUrl: textOrEmpty(conference.youtubeUrl),
		tiktokUrl: textOrEmpty(conference.tiktokUrl)
	};
}

/**
 * The picture chosen in one of the two file boxes, or `null` when none was.
 *
 * A file box nobody chose a file in still posts a `File`: one with no name, no
 * type and a size of 0. A file of no size is therefore what "nothing was
 * chosen" looks like on the server, and it is skipped rather than refused.
 * Anything that is not a `File` at all can only come from a request somebody
 * put together by hand, because this page's own form always sends these two
 * fields as files, so it is skipped the same way.
 */
function readChosenImage(formData: FormData, kind: ConferenceImageKind): File | null {
	const chosen = formData.get(kind);

	if (!(chosen instanceof File) || chosen.size === 0) {
		return null;
	}

	return chosen;
}

/**
 * Where a saved form goes next. While the conference is a draft, the page is
 * step 1 of the setup and its button says "Save and continue", so a save moves
 * on to the next step, Committees. Once the conference is published there is
 * no next step, and the organiser stays here to see what was saved.
 */
function pageAfterSave(conference: Conference): string {
	const detailsPage = manageDetailsUrl(conference.slug);

	if (conference.status !== 'draft') {
		return detailsPage;
	}

	return stepUrlAfter(conference.slug, 'details') ?? detailsPage;
}

/**
 * Everything the details editor draws, on top of what the layout above it has
 * already read.
 *
 * `parent()` is a promise for whatever the layout's own `load` returned: this
 * conference and the organisation running it. The layout let in anybody whose
 * permissions open some page of this conference, and handed those permissions
 * down; the first lines below answer a 404 unless they open this one.
 *
 * Files under `$lib/server` only ever run on the server, so neither query below
 * can reach the browser.
 */
export const load: PageServerLoad = async ({ parent, locals }) => {
	const { conference, permissions } = await parent();
	// A 404 unless the reader's permissions open this page, by the table in
	// `$lib/manage-pages.ts`.
	requireManagePage(permissions, 'details');

	// Neither answer depends on the other, so the two queries go out together
	// rather than one waiting for the other to come back.
	const [savedCurrency, hasAnyInvoice] = await Promise.all([
		readConferenceCurrency(locals.supabase, conference.id),
		hasInvoices(locals.supabase, conference.id)
	]);

	return {
		values: toEditValues(conference, savedCurrency),
		timezoneOptions: timezoneOptions(),
		currencyOptions: currencyOptions(),
		levelOptions: LEVEL_OPTIONS,
		isCurrencyLocked: hasAnyInvoice
	};
};

export const actions: Actions = {
	/**
	 * Save every field of the editor, and upload whichever pictures were chosen.
	 *
	 * One action for the whole page, because the page is one form: the text and
	 * the two pictures are saved by the same press of "Save and continue" (a
	 * draft) or "Save changes" (a published conference). See `pageAfterSave`.
	 */
	save: async ({ params, url, request, cookies, locals }) => {
		// A form action is its own request, and nothing `load` worked out reaches
		// it, so the organiser check is made here rather than trusted from
		// whenever the page was last drawn. `02-architecture/permissions.md` asks
		// every action for this, and `removeImage` below does the same.
		const { conference } = await requirePermission(locals, url, params.slug, 'edit_conference');

		const formData = await request.formData();
		const values = readConferenceEdit(formData);

		// Read again rather than believing the page: this is its own request, and
		// the first invoice may have been raised since the form was drawn.
		const [savedCurrency, isCurrencyLocked] = await Promise.all([
			readConferenceCurrency(locals.supabase, conference.id),
			hasInvoices(locals.supabase, conference.id)
		]);

		const errors: ConferenceEditErrors = validateConferenceEdit(values, {
			isCurrencyLocked,
			savedCurrency
		});

		if (isCurrencyLocked) {
			/*
				A locked form has no currency control at all, so it posts none and
				`values.currency` arrives empty. The saved code goes back in here,
				after the check above and before anything uses `values` — the failure
				below sends them back to the page, and the save further down writes
				them — so a locked conference can neither be redrawn with an empty
				currency nor have its currency written away.

				After the check and not before it, because `validateConferenceEdit`
				has a word to say about a locked form that names a *different*
				currency, and putting the saved code in first would leave it nothing
				to notice.
			*/
			values.currency = savedCurrency;
		}

		const chosenBanner = readChosenImage(formData, 'banner');
		const chosenLogo = readChosenImage(formData, 'logo');

		const bannerProblem = chosenBanner ? validateConferenceImage(chosenBanner) : null;
		const logoProblem = chosenLogo ? validateConferenceImage(chosenLogo) : null;

		if (bannerProblem) {
			errors.banner = bannerProblem;
		}

		if (logoProblem) {
			errors.logo = logoProblem;
		}

		if (hasErrors(errors)) {
			/*
				400, because what arrived is wrong and only the person who sent it can
				put it right. `fail` sends the page back with that status and this
				result as `form`, so every field keeps what was typed and shows its
				own message at once.
			*/
			return fail(400, { values, errors, message: null });
		}

		await updateConference(locals.supabase, conference.id, values);

		/*
			The row first and the pictures second, which is what makes the message
			below true: by the time an upload can fail, the text has already been
			saved. A 500 rather than the 400 above, because every value was fine and
			Storage is ours: there is nothing here for the organiser to fix.
		*/
		try {
			if (chosenBanner) {
				await uploadConferenceImage(locals.supabase, conference.id, 'banner', chosenBanner);
			}

			if (chosenLogo) {
				await uploadConferenceImage(locals.supabase, conference.id, 'logo', chosenLogo);
			}
		} catch {
			return fail(500, {
				values,
				errors: {},
				message: 'The image could not be saved. Your other changes were saved.'
			});
		}

		// A redirecting action cannot return anything, so the message travels in a
		// one-shot cookie that the root layout reads and throws away.
		setFlash(cookies, { tone: 'success', message: 'Details saved.' });
		redirect(303, pageAfterSave(conference));
	},

	/**
	 * Take the banner or the logo away again, so the page shows the initials
	 * gradient or the empty square once more.
	 */
	removeImage: async ({ params, url, cookies, locals }) => {
		// Checked again for the reason given on `save` above.
		const { conference } = await requirePermission(locals, url, params.slug, 'edit_conference');

		/*
			Which picture is meant comes from the address rather than from a field.
			SvelteKit lets a form action carry a query string of its own, so the
			button posts to `?/removeImage&kind=banner`. It has to: the button sits
			inside the one big form this page has, and a second `<form>` around it
			would be a form inside a form, which HTML does not allow.
		*/
		const kind = url.searchParams.get('kind');

		if (kind !== 'logo' && kind !== 'banner') {
			// No values travel back: nothing was typed, and the page falls back to
			// what `load` read.
			return fail(400, {
				values: null,
				errors: {},
				message: 'That is not a picture this page has.'
			});
		}

		await removeConferenceImage(locals.supabase, conference.id, kind);

		setFlash(cookies, { tone: 'success', message: 'Image removed.' });
		redirect(303, manageDetailsUrl(params.slug));
	}
};
