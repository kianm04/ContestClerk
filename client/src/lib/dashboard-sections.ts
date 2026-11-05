/**
 * Which sections the conference dashboard draws below "Needs you" in each
 * phase, with every word in them already written
 * (`specs/05-pages/organiser/dashboard.md`, "Layout").
 *
 * The answer is a "tagged union": an object whose `phase` says which other
 * fields it has. A page that checks `sections.phase === 'allocation'` can then
 * use `sections.preparation` and nothing that belongs to another phase.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { ManagedCommittee } from '$lib/committees';
import type { ConferencePhase } from '$lib/conference-phase';
import type { Conference } from '$lib/conferences';
import { committeeRows, type CommitteeRow } from '$lib/dashboard-committees';
import { livePanel, type LivePanel } from '$lib/dashboard-live';
import { preparationItems, type PreparationItem } from '$lib/dashboard-preparation';
import {
	liveRoomRows,
	roomsTotal,
	roomsTotalSentence,
	type DashboardRoom,
	type LiveRoomRow
} from '$lib/dashboard-rooms';
import { todayRows, type TodayRow, type TodayScheduleEvent } from '$lib/dashboard-today';
import { waitingRows, type WaitingFacts, type WaitingRow } from '$lib/dashboard-waiting';
import type { RecentApplication } from '$lib/manage';

/** While applications are taken: "Waiting for a decision" beside "Committees". */
export type ApplicationsSections = {
	phase: 'applications';
	/**
	 * "Waiting for a decision": the newest applications, newest first. `null`
	 * for a reader who may not open the applications, and so `null` for each
	 * section below whose page the reader may not open (`$lib/dashboard-access.ts`).
	 */
	waiting: WaitingRow[] | null;
	committees: CommitteeRow[] | null;
};

/** While seats are given: "Committees" beside "Before the first day". */
export type AllocationSections = {
	phase: 'allocation';
	committees: CommitteeRow[] | null;
	/** Whether the conference asks for position papers, so the table has a Papers column. */
	hasPapers: boolean;
	/** "Before the first day". */
	preparation: PreparationItem[];
};

/** On a conference day: the live panel, "Rooms", and "Today" beside "Needs you". */
export type ConferenceDaySections = {
	phase: 'conference-days';
	panel: LivePanel;
	rooms: LiveRoomRow[];
	/** "Present: 78 of 84 delegates in 2 rooms · As of 13:02". */
	roomsTotal: string;
	today: TodayRow[] | null;
	/** Whether the panel offers "Post an announcement". */
	mayPostAnnouncement: boolean;
};

/** The sections of each phase. Setup and After draw none beyond "Needs you". */
export type DashboardSections =
	ApplicationsSections | AllocationSections | ConferenceDaySections | { phase: 'setup' | 'after' };

/** What the sections are written from. `load` reads all of it in one go. */
export type SectionFacts = {
	conference: Pick<Conference, 'slug' | 'timezone' | 'positionPaperRequired'>;
	/** The moment the page was read, which is also the rooms' "As of". */
	now: Date;
	committees: ManagedCommittee[];
	recentApplications: RecentApplication[];
	waiting: WaitingFacts;
	isProgrammePublic: boolean;
	rooms: DashboardRoom[];
	/** Today's events, soonest first. */
	todayEvents: TodayScheduleEvent[];
};

/** The sections of a conference day: the live panel, the rooms and today's programme. */
function conferenceDaySections(facts: SectionFacts): ConferenceDaySections {
	const { conference, now, rooms, todayEvents } = facts;
	const timezone = conference.timezone;

	return {
		phase: 'conference-days',
		panel: livePanel(rooms, todayEvents, now, timezone),
		rooms: liveRoomRows(rooms, facts.committees, timezone),
		roomsTotal: roomsTotalSentence(roomsTotal(rooms), now.toISOString(), timezone),
		today: todayRows(todayEvents, now, timezone),
		mayPostAnnouncement: true
	};
}

/** The sections the dashboard draws for `phase`, written from `facts`. */
export function dashboardSections(phase: ConferencePhase, facts: SectionFacts): DashboardSections {
	const { conference, now, committees } = facts;

	if (phase === 'applications') {
		return {
			phase,
			waiting: waitingRows(
				facts.recentApplications,
				facts.waiting,
				committees,
				now,
				conference.timezone
			),
			committees: committeeRows(committees, conference.positionPaperRequired)
		};
	}

	if (phase === 'allocation') {
		return {
			phase,
			committees: committeeRows(committees, conference.positionPaperRequired),
			hasPapers: conference.positionPaperRequired,
			preparation: preparationItems(committees, facts.isProgrammePublic, conference.slug)
		};
	}

	if (phase === 'conference-days') {
		return conferenceDaySections(facts);
	}

	return { phase };
}
