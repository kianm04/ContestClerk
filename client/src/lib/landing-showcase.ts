/**
 * The example under the landing page's hero (Trello RBz46aTQ): one conference
 * card and, beside it, how that conference looks to one person using MUNMeet.
 *
 * A switch above it picks whose view is shown, a delegate's or an organiser's.
 * The choice lives in the address, `/?view=organiser`, so the switch is two
 * plain links that work without JavaScript, and a shared link shows the same
 * view. `parseShowcaseView` reads it back.
 *
 * Everything here is sample content drawn as a picture of the product. None of
 * it comes from the database, and nothing in it can be pressed. The icons are
 * Carbon icons, imported here so each line carries its own.
 *
 * Nothing here talks to Supabase.
 */

import type { Component } from 'svelte';
import type { CarbonIconProps } from 'carbon-icons-svelte';
import Building from 'carbon-icons-svelte/lib/Building.svelte';
import Flag from 'carbon-icons-svelte/lib/Flag.svelte';
import ListChecked from 'carbon-icons-svelte/lib/ListChecked.svelte';
import User from 'carbon-icons-svelte/lib/User.svelte';
import UserMultiple from 'carbon-icons-svelte/lib/UserMultiple.svelte';

/** A Carbon icon, the component itself, ready to draw with `<detail.icon />`. */
export type ShowcaseIcon = Component<CarbonIconProps>;

/** Whose view of the example is shown. */
export type ShowcaseView = 'delegate' | 'organiser';

/** The search parameter that holds the view, as in `/?view=organiser`. */
export const SHOWCASE_VIEW_PARAMETER = 'view';

/** The two views, in the order the switch shows them. The first is the default. */
export const SHOWCASE_VIEWS: ShowcaseView[] = ['delegate', 'organiser'];

/**
 * The view the address asks for. Anything other than `organiser`, including no
 * parameter at all, shows the delegate's view, so a mistyped link still shows
 * a page.
 */
export function parseShowcaseView(searchParams: URLSearchParams): ShowcaseView {
	const requested = searchParams.get(SHOWCASE_VIEW_PARAMETER);

	if (requested === 'organiser') {
		return 'organiser';
	}

	return 'delegate';
}

/** The colour of a committee chip, the same three pastels a real conference card uses. */
export type ShowcaseChipTone = 'blue' | 'green' | 'violet';

/** The conference on the card on the left. It is the same in both views. */
export const SHOWCASE_CONFERENCE = {
	name: 'Oxford International MUN 2026',
	organisation: 'University of Oxford',
	place: 'Oxford, United Kingdom',
	dates: '12 – 15 Feb 2026',
	levels: ['High school', 'University'],
	committees: [
		{ name: 'Security Council', tone: 'blue' },
		{ name: 'UNHRC', tone: 'green' },
		{ name: 'Historical', tone: 'violet' }
	] satisfies { name: string; tone: ShowcaseChipTone }[],
	/** How many committees the "+8" chip stands for. */
	moreCommitteeCount: 8
};

/**
 * Where one step of the timeline has got to. `done` is ticked, `current` is
 * ringed in blue, and `upcoming` is an empty grey circle.
 */
export type ShowcaseStepState = 'done' | 'current' | 'upcoming';

/** One step of the timeline in the card on the right. */
export type ShowcaseStep = {
	label: string;
	/** The date under the step, or a word such as "Pending". */
	detail: string;
	state: ShowcaseStepState;
};

/** One line of the grey box of details, with its icon. */
export type ShowcaseDetail = {
	icon: ShowcaseIcon;
	label: string;
};

/** Everything one view shows in the card on the right, and its button in the switch. */
export type ShowcaseStory = {
	view: ShowcaseView;
	/** The words on the switch, such as "As a delegate". */
	switchLabel: string;
	switchIcon: ShowcaseIcon;
	/** What the example shows, for somebody who cannot see it. */
	description: string;
	steps: ShowcaseStep[];
	/** The green box at the top of the right-hand column. */
	notice: { title: string; text: string };
	detailsHeading: string;
	details: ShowcaseDetail[];
	/** The words on the blue button at the foot. The arrow is drawn by the markup. */
	actionLabel: string;
};

/** A delegate's view: their application to the conference, now accepted. */
const DELEGATE_STORY: ShowcaseStory = {
	view: 'delegate',
	switchLabel: 'As a delegate',
	switchIcon: User,
	description:
		'An example of MUNMeet for a delegate, in five stages: discover a conference, apply, get accepted, prepare for committee, and join the live committee.',
	steps: [
		{ label: 'Application submitted', detail: '14 Jan 2026', state: 'done' },
		{ label: 'Under review', detail: '22 Jan 2026', state: 'done' },
		{ label: 'Accepted', detail: '28 Jan 2026', state: 'current' },
		{ label: 'Committee assignment', detail: 'Pending', state: 'upcoming' },
		{ label: 'Join live sessions', detail: '12 Feb 2026', state: 'upcoming' }
	],
	// The mockup's words, exclamation mark and all, although the app's own
	// writing style has none. It is a picture of a delegate's good news on a
	// marketing page, not a message the app sends.
	notice: {
		title: "You've been accepted!",
		text: 'You have been accepted to Oxford International MUN 2026.'
	},
	detailsHeading: 'Your details',
	details: [
		{ icon: User, label: 'Delegate' },
		{ icon: Flag, label: 'China' },
		{ icon: UserMultiple, label: 'UNHRC' }
	],
	actionLabel: 'View committee details'
};

/** An organiser's view: the same conference, with its applications being read. */
const ORGANISER_STORY: ShowcaseStory = {
	view: 'organiser',
	switchLabel: 'As an organiser',
	switchIcon: UserMultiple,
	description:
		'An example of MUNMeet for an organiser: Oxford International MUN 2026, from publishing the conference to reviewing its applications.',
	steps: [
		{ label: 'Conference published', detail: '2 Dec 2025', state: 'done' },
		{ label: 'Applications opened', detail: '5 Jan 2026', state: 'done' },
		{ label: 'Reviewing applications', detail: '142 received', state: 'current' },
		{ label: 'Seat allocation', detail: 'Pending', state: 'upcoming' },
		{ label: 'Run live sessions', detail: '12 Feb 2026', state: 'upcoming' }
	],
	notice: {
		title: '142 applications received',
		text: '38 of them are waiting for your review.'
	},
	detailsHeading: 'Your conference',
	details: [
		{ icon: UserMultiple, label: '142 applications' },
		{ icon: ListChecked, label: '38 waiting for review' },
		{ icon: Building, label: '11 committees' }
	],
	actionLabel: 'Review applications'
};

/** Both views, looked up by the one the address asks for. */
export const SHOWCASE_STORIES: Record<ShowcaseView, ShowcaseStory> = {
	delegate: DELEGATE_STORY,
	organiser: ORGANISER_STORY
};
