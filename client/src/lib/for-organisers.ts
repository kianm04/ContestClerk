/**
 * The words on the "For organisers" page, after the design canvas built from
 * `docs/for-organisers-handoff.md`.
 *
 * The page follows a conference through its year, one section per moment, and
 * each section is the same shape as the landing page's: small capitals, a
 * title in the serif, one sentence, and rows of an icon, a title and a line of
 * detail. The words live here so the page itself only composes sections, and
 * so `for-organisers.test.ts` can check them without drawing anything. The
 * drawn pictures keep their own sample data in `$lib/organiser-*.ts`.
 *
 * The rows reuse the landing page's shapes (`LandingSectionWords`,
 * `LandingRow`) because they are drawn by the landing page's own components.
 */
import Bullhorn from 'carbon-icons-svelte/lib/Bullhorn.svelte';
import Calendar from 'carbon-icons-svelte/lib/Calendar.svelte';
import Catalog from 'carbon-icons-svelte/lib/Catalog.svelte';
import Chat from 'carbon-icons-svelte/lib/Chat.svelte';
import CheckboxChecked from 'carbon-icons-svelte/lib/CheckboxChecked.svelte';
import Copy from 'carbon-icons-svelte/lib/Copy.svelte';
import Document from 'carbon-icons-svelte/lib/Document.svelte';
import Download from 'carbon-icons-svelte/lib/Download.svelte';
import EventSchedule from 'carbon-icons-svelte/lib/EventSchedule.svelte';
import Finance from 'carbon-icons-svelte/lib/Finance.svelte';
import Identification from 'carbon-icons-svelte/lib/Identification.svelte';
import Keyboard from 'carbon-icons-svelte/lib/Keyboard.svelte';
import ListChecked from 'carbon-icons-svelte/lib/ListChecked.svelte';
import ListNumbered from 'carbon-icons-svelte/lib/ListNumbered.svelte';
import Microphone from 'carbon-icons-svelte/lib/Microphone.svelte';
import Money from 'carbon-icons-svelte/lib/Money.svelte';
import Purchase from 'carbon-icons-svelte/lib/Purchase.svelte';
import RecentlyViewed from 'carbon-icons-svelte/lib/RecentlyViewed.svelte';
import Receipt from 'carbon-icons-svelte/lib/Receipt.svelte';
import Scales from 'carbon-icons-svelte/lib/Scales.svelte';
import Table from 'carbon-icons-svelte/lib/Table.svelte';
import Time from 'carbon-icons-svelte/lib/Time.svelte';
import Trophy from 'carbon-icons-svelte/lib/Trophy.svelte';
import UserFollow from 'carbon-icons-svelte/lib/UserFollow.svelte';
import UserMultiple from 'carbon-icons-svelte/lib/UserMultiple.svelte';
import type { LandingRow, LandingSectionWords, LandingStep } from '$lib/landing';

/** The ledger of the seven jobs, under the hero. */
export const REPLACES_WORDS: LandingSectionWords = {
	eyebrow: 'What it replaces',
	title: 'Seven jobs, usually seven tools.',
	lead: 'Most secretariats stitch a conference together from forms, spreadsheets, inboxes and a group chat. Here is where each of those jobs lives on MUNMeet.'
};

/** Setting a draft up, before applications open. */
export const SETUP_WORDS: LandingSectionWords = {
	eyebrow: 'Before you open',
	title: 'Set it up once. Publish when you are ready.',
	lead: 'Five steps take a draft from a name to a public page with an application form. Nothing is public until you publish.'
};

export const SETUP_ROWS: LandingRow[] = [
	{
		icon: Catalog,
		title: 'Committees from a catalogue',
		detail:
			'Around forty committees with descriptions, and seat lists for every UN member state, the Security Council and the EU. Or paste your own.'
	},
	{
		icon: ListChecked,
		title: 'Your own application form',
		detail:
			'Up to twenty questions of five kinds, on top of the profile every applicant already has.'
	},
	{
		icon: UserMultiple,
		title: 'Individuals, delegations or both',
		detail:
			'Choose who may apply, how many committee preferences to ask for, and whether a position paper is required.'
	},
	{
		icon: Time,
		title: 'Open on your terms',
		detail:
			'Open applications when you publish, on a date, or by hand. Close them on a date, or a set time before the first day.'
	}
];

