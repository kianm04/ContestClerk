/**
 * The words on the landing page, `/`, the page a visitor who is not signed in
 * sees first.
 *
 * The page opens the way the product owner's mockup draws it (Trello
 * RBz46aTQ): a hero split down the middle, delegates on the left and
 * organisers on the right, and an example of the product under it, which has
 * a file of its own, `landing-showcase.ts`. Under the example come the
 * sections that carry the mockup's language down the page: a drawn committee
 * room that runs, the six steps of a conference, what MUNMeet offers
 * delegates, organisers and schools, the conferences taking applications
 * right now, a few questions, and the mockup's one last call to sign up.
 *
 * The words are data here rather than sentences written into the markup, so
 * that the two halves of the hero can share one component, so that the
 * sections only lay their rows out, and so that `landing.test.ts` can check
 * the links without rendering anything. The icons beside the rows are Carbon
 * icons, imported here so a row carries its own.
 *
 * Nothing here talks to Supabase.
 */

import type { Component } from 'svelte';
import type { CarbonIconProps } from 'carbon-icons-svelte';
import Calendar from 'carbon-icons-svelte/lib/Calendar.svelte';
import Document from 'carbon-icons-svelte/lib/Document.svelte';
import Earth from 'carbon-icons-svelte/lib/Earth.svelte';
import Grid from 'carbon-icons-svelte/lib/Grid.svelte';
import ListChecked from 'carbon-icons-svelte/lib/ListChecked.svelte';
import Location from 'carbon-icons-svelte/lib/Location.svelte';
import Microphone from 'carbon-icons-svelte/lib/Microphone.svelte';
import Money from 'carbon-icons-svelte/lib/Money.svelte';
import Search from 'carbon-icons-svelte/lib/Search.svelte';
import Task from 'carbon-icons-svelte/lib/Task.svelte';
import Time from 'carbon-icons-svelte/lib/Time.svelte';
import type { ResolvedPathname } from '$app/types';
import { conferenceListUrl, forOrganisersUrl, registerUrl, startConferenceUrl } from '$lib/urls';

/** A link's words and where it goes. */
export type LandingLink = { href: ResolvedPathname; label: string };

/** A Carbon icon, the component itself, ready to draw with `<row.icon />`. */
export type LandingIcon = Component<CarbonIconProps>;

/** One half of the hero: who it speaks to, what it promises, and where to go. */
export type HeroPitch = {
	/** The small capitals above the heading, such as "For delegates". */
	eyebrow: string;
	/**
	 * The heading, one string per line. The mockup breaks it in a set place
	 * ("Join conferences / that shape you."), so the lines are kept apart and a
	 * desktop shows each on its own line. A phone lets them run together.
	 */
	headingLines: string[];
	/** The sentence under the heading, split into lines the same way. */
	leadLines: string[];
	/** The button under the sentence. The arrow after the words is drawn by the markup. */
	link: LandingLink;
};

/** The left half of the hero, on the picture of a university. */
export const DELEGATE_PITCH: HeroPitch = {
	eyebrow: 'For delegates',
	headingLines: ['Join conferences', 'that shape you.'],
	leadLines: [
		'Discover Model UN conferences worldwide,',
		'apply, prepare, and participate — all in one place.'
	],
	link: { href: conferenceListUrl(), label: 'Explore conferences' }
};

/**
 * The right half of the hero, on the picture of a desk.
 *
 * Only a visitor ever sees this page, so "Create a conference" goes through
 * sign up and lands on the form once the account exists.
 */
export const ORGANISER_PITCH: HeroPitch = {
	eyebrow: 'For organisers',
	headingLines: ['Create conferences', 'that make an impact.'],
	leadLines: [
		'Custom applications, committee management,',
		'scheduling, and live session tools — built for MUN.'
	],
	link: { href: startConferenceUrl(false), label: 'Create a conference' }
};

/**
 * The words at the top of one section, in the hero's own manner: small
 * capitals, a title in the serif, and one sentence under it.
 */
export type LandingSectionWords = { eyebrow: string; title: string; lead?: string };

/** One row of a section's list: an icon, a title line and one line of detail. */
export type LandingRow = { icon: LandingIcon; title: string; detail: string };

/** One numbered step: a title line and one line of detail. */
export type LandingStep = { title: string; detail: string };

