/**
 * The panel at the top of the signed-in home page: the reader's next
 * conference as a boarding pass, or the invitation to find one, and with it
 * the page's one dark-blue button.
 *
 * `docs/home.md` sections 3.2, 3.3 and 4 are the contract. The hero is
 * `upcomingConferences[0]`, the conference running today or the soonest. Its
 * figures are real values about that conference; its button is, in order, the
 * room on a conference day, the verb of the first pressing task from any
 * conference, or the reader's own door into the conference. The text link
 * beside the button is always the way into the conference when the button is
 * about something else, so nobody is ever locked out.
 *
 * Everything here is a plain calculation on the `HomeDashboard` the server
 * hands the page. Nothing reads the clock, talks to Supabase or knows any
 * Svelte: the moment is handed in, so every part of the page agrees on it and
 * a test can choose it.
 */

import type { ResolvedPathname } from '$app/types';
import type { StripStat } from '$lib/components/manage/StatStrip.svelte';
import { EMPTY_CONFERENCE_QUERY } from '$lib/conferences';
import { countOf } from '$lib/dashboard-words';
import { formatDateRange, formatTimeOfDay } from '$lib/dates';
import type { HomeDashboard, HomeLink } from '$lib/home';
import { dueWord, eventsLeftToday, heroCommitteeIds, type DueWord } from '$lib/home-rows';
import { conferenceDayLabel, type TodayEvent, type TodayItem } from '$lib/home-today';
import type { HomeTask } from '$lib/tasks';
import { ownTodayItem, type UpcomingConferenceCard } from '$lib/upcoming-conferences';
import {
	conferenceListUrl,
	conferenceScheduleUrl,
	conferenceUrl,
	createConferenceUrl,
	newQuickSessionUrl
} from '$lib/urls';

/**
 * One figure in the hero's strip, as `StatStrip` draws it. A seat's figure
 * sets `flagCountryCode`, which `StripStat` already carries, so the flag is
 * drawn before the country's name.
 */
export type HeroFigure = StripStat;

/** The task the hero took as the reader's next step, written into the panel above the button. */
export type HeroNextStep = {
	/** The task's id, so "To do" can leave this one out (`remainingTasks`). */
	taskId: string;
	title: string;
	detail: string | null;
	/** "Overdue", "In 5 days", or `null` for a task with no date. */
	due: DueWord | null;
};

/** The hero when the reader has a conference to come. */
export type ConferenceHero = {
	kind: 'conference';
	conferenceId: string;
	slug: string;
	name: string;
	/** The reader's own door into the conference, which the name links to. */
	href: ResolvedPathname;
	bannerPath: string | null;
	/** The zone the conference's days and times are read in, for the programme under the hero. */
	timezone: string;
	/** "Your next conference", or "Running now · day 2 of 3" with a light-blue dot on a conference day. */
	label: { text: string; isLive: boolean };
	/** "Delegate · 25 – 27 Jul 2027 · Beurs van Berlage, Amsterdam". */
	metaLine: string;
	/** One to three real values about the conference, in the strip's order. */
	figures: HeroFigure[];
	nextStep: HeroNextStep | null;
	/** The page's one button. */
	primary: HomeLink;
	/** The text link beside it, or `null` when the button already leads where it would. */
	secondary: HomeLink | null;
};

/** The hero when the reader has no conference to come. */
export type FindHero = {
	kind: 'find';
	/** "Find your first conference", or "Find your next conference" for a reader who has been to one. */
	title: string;
	/** "6 conferences are open for applications.", or empty when the count was not read. */
	factLine: string;
	primary: HomeLink;
	/** "Run a quick session" beside the button, unless the page offers it elsewhere. */
	secondary: HomeLink | null;
};

export type HomeHero = ConferenceHero | FindHero;

/** The ending of a chair's or a seat's item title while their session runs: "UNSC · Session 1 in progress". */
const IN_PROGRESS_ENDING = ' in progress';

/** The ending of a chair's item title once the session the state points at is over. */
const ENDED_ENDING = ' ended';

/** The ending of an organiser's item detail: "3 of 4 committees in session". */
const COMMITTEES_IN_SESSION_ENDING = ' committees in session';

