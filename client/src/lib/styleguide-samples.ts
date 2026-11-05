/**
 * The made-up data the styleguide page hands to the components it shows.
 *
 * `/styleguide` never reads the database: every component on it is drawn with
 * something from this file, so the page renders the same way in every
 * environment and cannot break when the seed changes. The design tokens it also
 * lists are in `styleguide-tokens.ts` next door.
 *
 * Nothing here talks to Supabase or to Svelte. The names are invented; any
 * resemblance to a real conference is a coincidence.
 */

import type { TableColumn, TableSort } from '$lib/components/DataTable.svelte';
import type { FaqItem } from '$lib/components/FaqList.svelte';
import type { KeyValueItem } from '$lib/components/KeyValueList.svelte';
import type { RadioOption } from '$lib/components/RadioGroup.svelte';
import type { SelectOption } from '$lib/components/SelectField.svelte';
import type { TimelineItem } from '$lib/components/Timeline.svelte';
import type { AttendanceStatus, RoomSeat } from '$lib/committee-room';
import type { Committee } from '$lib/committees';
import type { Conference } from '$lib/conferences';
import type { Database } from '$lib/database.types';
import type { Flash } from '$lib/flash';
import type { GslEntry } from '$lib/gsl-floor';
import type { LegalSection } from '$lib/legal-text';
import type { Notification } from '$lib/notifications';
import type { ScheduleEvent } from '$lib/schedule';
import type { BadgeTone } from '$lib/status';
import type { ResolvedPathname } from '$app/types';
import { styleguideUrl } from '$lib/urls';

/**
 * A conference with a banner photograph.
 *
 * `bannerPath` is a path inside the `public-media` storage bucket, and a real
 * sample picture sits at it: every `pnpm db:reset` uploads the files under
 * `supabase/media/public-media/` into the bucket, so this example draws the
 * half of `ConferenceBanner` that shows an `<img>`. The other sample below,
 * whose `bannerPath` is null, is the one that shows the initials gradient the
 * component falls back to.
 *
 * Its application window is deliberately a wide one, opening in 2026 and closing
 * in 2028, so that `ConferenceCard` keeps showing the "Applications open" badge
 * however long this sample outlives the person who wrote it.
 */
export const SAMPLE_CONFERENCE: Conference = {
	id: '11111111-1111-4111-8111-111111111111',
	slug: 'riverside-mun-2027',
	name: 'Riverside Model United Nations 2027',
	description:
		'Four days of debate on the river.\n\nRiverside MUN brings six hundred delegates together in eleven committees, from a beginners General Assembly to a crisis Security Council.',
	organizationName: 'Riverside International School',
	organizationSlug: 'riverside-international-school',
	city: 'Utrecht',
	countryCode: 'NL',
	countryName: 'Netherlands',
	locationMode: 'in_person',
	venueStatus: 'known',
	conferenceTimeStatus: 'known',
	startTime: '09:00',
	endTime: '17:30',
	feeStatus: 'paid',
	applicationOpenMode: 'scheduled',
	startDate: '2027-02-12',
	endDate: '2027-02-15',
	websiteUrl: 'https://example.test/riverside-mun',
	bannerPath: 'conferences/11111111-1111-4111-8111-111111111111/banner.jpg',
	logoPath: null,
	level: 'mixed',
	status: 'published',
	timezone: 'Europe/Amsterdam',
	expectedDelegates: 600,
	applicationsOpenAt: '2026-01-01T09:00:00Z',
	applicationsCloseAt: '2028-01-01T09:00:00Z',
	committeeCount: 11,
	committeeNames: [
		'General Assembly',
		'DISEC',
		'SPECPOL',
		'ECOSOC',
		'UNHRC',
		'UNEP',
		'WHO',
		'UNESCO',
		'ICJ',
		'Historical Crisis',
		'Security Council'
	],
	tagline: 'Four days of debate on the river.',
	venueName: 'Riverside Conference Centre',
	venueAddress: 'Oudegracht 1, 3511 AA Utrecht',
	contactEmail: 'hello@riversidemun.example',
	instagramUrl: 'https://example.test/riversidemun',
	contactPhone: '+31 30 123 4567',
	facebookUrl: 'https://example.test/riversidemun',
	linkedinUrl: null,
	youtubeUrl: 'https://example.test/riversidemun',
	tiktokUrl: null,
	language: 'English',
	minAge: 14,
	maxAge: 22,
	positionPaperRequired: true,
	// Inside the wide application window above, so the conference page's apply
	// panel shows this line rather than hiding it.
	positionPaperDeadline: '2027-01-15T17:00:00Z',
	acceptsIndividualApplications: true,
	acceptsDelegations: true
};