export const ROOM_WORDS: LandingSectionWords = {
	eyebrow: 'Live sessions',
	title: 'The committee room, live.',
	lead: "The chair's console and every delegate's phone show the same speakers' list and the same clock."
};

/** The rows beside the drawn committee room. */
export const ROOM_ROWS: LandingRow[] = [
	{
		icon: ListChecked,
		title: 'Roll call',
		detail: 'Present, present and voting, or absent, in one pass.'
	},
	{
		icon: Microphone,
		title: "Speakers' list",
		detail: 'The chair adds a country; the clock starts when they yield the floor.'
	},
	{
		icon: Task,
		title: 'Motions and votes',
		detail: 'Moderated and unmoderated caucuses, counted as they are called.'
	},
	{
		icon: Time,
		title: 'One clock, every screen',
		detail: "What is on the chair's laptop is on every delegate's phone."
	}
];

export const JOURNEY_WORDS: LandingSectionWords = {
	eyebrow: 'How it works',
	title: 'From the first application to the final vote.',
	lead: 'Six steps in one place. Nothing is copied from one spreadsheet into another.'
};

/**
 * The six steps of a conference, in order, from the organiser publishing it to
 * the chair running its committees.
 */
export const JOURNEY_STEPS: LandingStep[] = [
	{ title: 'Publish', detail: 'Dates, venue, committees and fees on a public page.' },
	{ title: 'Apply', detail: 'Delegates apply with a saved profile and your own questions.' },
	{ title: 'Review', detail: 'Accept, reject or waitlist, one or a hundred at a time.' },
	{ title: 'Allocate', detail: 'Every seat in every committee on one grid.' },
	{ title: 'Pay', detail: 'Delegates pay by card. Invoices mark themselves paid.' },
	{ title: 'Chair', detail: "Roll call, speakers' list, motions, votes and clocks, live." }
];

export const DELEGATE_WORDS: LandingSectionWords = {
	eyebrow: 'For delegates',
	title: 'Apply once. Know where you sit.',
	lead: 'Every conference you apply to, and everything it tells you, in one account.'
};

/** What the page offers a delegate, and where it sends them. */
export const DELEGATE_ROWS: LandingRow[] = [
	{
		icon: Search,
		title: 'Find a conference',
		detail: 'Search by country, level and dates. See which are taking applications.'
	},
	{
		icon: Document,
		title: 'Apply once',
		detail: 'Your profile is saved. Each conference only adds its own questions.'
	},
	{
		icon: Location,
		title: 'Know where you sit',
		detail: 'Your committee, your country and the programme, on your phone.'
	},
	{
		icon: Microphone,
		title: 'Follow the floor',
		detail: "The speakers' list and the clock, as the chair sees them."
	}
];

export const DELEGATE_LINK: LandingLink = {
	href: conferenceListUrl(),
	label: 'Explore conferences'
};

export const ORGANISER_WORDS: LandingSectionWords = {
	eyebrow: 'For organisers',
	title: 'Run the whole conference from one place.',
	lead: 'From the public page to the final vote, with nothing to export and stitch together.'
};

/** What the page offers an organiser, and where it sends them. */
export const ORGANISER_ROWS: LandingRow[] = [
	{
		icon: Earth,
		title: 'A public page in an afternoon',
		detail: 'Dates, venue, committees and fees. Live and searchable.'
	},
	{
		icon: ListChecked,
		title: 'Applications that review themselves',
		detail: 'Filter, sort, accept, reject or waitlist.'
	},
	{
		icon: Grid,
		title: 'Seat allocation you can see',
		detail: 'Every seat free, reserved for a school or filled.'
	},
	{
		icon: Money,
		title: 'Fees by card, invoices done',
		detail: 'Connect Stripe once. Refunds are one click.'
	},
	{
		icon: Calendar,
		title: 'One schedule, one feed',
		detail: 'Change a room and everyone is told.'
	}
];

export const ORGANISER_LINK: LandingLink = {
	href: forOrganisersUrl(),
	label: 'See the organiser tour'
};

export const SCHOOLS_WORDS: LandingSectionWords = {
	eyebrow: 'For schools',
	title: 'Bring a whole delegation.',
	lead: 'One account for the supervisor, a code for the students, and the seats the organisers allocate you.'
};