/** Reading and deciding applications. */
export const APPLICATIONS_WORDS: LandingSectionWords = {
	eyebrow: 'While applications are open',
	title: 'Every application in one table.',
	lead: "Each application arrives with the answers to your questions beside the details from the applicant's profile. Schools' requests for seats have a list of their own."
};

export const APPLICATIONS_ROWS: LandingRow[] = [
	{
		icon: Table,
		title: 'A table or a board',
		detail:
			'Sort and filter a table, or drag applications between Under review, Accepted, Waitlisted and Not accepted.'
	},
	{
		icon: CheckboxChecked,
		title: 'One at a time, or a page at a time',
		detail: 'Read in a side panel and move to the next, or tick a page and decide it together.'
	},
	{
		icon: Chat,
		title: 'Two notes on every decision',
		detail: 'One the applicant reads, one that stays inside the secretariat.'
	},
	{
		icon: Identification,
		title: 'Details you do not have to ask for',
		detail:
			"Date of birth, dietary requirements and an emergency contact come from the applicant's profile."
	}
];

/** Giving seats, over the seat grid. */
export const ALLOCATION_WORDS: LandingSectionWords = {
	eyebrow: 'Once decisions are made',
	title: 'The matrix, without the spreadsheet.',
	lead: 'Every seat in every committee on one grid. Accepting an applicant puts them in a seat and writes their invoice in the same step.'
};

/** The three facts in a strip under the seat grid. They have no icon. */
export const ALLOCATION_FACTS: LandingStep[] = [
	{
		title: 'Reserved for a school',
		detail:
			'Drag a delegation onto seats to hold them. Its head of delegation assigns the students.'
	},
	{
		title: 'Move and swap',
		detail:
			'Drag one delegate onto another to swap them. The application, the invoice and the position paper go with the person.'
	},
	{
		title: 'Seat lists ready-made',
		detail:
			"Every UN member state, the Security Council's fifteen or the EU's twenty-seven in one press. Or paste up to 300 names."
	}
];

/** What a school does, in order; the page numbers them by their place here. */
export const SCHOOL_STEPS: LandingStep[] = [
	{
		title: 'Registers a delegation',
		detail: 'One head of delegation asks for a number of seats.'
	},
	{
		title: 'Shares a join code',
		detail: 'Students join the delegation with their own accounts.'
	},
	{
		title: 'Assigns its seats',
		detail: 'Until the first day, the head of delegation decides who sits where.'
	}
];

/** Fees, invoices and card payments. */
export const FEES_WORDS: LandingSectionWords = {
	eyebrow: 'As seats are given',
	title: 'An invoice for every seat, paid by card.',
	lead: 'Set your fees once and connect Stripe once. Each seat given writes an invoice, the delegate pays it by card, and it marks itself paid.'
};

export const FEES_ROWS: LandingRow[] = [
	{
		icon: Calendar,
		title: 'Early, standard and late',
		detail:
			'Give each fee its own dates. The one in force when the seat is given is the one on the invoice.'
	},
	{
		icon: Purchase,
		title: 'Paid by card',
		detail:
			'Delegates pay their invoice by card and it marks itself paid. Stripe pays the money out to your organisation.'
	},
	{
		icon: Receipt,
		title: 'One invoice for a school',
		detail: 'A delegation is invoiced for its seats together, so a school pays once.'
	},
	{
		icon: Finance,
		title: 'Or collected by you',
		detail:
			'Prefer bank transfers? Delegates read your payment instructions on the invoice, and you mark it paid.'
	},
	{
		icon: Money,
		title: 'Refunds, waivers and the totals',
		detail:
			'Refund a card payment, waive an invoice or cancel it in one press. Invoiced, paid and outstanding at a glance, and a CSV for the treasurer.'
	}
];

