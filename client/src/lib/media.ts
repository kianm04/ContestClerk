/**
 * The web addresses of the pictures the app shows.
 *
 * Three kinds of picture exist. Avatars, logos and conference banners are files
 * somebody uploaded, and the database stores only where they landed in the
 * `public-media` bucket, such as `conferences/<id>/banner-<uuid>.jpg`. Country
 * flags are not ours at all; they come from flagcdn.com, which serves one PNG
 * per country code. The third is `static/og-default.jpg`, the picture a shared
 * link falls back to when the page has none of its own.
 *
 * None of those addresses is worth looking up one file at a time, because each
 * is the same sentence every time. Building them here means a component can
 * show a picture without talking to Supabase, and the day a bucket is renamed
 * is one line rather than a search through the components.
 *
 * Nothing here talks to Supabase or to Svelte.
 */

import { PUBLIC_SUPABASE_URL } from '$env/static/public';

/** The Supabase Storage bucket that anybody may read. See `specs/02-architecture/storage.md`. */
const PUBLIC_MEDIA_BUCKET = 'public-media';

/**
 * The address of a file in the `public-media` bucket.
 *
 * `path` is what the database stores, for example
 * `avatars/7f3c.../a1b2.jpg`. The bucket is public, so the address is the same
 * for everybody and never expires; files in the private `documents` bucket are
 * a different job and need a signed link made on the server.
 */
export function publicMediaUrl(path: string): string {
	return `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PUBLIC_MEDIA_BUCKET}/${path}`;
}

/** How wide the flag image we ask flagcdn.com for is, in pixels. */
const FLAG_WIDTHS = {
	/** Shown at 20×15, asked for at 40 so it stays sharp on a high-resolution screen. */
	sm: 40,
	/** Shown at 40×30, asked for at 80 for the same reason. */
	md: 80,
	/** Shown at 96×72 on the chair's current speaker card (T128), asked for at 160. */
	lg: 160,
	/** Shown about 160 wide on the projector (S12), asked for at 320 so it stays sharp there. */
	xl: 320
};

/** The four sizes a flag is shown at. */
export type FlagSize = keyof typeof FLAG_WIDTHS;

/**
 * The address of a country's flag, such as
 * `flagUrl('NL')` giving `https://flagcdn.com/w40/nl.png`.
 *
 * flagcdn.com wants the country code in lower case. Nothing checks that the
 * code is a real country: an unknown one simply gives a picture that does not
 * load, which is better than a page that fails.
 */
export function flagUrl(countryCode: string, size: FlagSize = 'sm'): string {
	return `https://flagcdn.com/w${FLAG_WIDTHS[size]}/${countryCode.toLowerCase()}.png`;
}

/** Where the fallback sharing picture sits in `static/`. */
export const DEFAULT_SHARE_IMAGE_PATH = '/og-default.jpg';

/**
 * Where the conference directory's hero picture sits in `static/`: a building
 * flying the UN flag behind cherry blossom, with a faint globe to its left, cut
 * from the product owner's mockup of the page (Trello WMcXfry0). It is a file
 * we ship with the app, not something anybody uploaded into the `public-media`
 * bucket, so it is used as an address on its own and never passed to
 * `publicMediaUrl`.
 *
 * It is a WebP rather than a JPEG because it has see-through parts: its left
 * side fades in, and its bottom is cut crisply through the middle of the quick
 * filter chips, which hide that cut, and then curves gently down like the white
 * wave the mockup draws (Trello VtIlOpkB). It stops just above where the mockup
 * drew its own search box, so every part of it is the mockup's own picture.
 */
export const CONFERENCES_HERO_IMAGE_PATH = '/conferences-hero.webp';

/**
 * Where the left half of the landing page's hero sits in `static/`: a Gothic
 * university under a blue sky, with cherry blossom in the corners, from the
 * product owner (Trello RBz46aTQ). The hero speaks to delegates on this side.
 * The example card under the hero shows it again as the sample conference's
 * banner. It is a file we ship, so it is used as an address on its own and
 * never passed to `publicMediaUrl`.
 */
export const LANDING_DELEGATES_IMAGE_PATH = '/landing-delegates.webp';

/**
 * Where the right half of the landing page's hero sits in `static/`: a sunlit
 * desk with a laptop, from the same card. The hero speaks to organisers on
 * this side.
 */
export const LANDING_ORGANISERS_IMAGE_PATH = '/landing-organisers.webp';

/**
 * Where the MUNMeet logo sits in `static/`.
 *
 * This is a file we ship with the app, so it is used as an address on its own
 * and must never be passed to `publicMediaUrl`. The
 * picture is the mark and the word "MUNMeet" side by side on a transparent
 * background, with some empty space around it, so it is sized by height and
 * keeps its own width.
 */
export const LOGO_IMAGE_PATH = '/logo-full.webp';

/**
 * Where the square MUNMeet mark sits in `static/`: the two figures from
 * `LOGO_IMAGE_PATH` without the word next to them. The top bar shows this one
 * on a phone, where the full logo would leave no room for the buttons.
 */
export const LOGO_MARK_IMAGE_PATH = '/logo-small.webp';

/**
 * Where the committee emblem sits in `static/`: a plain globe in a round seal,
 * shown beside every committee on `/home`.
 *
 * It is deliberately not the United Nations emblem. General Assembly resolution
 * 92(I) keeps that emblem for the United Nations' own use, and a Model UN
 * committee is not the UN (T149).
 */
export const COMMITTEE_EMBLEM_IMAGE_PATH = '/committee-emblem.svg';

/**
 * The pictures the steps of creating a conference (Trello fe3reN7Y) show in
 * place of a banner or a logo that has not been uploaded yet. Every preview
 * then keeps its shape, and nothing moves when a real picture comes. Both are
 * files we ship, used as addresses on their own.
 *
 * The banner is a drawing that says "Sample banner" on pale stripes, so
 * nobody takes it for the conference's own photograph (the owner found a real
 * photograph there misleading). The logo is the committee emblem.
 */
export const SAMPLE_BANNER_IMAGE_PATH = '/sample-banner.svg';
export const SAMPLE_LOGO_IMAGE_PATH = COMMITTEE_EMBLEM_IMAGE_PATH;

/** The address of a conference's banner, or of the sample banner while it has none. */
export function bannerImageUrl(bannerPath: string | null): string {
	return bannerPath === null ? SAMPLE_BANNER_IMAGE_PATH : publicMediaUrl(bannerPath);
}

/** The address of a conference's logo, or of the sample logo while it has none. */
export function logoImageUrl(logoPath: string | null): string {
	return logoPath === null ? SAMPLE_LOGO_IMAGE_PATH : publicMediaUrl(logoPath);
}

/**
 * The full web address of the picture a shared link shows when the page has
 * none of its own.
 *
 * `og:image` has to be a whole address, not a path, because the site reading it
 * is somebody else's. `origin` comes from the request the page is answering
 * (`url.origin` in a `load`), so it is right in development and in production
 * without anything having to be configured.
 */
export function defaultShareImageUrl(origin: string): string {
	// `url.origin` never ends in a slash, but an origin written out by hand
	// might, and a doubled slash makes an address some crawlers will not fetch.
	const originWithoutTrailingSlash = origin.replace(/\/$/, '');

	return `${originWithoutTrailingSlash}${DEFAULT_SHARE_IMAGE_PATH}`;
}