/**
 * The same conference with no photograph, so the banner shows its initials
 * instead. Everything the two samples share, including the application window,
 * is inherited from the one above.
 */
export const SAMPLE_CONFERENCE_WITHOUT_BANNER: Conference = {
	...SAMPLE_CONFERENCE,
	id: '22222222-2222-4222-8222-222222222222',
	slug: 'lakeside-mun-2027',
	name: 'Lakeside Model United Nations 2027',
	organizationName: 'Lakeside Debating Society',
	organizationSlug: 'lakeside-debating-society',
	city: 'Geneva',
	countryCode: 'CH',
	countryName: 'Switzerland',
	timezone: 'Europe/Zurich',
	bannerPath: null
};

/** A committee with a short name, three topics and a room. */
export const SAMPLE_COMMITTEE: Committee = {
	id: '33333333-3333-4333-8333-333333333333',
	slug: 'unsc',
	name: 'United Nations Security Council',
	abbreviation: 'UNSC',
	description: 'Fifteen seats, two topics and a crisis on the second morning.',
	topics: ['Peacekeeping in the Sahel', 'The militarisation of outer space'],
	level: 'advanced',
	room: 'Committee Room 1'
};

/** One seat in a committee, as the seat list shows it. */
export type SampleSeat = {
	id: string;
	/** The country or character the seat represents. */
	name: string;
	/** Two letters, such as `NL`. */
	countryCode: string;
};

/** Five seats, used to show `Flag` at both of its sizes. */
export const SAMPLE_SEATS: SampleSeat[] = [
	{ id: 'seat-nl', name: 'Netherlands', countryCode: 'NL' },
	{ id: 'seat-br', name: 'Brazil', countryCode: 'BR' },
	{ id: 'seat-ke', name: 'Kenya', countryCode: 'KE' },
	{ id: 'seat-jp', name: 'Japan', countryCode: 'JP' },
	{ id: 'seat-fr', name: 'France', countryCode: 'FR' }
];

/** One person, as `PersonRow` shows them. */
export type SamplePerson = {
	id: string;
	name: string;
	subtitle: string;
};

/** Three people for the `PersonRow` and `Avatar` examples. */
export const SAMPLE_PEOPLE: SamplePerson[] = [
	{ id: 'person-1', name: 'Amara Osei', subtitle: 'Chair · Security Council' },
	{ id: 'person-2', name: 'Bram de Vries', subtitle: 'Delegate · Netherlands' },
	{ id: 'person-3', name: 'Sofia Marchetti', subtitle: 'Delegation head · Lakeside' }
];

/** An invoice, used for the `Money` examples. */
export type SampleInvoice = {
	id: string;
	description: string;
	amountCents: number;
	/** A three-letter ISO 4217 code, such as `EUR`. */
	currency: string;
};

/** One invoice per currency the platform supports a fee in. */
export const SAMPLE_INVOICES: SampleInvoice[] = [
	{
		id: 'invoice-1',
		description: 'Delegate fee · Riverside MUN 2027',
		amountCents: 6500,
		currency: 'EUR'
	},
	{
		id: 'invoice-2',
		description: 'Delegation of 12 · Lakeside MUN 2027',
		amountCents: 78000,
		currency: 'USD'
	},
	{ id: 'invoice-3', description: 'Late registration', amountCents: 2550, currency: 'GBP' }
];

/** The facts panel on a conference page. */
export const SAMPLE_FACTS: KeyValueItem[] = [
	{ label: 'Organisation', value: 'Riverside International School' },
	{ label: 'Where', value: 'Utrecht, Netherlands' },
	{ label: 'Committees', value: '11' },
	{ label: 'Delegate fee', value: '€65.00' },
	{ label: 'Applications close', value: '14 December 2026' }
];