/** What a school does, in order. The section numbers them by their place here. */
export const SCHOOL_STEPS: LandingStep[] = [
	{
		title: 'Register a delegation',
		detail: 'One account for the supervisor, one delegation per conference.'
	},
	{
		title: 'Invite students with a code',
		detail: 'Students join the delegation themselves. No spreadsheet.'
	},
	{
		title: 'Assign the seats you are allocated',
		detail: 'The organisers allocate seats to the school; you hand them out.'
	}
];

/** The three states an application can be shown in, as the status chips word them. */
export type SampleStatus = 'Accepted' | 'Pending' | 'Waitlisted';

/** One line of the drawn "My applications" list in the "For delegates" picture. */
export type SampleMyApplication = {
	conference: string;
	/** The seat, or where things stand, and the dates. */
	detail: string;
	status: SampleStatus;
};

/** The drawn list of a delegate's own applications. Every conference is made up. */
export const SAMPLE_MY_APPLICATIONS: SampleMyApplication[] = [
	{
		conference: 'Oxford International MUN 2026',
		detail: 'China · UNHRC · 12 – 15 Feb 2026',
		status: 'Accepted'
	},
	{
		conference: 'Geneva Model UN 2026',
		detail: 'Under review · 3 – 6 Apr 2026',
		status: 'Pending'
	},
	{
		conference: 'Berlin International MUN 2026',
		detail: 'Fourth on the waitlist · 4 – 8 Dec 2026',
		status: 'Waitlisted'
	}
];

/** One line of the drawn applications table in the "For organisers" picture. */
export type SampleApplicant = {
	name: string;
	country: string;
	committee: string;
	status: SampleStatus;
};

/** The drawn applications table. Every name is made up. */
export const SAMPLE_APPLICANTS: SampleApplicant[] = [
	{ name: 'Amara Okafor', country: 'Kenya', committee: 'Security Council', status: 'Accepted' },
	{ name: 'Noor Haddad', country: 'Jordan', committee: 'Human Rights Council', status: 'Pending' },
	{ name: 'Priya Nair', country: 'India', committee: 'Security Council', status: 'Accepted' },
	{ name: 'Daniel Weiss', country: 'Austria', committee: 'Historical', status: 'Waitlisted' },
	{ name: 'Mei Tanaka', country: 'Japan', committee: 'Human Rights Council', status: 'Pending' }
];

export const CONFERENCES_WORDS: LandingSectionWords = {
	eyebrow: 'Open now',
	title: 'Taking applications now.',
	lead: 'Real conferences on MUNMeet that you can apply to today.'
};

/** How many conferences the "Taking applications now" section shows at most. */
export const LANDING_CONFERENCE_LIMIT = 4;

export const QUESTIONS_WORDS: LandingSectionWords = {
	eyebrow: 'Questions',
	title: 'Good to know before you start.'
};

/** One question and its answer, in the section near the foot of the page. */
export type LandingQuestion = { question: string; answer: string };

/** The questions, in the order a visitor tends to ask them. */
export const LANDING_QUESTIONS: LandingQuestion[] = [
	{
		question: 'What does it cost?',
		// The price is written out here rather than read from
		// `PLATFORM_FEE_PER_DELEGATE_CENTS`, which lives in `$lib/server` and may
		// never reach the browser. If the fee changes, this sentence is the second
		// place to change.
		answer: '€2.00 per delegate seat paid through MUNMeet. Free conferences pay nothing.'
	},
	{
		question: 'Do delegates need an account?',
		answer: 'Yes, one free account, which they keep from conference to conference.'
	},
	{
		question: 'Can we collect fees ourselves?',
		answer:
			'Yes. Say so when you set up fees, and delegates see your instructions instead of a card button.'
	},
	{
		question: 'Can chairs use it without being organisers?',
		answer: 'Yes. Invite them by email; they see only their own committees.'
	},
	{
		question: 'Can we try it first?',
		answer:
			'Create a conference and keep it as a draft for as long as you like. Nothing is public until you publish.'
	}
];

/** The band at the foot of the page, as the mockup words it. */
export const CLOSING_CALL = {
	heading: 'Ready to be part of something bigger?',
	text: 'Join thousands of students and organisers on MUNMeet.',
	link: { href: registerUrl(), label: 'Get started' } as LandingLink
};
