/**
 * The committee room and the conference day drawn on the organisers' page.
 *
 * The room is the landing page's: the Human Rights Council, Kenya holding the
 * floor, five countries waiting (`$lib/landing-room.ts`). The organisers' page
 * draws it three times, on the chair's console, the projector and a delegate's
 * phone, and all three must agree, so everything they show is worked out once
 * here. The clock stands still at 0:23 of 1:30: nothing on this page moves.
 *
 * The second half is the secretariat's dashboard on the same morning.
 *
 * It is a picture of the product rather than the product, so nothing here
 * reaches the database. Nothing here talks to Supabase or to Svelte.
 */

import { formatClock, formatDuration } from '$lib/committee-room';
import { countryName } from '$lib/countries';
import {
	ROOM_SPEAKING_TIME_SECONDS,
	clockPercent,
	floorCountryCode,
	waitingCountryCodes,
	type LandingRoom
} from '$lib/landing-room';

export { ROOM_COMMITTEE_NAME, ROOM_TOPIC } from '$lib/landing-room';

/** Where the room stands in every picture: the first country speaking, 23 seconds left. */
const STILL_ROOM: LandingRoom = { floorIndex: 0, secondsLeft: 23 };

/** The session the committee is in, beside the topic. */
export const ROOM_SESSION = 'Session 3';

/** The roll call's pill on the console: who answered, and that it is enough. */
export const ROOM_ROLL_CALL = 'Present 27 of 29 · Quorum met';

/** The console's views, left to right. The first, the general speakers' list, is open. */
export const ROOM_VIEWS: string[] = ['GSL', 'Motions', 'Mod', 'Unmod', 'Single speaker', 'Vote'];

/** The console's buttons under the clock; "Next speaker" sits under them, in dark blue. */
export const ROOM_CLOCK_BUTTONS: string[] = ['Pause', 'Add 15 s', 'End speech'];

/** The code of the country with the floor: Kenya. */
export const ROOM_FLOOR_CODE = floorCountryCode(STILL_ROOM);

/** The name of the country with the floor, in the serif on every screen. */
export const ROOM_FLOOR_NAME = countryName(ROOM_FLOOR_CODE);

/** The countries waiting, in speaking order: Brazil, Japan, Norway, India, Chile. */
export const ROOM_WAITING_CODES = waitingCountryCodes(STILL_ROOM);

/** The clock face: "0:23". */
export const ROOM_CLOCK = formatClock(STILL_ROOM.secondsLeft);

/** The speaking time each country has: "1:30". */
export const ROOM_SPEAKING_TIME = formatDuration(ROOM_SPEAKING_TIME_SECONDS);

/** How much of the bar under the clock is still blue, 0 to 100. */
export const ROOM_CLOCK_PERCENT = clockPercent(STILL_ROOM);

/** The projector's last line: the next three speakers. */
export const ROOM_NEXT_LINE = `Next: ${ROOM_WAITING_CODES.slice(0, 3)
	.map((code) => countryName(code))
	.join(', ')}`;

/** The delegate whose phone is drawn: Japan, second in line. */
export const ROOM_DELEGATE_CODE = 'JP';

/**
 * The line on the delegate's phone saying when they speak: second in line,
 * after Kenya's 23 seconds and Brazil's 1:30, which rounds to about 2 minutes.
 */
export const ROOM_DELEGATE_QUEUE_LINE = 'You are 2nd · about 2 min';

/** How many waiting countries the delegate's phone lists. */
export const ROOM_PHONE_ROWS = 3;

/** One committee's row on the conference-day dashboard. */
export type DashboardRoom = {
	/** The committee's short name, drawn as a small blue rectangle. */
	committee: string;
	/** "Session 3", or "Not in session" for a committee that has not started. */
	session: string;
	/** Delegates present of the seats, or "–" for a committee not in session. */
	present: string;
	isInSession: boolean;
};

/** The dashboard's headline, after its light blue dot. */
export const DASHBOARD_HEADLINE = '6 of 8 committees in session';

/** What the conference is doing now, and what comes next. */
export const DASHBOARD_NOW = 'Committee session III, until 12:30';
export const DASHBOARD_NEXT = 'Next: Lunch in Front hall at 12:30';

/** The first four rooms on the dashboard. */
export const DASHBOARD_ROOMS: DashboardRoom[] = [
	{ committee: 'UNSC', session: 'Session 3', present: '15 of 15', isInSession: true },
	{ committee: 'UNHRC', session: 'Session 3', present: '27 of 29', isInSession: true },
	{ committee: 'DISEC', session: 'Session 3', present: '36 of 38', isInSession: true },
	{ committee: 'ECOSOC', session: 'Not in session', present: '–', isInSession: false }
];

/** The line under the four rooms, for the rest of the eight. */
export const DASHBOARD_MORE_ROOMS = '4 more rooms';

/** The roll call across the whole conference, in the grey band under the rooms. */
export const DASHBOARD_PRESENT_LINE = 'Present: 187 of 204 delegates in 6 rooms · As of 10:42';

/** The one thing that needs the secretariat this morning. */
export const DASHBOARD_ATTENTION = {
	title: 'Zoe Adams is marked absent',
	detail: 'UNHRC · Nigeria · since roll call at 09:12'
};