/** "session 2 ended" as a figure: "Session 2 ended". */
function capitalised(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "Delegate", "Chair of DISEC", "Head of delegation · Rotterdam Grammar
 * Delegation": what the reader is at the conference, for the meta line. The
 * role lives here and nowhere in the figures.
 */
function rolePhrase(card: UpcomingConferenceCard): string {
	if (card.seat !== null) {
		return 'Delegate';
	}

	if (card.chair !== null) {
		return `${card.chair.title} of ${card.chair.committeeHeading}`;
	}

	if (card.delegation !== null) {
		const role = card.delegation.isHead ? 'Head of delegation' : 'Delegation';

		return `${role} · ${card.delegation.name}`;
	}

	if (card.roleKind === 'accepted') {
		return 'Accepted · seat to come';
	}

	return card.roleKind === 'volunteer' ? 'Volunteer' : 'Organiser';
}

/** "Beurs van Berlage, Amsterdam", the city alone, "Online", or nothing when the draft has not said. */
function placePhrase(card: UpcomingConferenceCard): string | null {
	const named = [card.venueName, card.city].filter((part): part is string => part !== null);

	if (named.length > 0) {
		return named.join(', ');
	}

	return card.locationMode === 'online' ? 'Online' : null;
}

/** "Delegate · 25 – 27 Jul 2027 · Beurs van Berlage, Amsterdam", leaving out what is empty. */
function metaLine(card: UpcomingConferenceCard): string {
	const parts = [rolePhrase(card), formatDateRange(card.startDate, card.endDate)];
	const place = placePhrase(card);

	if (place !== null) {
		parts.push(place);
	}

	return parts.join(' · ');
}

/** "8 months" over "to go": the row's "In 8 months" without its "In"; "Tomorrow" stays as it is. */
function countdownFigure(card: UpcomingConferenceCard): HeroFigure {
	return { value: card.when.text.replace(/^In /, ''), label: 'to go' };
}

/**
 * The second figure, by role: the seat with its flag, the papers a chair has to
 * review, the seats a head has filled, the applications an organiser has to
 * decide or how far their draft's setup has got. A delegation member, an
 * accepted applicant and a volunteer have no figure of their own, and neither
 * has a head whose delegation has been given no seats yet: "0 of 0" is not a
 * value.
 */
function roleFigure(card: UpcomingConferenceCard): HeroFigure | null {
	if (card.seat !== null) {
		return {
			value: card.seat.name,
			label: card.seat.committeeHeading,
			flagCountryCode: card.seat.countryCode ?? undefined
		};
	}

	if (card.chair !== null) {
		return { value: String(card.chair.papersWaiting), label: 'papers to review' };
	}

	if (card.delegation !== null && card.delegation.isHead) {
		const { seatCount, emptySeatCount } = card.delegation;

		if (seatCount === 0) {
			return null;
		}

		return { value: `${seatCount - emptySeatCount} of ${seatCount}`, label: 'seats assigned' };
	}

	if (card.organiser !== null) {
		const steps = card.organiser.setupSteps;

		// Only a draft has setup steps; a published conference counts applications.
		if (steps !== null) {
			return { value: `${steps.done} of ${steps.required}`, label: 'setup steps done' };
		}

		return { value: String(card.organiser.applicationsWaiting), label: 'applications waiting' };
	}

	return null;
}

/**
 * The third figure on an ordinary day: a delegate's paper once it is in (a
 * paper still owed is a task, never a figure), or the seats held at a
 * published conference the reader organises, once it has seats on offer.
 */
function thirdFigure(card: UpcomingConferenceCard, dashboard: HomeDashboard): HeroFigure | null {
	if (card.seat?.positionPaper === 'handed_in') {
		return { value: 'Handed in', label: 'position paper' };
	}

	const isPublishedOrganiser = card.organiser !== null && card.organiser.setupSteps === null;

	if (isPublishedOrganiser && dashboard.heroSeats !== null && dashboard.heroSeats.onOffer > 0) {
		const { held, onOffer } = dashboard.heroSeats;

		return { value: `${held} of ${onOffer}`, label: 'seats held' };
	}

	return null;
}

/**
 * The committee's session as the first figure of a conference day, read off
 * the reader's own "Today" item: "In session" over "UNHRC · Session 3" while a
 * session runs, for a seat and a chair alike; "No session yet" or "Session 2
 * ended" over the committee alone for a chair whose room is quiet; "Not in
 * session" over the committee for a seated delegate between sessions.
 *
 * The item's title is "{committee} · {state}", so the state is what comes
 * after the first separator; a seat's item for a committee between sessions
 * says what is next, which is the third figure's job, so it reads "Not in
 * session" here.
 */
function sessionFigure(item: TodayItem, committeeHeading: string): HeroFigure {
	const separatorAt = item.title.indexOf(' · ');
	const state = separatorAt === -1 ? '' : item.title.slice(separatorAt + ' · '.length);

	if (state.endsWith(IN_PROGRESS_ENDING)) {
		const sessionName = state.slice(0, -IN_PROGRESS_ENDING.length);

		return { value: 'In session', label: `${committeeHeading} · ${sessionName}` };
	}

	if (state === 'no session yet') {
		return { value: 'No session yet', label: committeeHeading };
	}

	if (state.endsWith(ENDED_ENDING)) {
		return { value: capitalised(state), label: committeeHeading };
	}

	return { value: 'Not in session', label: committeeHeading };
}

/** "3 of 4" over "committees in session", read off the organiser's "Today" item. */
function committeesFigure(item: TodayItem): HeroFigure | null {
	if (item.detail === null || !item.detail.endsWith(COMMITTEES_IN_SESSION_ENDING)) {
		return null;
	}

	return {
		value: item.detail.slice(0, -COMMITTEES_IN_SESSION_ENDING.length),
		label: 'committees in session'
	};
}

/** The first figure of a conference day, or none for a reader whose item says nothing about a session. */
function liveFigure(card: UpcomingConferenceCard, item: TodayItem | null): HeroFigure | null {
	if (item === null) {
		return null;
	}

	if (card.seat !== null) {
		return sessionFigure(item, card.seat.committeeHeading);
	}

	if (card.chair !== null) {
		return sessionFigure(item, card.chair.committeeHeading);
	}

	return card.organiser !== null ? committeesFigure(item) : null;
}

/** "Next: Lunch · Atrium", or "Next: Lunch" when no room was written. */
function withLocation(text: string, location: string | null): string {
	return location === null ? text : `${text} · ${location}`;
}

/**
 * The third figure of a conference day: the time of the next event on the
 * reader's programme, or, when nothing follows the event in progress, when
 * that one ends. Nothing when the day's programme is over, even though the
 * server has already read tomorrow morning's first event by the evening.
 */
function eventFigure(
	card: UpcomingConferenceCard,
	events: TodayEvent[],
	now: Date
): HeroFigure | null {
	const left = eventsLeftToday(events, card.id, heroCommitteeIds(card), card.timezone, now);
	const next = left.find((event) => new Date(event.startsAt) > now);

	if (next !== undefined) {
		return {
			value: formatTimeOfDay(next.startsAt, card.timezone),
			label: withLocation(`Next: ${next.title}`, next.location)
		};
	}

	// Whatever is left has started and not ended, so the first of it is in progress.
	if (left.length === 0) {
		return null;
	}

	// The value is the end time, so the label names the event and says that the time
	// is its end: writing "until 12:30" beside a "12:30" figure would state one fact
	// twice, which DESIGN.md forbids. Figure 1 already says the reader is in session.
	return {
		value: formatTimeOfDay(left[0].endsAt, card.timezone),
		label: `${left[0].title} ends`
	};
}

/** The figures of a conference day: the session, the role's own, the next event. */
function liveFigures(
	card: UpcomingConferenceCard,
	dashboard: HomeDashboard,
	item: TodayItem | null,
	now: Date
): HeroFigure[] {
	const figures = [
		liveFigure(card, item),
		roleFigure(card),
		eventFigure(card, dashboard.todayEvents, now)
	];

	return figures.filter((figure): figure is HeroFigure => figure !== null);
}

/** The figures of an ordinary day: the countdown, the role's own, the paper or the seats held. */
function ordinaryFigures(card: UpcomingConferenceCard, dashboard: HomeDashboard): HeroFigure[] {
	const figures = [countdownFigure(card), roleFigure(card), thirdFigure(card, dashboard)];

	return figures.filter((figure): figure is HeroFigure => figure !== null);
}

/**
 * Whether a task is pressing enough to take the page's button: due within the
 * week or already overdue, whichever conference it belongs to; undated but
 * with somebody waiting on the reader (applications to decide, papers to
 * review, delegation seats to fill); or the draft of the hero conference
 * itself. The profile task is never pressing: it is only ever a "To do" row.
 *
 * The week is the same one that gives a due word its colour, so a task whose
 * word has a dot is exactly a task that takes the button.
 */
export function isPressing(task: HomeTask, heroConferenceId: string | null, now: Date): boolean {
	if (task.kind === 'profile') {
		return false;
	}

	if (task.deadline !== null) {
		return dueWord(task.deadline, now).hasDot;
	}

	if (
		task.kind === 'review_applications' ||
		task.kind === 'review_papers' ||
		task.kind === 'delegation_seats'
	) {
		return true;
	}

	return (
		task.kind === 'publish' && heroConferenceId !== null && task.conferenceId === heroConferenceId
	);
}

/**
 * The words on the hero conference's door, by what the reader is there:
 * "Open committee page", "Open chair room", "Open dashboard" or "Continue
 * setup" for a draft, "Open delegation", "View conference".
 */
export function doorLabel(card: UpcomingConferenceCard): string {
	if (card.seat !== null) {
		return 'Open committee page';
	}

	if (card.chair !== null) {
		return 'Open chair room';
	}

	if (card.organiser !== null) {
		// Only a draft has setup steps.
		return card.organiser.setupSteps === null ? 'Open dashboard' : 'Continue setup';
	}

	if (card.delegation !== null) {
		return 'Open delegation';
	}

	return 'View conference';
}

/** The task's verb as the button, or `null` for a task with nowhere to go. */
function taskLink(task: HomeTask): HomeLink | null {
	if (task.href === undefined) {
		return null;
	}

	return { label: task.actionLabel, href: task.href };
}

/**
 * The next step the hero takes from a task, with its due word. The publish
 * task's detail counts the setup steps of the hero conference's own draft, which
 * the figure strip two lines above already counts, so there it is left out
 * rather than said twice.
 */
function toNextStep(task: HomeTask, heroConferenceId: string, now: Date): HeroNextStep {
	const isHeroDraft = task.kind === 'publish' && task.conferenceId === heroConferenceId;

	return {
		taskId: task.id,
		title: task.title,
		detail: isHeroDraft ? null : task.detail,
		due: task.deadline === null ? null : dueWord(task.deadline, now)
	};
}

/** The link to the hero conference's programme for the day, beside the button on a conference day. */
function todaysProgrammeLink(card: UpcomingConferenceCard): HomeLink {
	return { label: "Today's programme", href: conferenceScheduleUrl(card.slug) };
}

/**
 * The button, the link beside it and the next step, by the first rule that
 * applies: the room on a conference day, the first pressing task, or the door.
 */
function heroActions(
	card: UpcomingConferenceCard,
	tasks: HomeTask[],
	now: Date
): Pick<ConferenceHero, 'nextStep' | 'primary' | 'secondary'> {
	// Rule 1: the room outranks everything on a conference day. A volunteer's or
	// a delegation member's item leads to the schedule or the delegation, which
	// the door and the link beside it already do, so they fall through.
	const hasRoom = card.seat !== null || card.chair !== null || card.organiser !== null;

	if (card.isLive && card.liveButton !== null && hasRoom) {
		return { nextStep: null, primary: card.liveButton, secondary: todaysProgrammeLink(card) };
	}

	const door: HomeLink = { label: doorLabel(card), href: card.href };

	// Rule 2: the first pressing task, from any conference. A task with nowhere
	// to go cannot be a button, so it is passed over.
	for (const task of tasks) {
		const link = taskLink(task);

		if (link === null || !isPressing(task, card.id, now)) {
			continue;
		}

		// The door beside a button that already opens the same page, as a draft's
		// "Continue setup" would beside "Publish", says nothing new, so it goes.
		return {
			nextStep: toNextStep(task, card.id, now),
			primary: link,
			secondary: door.href === link.href ? null : door
		};
	}

	// Rule 3: the door itself. Beside it goes today's programme on a conference
	// day (a volunteer or a delegation member, who has no room, reaches the day's
	// schedule in one press this way) and otherwise the conference's public page.
	// For a volunteer or an accepted applicant on an ordinary day the door is that
	// page, so there is nothing to put beside it.
	const beside: HomeLink = card.isLive
		? todaysProgrammeLink(card)
		: {
				label: card.organiser !== null ? 'Public page' : 'Conference page',
				href: conferenceUrl(card.slug)
			};

	return {
		nextStep: null,
		primary: door,
		secondary: beside.href === door.href ? null : beside
	};
}

/** The hero for the reader's next conference. */
function conferenceHero(
	card: UpcomingConferenceCard,
	dashboard: HomeDashboard,
	now: Date
): ConferenceHero {
	// The item of the card's own role at this conference, whose title the first
	// figure reads: the same item whose first link is the card's live button, so
	// a chair who also organises reads their committee's session, not the
	// conference's room count.
	const item = card.isLive ? ownTodayItem(card, card.id, dashboard.todayItems) : null;

	return {
		kind: 'conference',
		conferenceId: card.id,
		slug: card.slug,
		name: card.name,
		href: card.href,
		bannerPath: card.bannerPath,
		timezone: card.timezone,
		label: card.isLive
			? { text: `Running now · ${conferenceDayLabel(card, now)}`, isLive: true }
			: { text: 'Your next conference', isLive: false },
		metaLine: metaLine(card),
		figures: card.isLive
			? liveFigures(card, dashboard, item, now)
			: ordinaryFigures(card, dashboard),
		...heroActions(card, dashboard.tasks, now)
	};
}

/**
 * "6 conferences are open for applications.", "1 conference is open for
 * applications.", "No conference is open for applications right now.", or
 * nothing when the count was not read.
 */
function openConferenceLine(count: number | null): string {
	if (count === null) {
		return '';
	}

	if (count === 0) {
		return 'No conference is open for applications right now.';
	}

	return `${countOf(count, 'conference is', 'conferences are')} open for applications.`;
}

/**
 * The hero for a reader with no conference to come. "First" for somebody who
 * has never taken part in a conference in any way; "next" for somebody who
 * has applied, organises or chairs, whose conferences are over or whose
 * applications were refused.
 */
function findHero(dashboard: HomeDashboard): FindHero {
	// `hasTakenPart` is the server's reading of every seat, role, delegation and
	// application the reader ever had, past ones included. The two checks beside
	// it are what this page can see for itself, so a dashboard that lists an
	// application or a chair can never say "first" whatever the server decided.
	const hasHeldARole = dashboard.hasManagedConferences || dashboard.chairsSomething;
	const isFirst = !dashboard.hasTakenPart && dashboard.myApplications.length === 0 && !hasHeldARole;

	// A quick session is the other thing a reader with nothing to come can do
	// right now, so it is the text link beside the button: three presses from
	// here to a running session, the budget `tests/e2e/quick-session.spec.ts`
	// keeps. It is left out when the page already offers it, at the right of
	// the greeting for a chair or in the "Quick sessions" section.
	const offersQuickSessionElsewhere =
		dashboard.chairsSomething || dashboard.quickSessions.length > 0;

	return {
		kind: 'find',
		title: isFirst ? 'Find your first conference' : 'Find your next conference',
		factLine: openConferenceLine(dashboard.openConferenceCount),
		primary: {
			label: 'Find a conference',
			href: conferenceListUrl({ ...EMPTY_CONFERENCE_QUERY, openOnly: true })
		},
		secondary: offersQuickSessionElsewhere ? null : runAQuickSession()
	};
}

/**
 * The hero of the page: the reader's next conference when they have one, the
 * invitation to find one otherwise. Either way it holds the page's one button.
 */
export function homeHero(dashboard: HomeDashboard, now: Date): HomeHero {
	if (dashboard.upcomingConferences.length === 0) {
		return findHero(dashboard);
	}

	return conferenceHero(dashboard.upcomingConferences[0], dashboard, now);
}

/**
 * The "To do" rows: every task but the one the hero took as its next step,
 * which is written into the panel and would only be said twice as a row.
 */
export function remainingTasks(tasks: HomeTask[], hero: HomeHero): HomeTask[] {
	if (hero.kind === 'find' || hero.nextStep === null) {
		return tasks;
	}

	const takenId = hero.nextStep.taskId;

	return tasks.filter((task) => task.id !== takenId);
}

/** The link to a new quick session, worded the same wherever the page offers it. */
function runAQuickSession(): HomeLink {
	return { label: 'Run a quick session', href: newQuickSessionUrl() };
}

/**
 * The one text link at the right of the greeting, or none: nothing when the
 * "Quick sessions" section is on the page, since its own "New quick session"
 * is the way to one; "Run a quick session" for a chair; "Create a conference"
 * for somebody who manages nothing; nothing for an organiser, whose Manage
 * tab is theirs already.
 */
export function titleRowLink(dashboard: HomeDashboard): HomeLink | null {
	if (dashboard.quickSessions.length > 0) {
		return null;
	}

	if (dashboard.chairsSomething) {
		return runAQuickSession();
	}

	if (!dashboard.hasManagedConferences) {
		return { label: 'Create a conference', href: createConferenceUrl() };
	}

	return null;
}