/** The programme, position papers and announcements. */
export const BEFORE_WORDS: LandingSectionWords = {
	eyebrow: 'The weeks before',
	title: 'Everyone knows where to be and what to read.',
	lead: 'Publish the programme, collect the position papers and say what has changed, each to the people it concerns.'
};

export const BEFORE_ROWS: LandingRow[] = [
	{
		icon: EventSchedule,
		title: 'The programme',
		detail:
			'Add events one by one, or a session for every committee at once. Delegates see their own day; visitors see what you make public.'
	},
	{
		icon: Document,
		title: 'Position papers',
		detail:
			'Delegates upload a PDF or write in MUNMeet, together with their delegation. Chairs approve a paper or ask for changes.'
	},
	{
		icon: Bullhorn,
		title: 'Announcements',
		detail:
			'To everyone, delegates, staff, one committee or one delegation, in MUNMeet and by email. Check who it reaches before you post it.'
	},
	{
		icon: UserFollow,
		title: 'Chairs and volunteers',
		detail:
			'Invite each chair to their committee by email. Chairs open their own rooms and see nothing of applications or fees.'
	}
];

/** The committee room, on the conference days. */
export const DAYS_WORDS: LandingSectionWords = {
	eyebrow: 'On the days',
	title: 'One room on every screen.',
	lead: "The chair's console, the projector and every delegate's phone show the same speakers' list and the same clock. The delegates in the room are the ones you seated."
};

export const DAYS_ROWS: LandingRow[] = [
	{
		icon: ListChecked,
		title: 'Roll call and quorum',
		detail:
			'Absent, present, or present and voting, seat by seat or all at once. Quorum is counted for you.'
	},
	{
		icon: Microphone,
		title: "Speakers' list and caucuses",
		detail:
			"A general speakers' list, moderated and unmoderated caucuses and single speakers, each with its own clock."
	},
	{
		icon: ListNumbered,
		title: 'Motions in order',
		detail:
			'Motions on the floor sort themselves, most disruptive first. Pass one and the room follows: the caucus starts, the meeting is suspended.'
	},
	{
		icon: Scales,
		title: 'Votes that add up',
		detail:
			'Count hands or call the roll, by simple or two-thirds majority. Abstentions are left out and a tie fails.'
	},
	{
		icon: Keyboard,
		title: 'More than one chair',
		detail:
			'Co-chairs work from their own laptops, and the keyboard does the common things: Space for the clock, N for the next speaker.'
	},
	{
		icon: RecentlyViewed,
		title: 'A record of every session',
		detail:
			'2 h 14 min, 23 speeches, 4 motions, 3 passed, 1 vote. Kept with every roll call and every result.'
	}
];

/** Awards, exports and next year's edition. */
export const AFTERWARDS_WORDS: LandingSectionWords = {
	eyebrow: 'Afterwards',
	title: 'Close this conference. Start the next one from it.',
	lead: 'Student secretariats change every year. The conference they built does not have to be rebuilt.'
};

export const AFTERWARDS_ROWS: LandingRow[] = [
	{
		icon: Trophy,
		title: 'Awards',
		detail:
			"Chairs propose, the secretariat confirms, and you publish at the moment the closing ceremony reaches them. Each award appears on the delegate's profile."
	},
	{
		icon: Download,
		title: 'Everything exports',
		detail: 'Applications, participants and invoices as CSV, whenever you want them.'
	},
	{
		icon: Copy,
		title: "Next year's edition",
		detail:
			"A new edition takes this one's committees, application form and fees, and moves the dates to the same days of the week a year on."
	}
];

/** Who sees what. The roles themselves are in `AccessList`. */
export const ACCESS_WORDS: LandingSectionWords = {
	eyebrow: 'Access',
	title: 'Everyone sees what their job needs.'
};
