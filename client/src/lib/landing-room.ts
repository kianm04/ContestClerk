/**
 * The committee room drawn on the landing page: a speakers' list with one
 * country holding the floor and a clock counting its time down.
 *
 * It is a picture of the product rather than the product, so nothing here
 * reaches the database. The clock does run, though: `LandingRoomPicture.svelte`
 * calls `tickRoom` once a second, and when a speaker's time is up the floor
 * passes to the next country on the list, round and round. The clock face and
 * its colours come from `$lib/committee-room.ts`, so the picture reads exactly
 * like the chair's own console.
 *
 * Nothing here talks to Supabase or to Svelte.
 */

export const ROOM_COMMITTEE_NAME = 'Human Rights Council';
export const ROOM_TOPIC = 'The right to education in emergencies';

/** How long each speaker has, in seconds: "1:30 each". */
export const ROOM_SPEAKING_TIME_SECONDS = 90;

/**
 * The countries on the speakers' list, as ISO codes, in speaking order.
 * `countryName` in `$lib/countries.ts` turns a code into its name and
 * `Flag.svelte` into its flag.
 */
export const ROOM_SPEAKER_CODES: string[] = ['KE', 'BR', 'JP', 'NO', 'IN', 'CL'];

/** Where the room has got to: who has the floor and how long they have left. */
export type LandingRoom = {
	/** The place in `ROOM_SPEAKER_CODES` of the country speaking. */
	floorIndex: number;
	secondsLeft: number;
};

/**
 * The room as the page first draws it: the first country speaking, part way
 * through its time. Starting mid-speech rather than at 1:30 means a visitor
 * sees the last ten seconds turn amber and the floor pass to the next country
 * within half a minute of looking.
 */
export const OPENING_ROOM: LandingRoom = { floorIndex: 0, secondsLeft: 24 };

/**
 * The room one second later. The clock counts down to 0:00; the tick after
 * that passes the floor to the next country with a full speaking time, and
 * after the last country comes the first again.
 */
export function tickRoom(room: LandingRoom): LandingRoom {
	if (room.secondsLeft <= 0) {
		return {
			floorIndex: (room.floorIndex + 1) % ROOM_SPEAKER_CODES.length,
			secondsLeft: ROOM_SPEAKING_TIME_SECONDS
		};
	}

	return { ...room, secondsLeft: room.secondsLeft - 1 };
}

/** The code of the country with the floor. */
export function floorCountryCode(room: LandingRoom): string {
	return ROOM_SPEAKER_CODES[room.floorIndex % ROOM_SPEAKER_CODES.length];
}

/**
 * The countries waiting to speak, in order, starting with the one after the
 * floor and wrapping round to the start of the list.
 */
export function waitingCountryCodes(room: LandingRoom): string[] {
	const count = ROOM_SPEAKER_CODES.length;

	return ROOM_SPEAKER_CODES.map(
		(_code, offset) => ROOM_SPEAKER_CODES[(room.floorIndex + 1 + offset) % count]
	).slice(0, count - 1);
}

/** How much of the speaking time is left, 0 to 100, for the bar under the clock. */
export function clockPercent(room: LandingRoom): number {
	const fraction = Math.max(0, room.secondsLeft) / ROOM_SPEAKING_TIME_SECONDS;

	return Math.round(Math.min(1, fraction) * 100);
}