/** A morning from the schedule, for the `Timeline` example. */
export const SAMPLE_EVENTS: TimelineItem[] = [
	{
		time: '08:30',
		title: 'Registration',
		subtitle: 'Bring your school letter',
		location: 'Main hall'
	},
	{ time: '09:30', title: 'Opening ceremony', location: 'Auditorium' },
	{
		time: '11:00',
		title: 'Committee session I',
		subtitle: 'All committees',
		location: 'See your badge'
	},
	{ time: '13:00', title: 'Lunch', location: 'Courtyard' }
];

/** Questions for the `FaqList` example. */
export const SAMPLE_FAQS: FaqItem[] = [
	{
		question: 'Who can apply?',
		answer: 'Anyone aged 14 or over, on their own or through their school.'
	},
	{
		question: 'What does the fee cover?',
		answer: 'Four days of committee sessions, lunch on each day and the closing ceremony.'
	},
	{
		question: 'Can I change committee after I am accepted?',
		answer: 'Ask your conference organiser. Most say yes while seats are still free.'
	}
];

/** Plain text with a blank line in it, to show how `ParagraphText` splits it up. */
export const SAMPLE_PARAGRAPHS =
	'Riverside MUN has run every February since 2009.\n\nIt is organised by students, for students. Chairs are trained over two weekends in the autumn, and every committee is observed by a member of staff.';

/**
 * Two sections of a legal document, for the `LegalPage` example.
 *
 * The real words of `/terms` and `/privacy` are in `legal-text.ts`. These two
 * are short on purpose, and the second one carries a table, because that is the
 * half of `LegalPage` the terms page never shows.
 *
 * The "Who sees it" rows say the same thing the real policy says, rather than
 * something shorter and tidier. Sample copy on the styleguide is what somebody
 * reaches for when they write the next page, and `02-architecture/permissions.md`
 * gives every signed-in account the whole public profile.
 */
export const SAMPLE_LEGAL_SECTIONS: LegalSection[] = [
	{
		id: 'what-we-collect',
		heading: 'What we collect',
		paragraphs: [
			'Your name, your email address and the answers you give on an application.',
			'We keep whether an invoice has been paid. We never keep card numbers.'
		]
	},
	{
		id: 'who-sees-it',
		heading: 'Who sees it',
		paragraphs: [
			'The people running the conference you applied to. Your public profile is the exception: anyone signed in to MUNMeet can read it.'
		],
		table: {
			columns: ['Who', 'What they see'],
			rows: [
				{
					who: 'Organisers of a conference you applied to',
					sees: 'Your profile, your private details and your answers to their questions.'
				},
				{
					who: 'Other participants, and anyone else signed in',
					sees: 'Your public profile. Never your private details.'
				}
			]
		}
	}
];

/** One row of the sample applications table. */
export type SampleApplicant = {
	id: string;
	name: string;
	committee: string;
	country: string;
	status: Database['public']['Enums']['application_status'];
};

/** The columns of the sample table. Only two of them sort. */
export const SAMPLE_TABLE_COLUMNS: TableColumn[] = [
	{ key: 'name', label: 'Applicant', isSortable: true },
	{ key: 'committee', label: 'Committee' },
	{ key: 'country', label: 'Country' },
	{ key: 'status', label: 'Status', isSortable: true }
];

/** Four applicants, one of each interesting status. */
export const SAMPLE_TABLE_ROWS: SampleApplicant[] = [
	{
		id: 'application-1',
		name: 'Amara Osei',
		committee: 'UNSC',
		country: 'Kenya',
		status: 'accepted'
	},
	{
		id: 'application-2',
		name: 'Bram de Vries',
		committee: 'GA1',
		country: 'Netherlands',
		status: 'submitted'
	},
	{
		id: 'application-3',
		name: 'Sofia Marchetti',
		committee: 'ECOSOC',
		country: 'Italy',
		status: 'waitlisted'
	},
	{
		id: 'application-4',
		name: 'Tomás Ferreira',
		committee: 'UNSC',
		country: 'Brazil',
		status: 'rejected'
	}
];

/** The table sorted by applicant name, A to Z. */
export const SAMPLE_SORT_ASCENDING: TableSort = { key: 'name', direction: 'asc' };

/** The same table sorted by status, the other way round. */
export const SAMPLE_SORT_DESCENDING: TableSort = { key: 'status', direction: 'desc' };

/**
 * Where a sortable column header points.
 *
 * `DataTable` asks for an address rather than calling a handler, because a sort
 * link has to work with no JavaScript. Pressing the column that is already
 * sorted turns it round; pressing any other one starts at A to Z. Nothing on
 * the styleguide reads the address back: the samples above never change.
 */
export function sampleSortHref(sort: TableSort, key: string): ResolvedPathname {
	const isSameColumn = sort.key === key;
	const nextDirection = isSameColumn && sort.direction === 'asc' ? 'desc' : 'asc';

	return styleguideUrl({ sort: key, direction: nextDirection });
}

/** Where a page number in `Pagination` points, for the same reason. */
export function samplePageHref(page: number): ResolvedPathname {
	return styleguideUrl({ page });
}

/** One badge, as the styleguide shows it: a tone and the word that goes with it. */
export type SampleBadge = {
	tone: BadgeTone;
	label: string;
};

/** One badge per tone, worded the way `status.ts` words that kind of status. */
export const SAMPLE_BADGES: SampleBadge[] = [
	{ tone: 'brand', label: 'Delegate' },
	{ tone: 'success', label: 'Accepted' },
	{ tone: 'warning', label: 'Waitlisted' },
	{ tone: 'danger', label: 'Not accepted' },
	{ tone: 'neutral', label: 'Draft' }
];

/** One message, as `Notice` and `Toast` show it. Both take the same four tones. */
export type SampleMessage = {
	tone: 'info' | 'warning' | 'error' | 'success';
	title: string;
	text: string;
};

/** One message per tone. */
export const SAMPLE_MESSAGES: SampleMessage[] = [
	{
		tone: 'info',
		title: 'Applications close on 14 December',
		text: 'You can go on editing your draft until then.'
	},
	{
		tone: 'success',
		title: 'Payment received',
		text: 'Your invoice is marked paid. Nothing else to do.'
	},
	{
		tone: 'warning',
		title: 'Position paper due in two days',
		text: 'Upload it before Friday at 18:00.'
	},
	{
		tone: 'error',
		title: 'We could not save that',
		text: 'Two fields need your attention before we can go on.'
	}
];

/** One button, as the styleguide shows it: a shape and a real label. */
export type SampleButton = {
	variant: 'primary' | 'secondary' | 'ghost' | 'danger';
	label: string;
};

/** One button per variant, labelled the way a real page would label it. */
export const SAMPLE_BUTTONS: SampleButton[] = [
	{ variant: 'primary', label: 'Submit application' },
	{ variant: 'secondary', label: 'Save draft' },
	{ variant: 'ghost', label: 'Cancel' },
	{ variant: 'danger', label: 'Withdraw' }
];

/** The committees the sample form offers. */
export const SAMPLE_COMMITTEE_OPTIONS: SelectOption[] = [
	{ value: 'unsc', label: 'Security Council' },
	{ value: 'ga1', label: 'General Assembly First Committee' },
	{ value: 'ecosoc', label: 'Economic and Social Council' },
	{ value: 'unhrc', label: 'Human Rights Council' }
];

/** How much experience the sample form asks for, with a line explaining each answer. */
export const SAMPLE_EXPERIENCE_OPTIONS: RadioOption[] = [
	{
		value: 'none',
		label: 'This is my first conference',
		description: 'We will put you in a beginners committee.'
	},
	{
		value: 'beginner',
		label: 'One or two conferences',
		description: 'You know the rules of procedure.'
	},
	{
		value: 'advanced',
		label: 'More than five',
		description: 'You are happy in a crisis committee.'
	}
];

/** The seat with the floor in the `FloorSpeaker` example, with the delegate in it. */
export const SAMPLE_SPEAKER: RoomSeat = {
	id: 'seat-fr',
	name: 'France',
	countryCode: 'FR',
	delegateName: 'Amara Diallo'
};

/**
 * Two seats waiting to speak, for the read-only `QueueRow` of the delegate
 * live view: Brazil, the reader's own, then Kenya.
 */
export const SAMPLE_WAITING_ENTRIES: GslEntry[] = [
	{
		id: 'entry-br',
		position: 1,
		status: 'waiting',
		spokeSeconds: null,
		seat: { id: 'seat-br', name: 'Brazil', countryCode: 'BR', delegateName: 'Gabriel Santos' }
	},
	{
		id: 'entry-ke',
		position: 2,
		status: 'waiting',
		spokeSeconds: null,
		seat: { id: 'seat-ke', name: 'Kenya', countryCode: 'KE', delegateName: null }
	}
];

/**
 * A roll call of the five sample seats, keyed by seat id. Japan is left out,
 * so the seat list shows a seat the roll call did not record.
 */
export const SAMPLE_ATTENDANCE: Record<string, AttendanceStatus> = {
	'seat-nl': 'present_and_voting',
	'seat-br': 'present',
	'seat-ke': 'absent',
	'seat-fr': 'present'
};

/**
 * The moment a running timer ends, `seconds` from now, written the way the
 * database stores it. A negative number gives a timer whose time is already up.
 */
export function sampleTimerEndsAt(seconds: number): string {
	const endsAt = new Date(Date.now() + seconds * 1000);

	return endsAt.toISOString();
}

/**
 * The moment the schedule and notification examples pretend it is. It is fixed
 * rather than `new Date()`, so the server and the browser write the same words
 * ("2 hours ago", an event dimmed because it is over) and every visit looks alike.
 */
export const SAMPLE_NOW = new Date('2026-11-14T12:00:00.000Z');

/**
 * One day of a conference programme on the same day as `SAMPLE_NOW`, for the
 * schedule calendar and list examples: one event already over, so it is grey,
 * one for a committee that is on now, and one for staff with a description.
 */
export const SAMPLE_SCHEDULE_EVENTS: ScheduleEvent[] = [
	{
		id: 'event-opening',
		conferenceId: SAMPLE_CONFERENCE.id,
		title: 'Opening ceremony',
		description: null,
		location: 'Auditorium',
		startsAt: '2026-11-14T08:30:00.000Z',
		endsAt: '2026-11-14T09:30:00.000Z',
		audience: 'everyone',
		committeeId: null,
		committeeAbbreviation: null
	},
	{
		id: 'event-session',
		conferenceId: SAMPLE_CONFERENCE.id,
		title: 'Committee session II',
		description: null,
		location: 'Room 2.14',
		startsAt: '2026-11-14T11:00:00.000Z',
		endsAt: '2026-11-14T14:30:00.000Z',
		audience: 'committee',
		committeeId: SAMPLE_COMMITTEE.id,
		committeeAbbreviation: 'UNSC'
	},
	{
		id: 'event-briefing',
		conferenceId: SAMPLE_CONFERENCE.id,
		title: "Chairs' briefing",
		description: 'Bring the roll call sheets for tomorrow.',
		location: 'Staff room',
		startsAt: '2026-11-14T16:00:00.000Z',
		endsAt: '2026-11-14T16:30:00.000Z',
		audience: 'staff',
		committeeId: null,
		committeeAbbreviation: null
	}
];

/** Two notifications for the bell and its rows: one unread with a body, one read without. */
export const SAMPLE_NOTIFICATIONS: Notification[] = [
	{
		id: 'notification-accepted',
		kind: 'application_decided',
		title: 'Your application was accepted',
		body: 'You are France in the Security Council.',
		linkPath: null,
		readAt: null,
		createdAt: '2026-11-14T10:00:00.000Z',
		conferenceName: SAMPLE_CONFERENCE.name
	},
	{
		id: 'notification-invite',
		kind: 'invite_received',
		title: 'You were invited to join a delegation',
		body: null,
		linkPath: null,
		readAt: '2026-11-13T09:00:00.000Z',
		createdAt: '2026-11-12T16:00:00.000Z',
		conferenceName: null
	}
];

/** The message the `FlashToast` example shows. */
export const SAMPLE_FLASH: Flash = {
	tone: 'success',
	message: 'All notifications marked as read.'
};

/**
 * The Markdown the editor example starts from: a heading, every mark the
 * toolbar has, both kinds of list and a link, so each one can be seen formatted.
 */
export const SAMPLE_MARKDOWN = [
	'## Opening statements',
	'France spoke **first**, then *Brazil*. The chair asked for ++quiet++ in the room.',
	'- Climate finance\n- Loss and damage',
	'1. Roll call\n2. Set the agenda',
	'Read the [UN Charter](https://www.un.org/en/about-us/un-charter).'
].join('\n\n');
