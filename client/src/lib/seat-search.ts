/**
 * Finding seats in the console's combobox, `SeatCombobox`, which serves four
 * boxes: the GSL's add box and the queue boxes of Unmod and Single speaker,
 * the Mod view's "Recognise a delegation…", the Motions composer's "Raised
 * by" and the Single speaker form's "Who" (`specs/05-pages/chair/gsl.md`,
 * "Queue column"; `motions.md`; `mod.md`; `single-speaker.md`).
 *
 * The combobox draws the options and calls back when one is chosen. This file
 * decides which seats match what was typed, in what order, what each option
 * says after its name, and which options can be chosen, so the component
 * holds no rules of its own.
 */

import type { AttendanceStatus, RoomSeat, SpeakerStatus } from '$lib/committee-room';
import { CHAIR_PROPOSER } from '$lib/motions';

/** One entry of the list a box adds to, with only what the marks need. */
export type ListedEntry = {
	status: SpeakerStatus;
	/** The seat it is for, or null for a speaker who holds no seat (a typed name). */
	seat: { id: string } | null;
};

/** What the add box needs to know about the list it adds to. */
export type QueueBoxFacts = {
	/** Every entry of that list, whatever its status. */
	entries: ListedEntry[];
	/** The latest roll call of the session, keyed by seat id; empty before the first. */
	attendance: Record<string, AttendanceStatus>;
	/**
	 * Whether choosing a seat gives it the floor at once rather than queueing
	 * it: the Mod view's box while nobody has the floor.
	 */
	givesTheFloor?: boolean;
};

/** One line of the combobox's list. */
export type SeatOption = {
	/** A seat, "The chair" (in "Raised by") or a typed name (in "Who"). */
	kind: 'seat' | 'chair' | 'name';
	/** The seat, for a seat's option; null for the other two kinds. */
	seat: RoomSeat | null;
	/** The words of the option: "France", "The chair" or "Use “Secretary-General”". */
	label: string;
	/** What choosing it sends: the seat's id, `chair`, or the typed name. */
	value: string;
	/** The words after the label, such as "in list" or "absent · Mark present", or null. */
	mark: string | null;
	/** Whether Enter or a click may choose it. The others are listed but passed over. */
	isChoosable: boolean;
	/** Whether choosing it also marks the seat present at the roll call ("absent · Mark present"). */
	marksPresent: boolean;
};

/** The words an option may carry after its label. */
export const SEAT_MARKS = {
	speaking: 'speaking',
	inList: 'in list',
	absentMarkPresent: 'absent · Mark present',
	absent: 'absent',
	getsTheFloor: 'gets the floor',
	typedName: 'a name, not a seat'
} as const;

/** The words of "Raised by"'s first option, for a motion the chair raised. */
const CHAIR_LABEL = 'The chair';

/**
 * Text in lower case and without accents, so "cote" finds "Côte d'Ivoire".
 * `normalize('NFD')` splits "ô" into "o" and a separate accent mark, and the
 * pattern then removes every such mark.
 */
function foldText(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{Mark}/gu, '')
		.toLowerCase();
}

/** The words of a name: "Guinea-Bissau" is "guinea" and "bissau", "Côte d'Ivoire" "cote", "d" and "ivoire". */
function nameWords(name: string): string[] {
	const words = foldText(name).split(/[^\p{Letter}\p{Number}]+/u);

	return words.filter((word) => word !== '');
}

/**
 * Whether a seat matches what the chair typed: its name, or any word of it,
 * starts with the text ("united" finds the United Kingdom, "kingdom" too), its
 * country code is the text ("gb"), or its delegate's name contains it.
 * Capitals and accents do not matter, and an empty box matches every seat.
 */
export function seatMatches(seat: RoomSeat, query: string): boolean {
	const wanted = foldText(query.trim());

	if (wanted === '') return true;
	if (foldText(seat.name).startsWith(wanted)) return true;
	if (nameWords(seat.name).some((word) => word.startsWith(wanted))) return true;
	if (seat.countryCode !== null && seat.countryCode.toLowerCase() === wanted) return true;

	return foldText(seat.delegateName ?? '').includes(wanted);
}

/** The seats that match what was typed, in alphabetical order. Returns a new array. */
export function searchSeats(seats: RoomSeat[], query: string): RoomSeat[] {
	const matching = seats.filter((seat) => seatMatches(seat, query));

	// `sort` changes the array it is given; `filter` above already made a copy.
	return matching.sort((first, second) => first.name.localeCompare(second.name, 'en'));
}

/** A seat's option with no mark, which may be chosen. */
function plainSeatOption(seat: RoomSeat): SeatOption {
	return {
		kind: 'seat',
		seat,
		label: seat.name,
		value: seat.id,
		mark: null,
		isChoosable: true,
		marksPresent: false
	};
}

/** The ids of the seats whose entry on the list has `status`. */
function seatIdsWithStatus(entries: ListedEntry[], status: SpeakerStatus): string[] {
	const seatIds: string[] = [];

	for (const entry of entries) {
		if (entry.status === status && entry.seat !== null) seatIds.push(entry.seat.id);
	}

	return seatIds;
}

/**
 * The options of a list's add box, for what was typed. The seat that has the
 * floor reads "speaking" and a seat already waiting "in list"; neither can be
 * chosen. A seat marked absent reads "absent · Mark present", and choosing it
 * marks it present and adds it in one press, for a late delegate who wants to
 * speak. In the Mod view with nobody on the floor, every other seat reads
 * "gets the floor".
 */
export function queueSeatOptions(
	seats: RoomSeat[],
	query: string,
	facts: QueueBoxFacts
): SeatOption[] {
	const speakingSeatIds = seatIdsWithStatus(facts.entries, 'speaking');
	const waitingSeatIds = seatIdsWithStatus(facts.entries, 'waiting');

	return searchSeats(seats, query).map((seat) => {
		const option = plainSeatOption(seat);

		if (speakingSeatIds.includes(seat.id)) {
			return { ...option, mark: SEAT_MARKS.speaking, isChoosable: false };
		}

		if (waitingSeatIds.includes(seat.id)) {
			return { ...option, mark: SEAT_MARKS.inList, isChoosable: false };
		}

		if (facts.attendance[seat.id] === 'absent') {
			return { ...option, mark: SEAT_MARKS.absentMarkPresent, marksPresent: true };
		}

		if (facts.givesTheFloor === true) return { ...option, mark: SEAT_MARKS.getsTheFloor };

		return option;
	});
}

/** A seat's option in "Raised by" and "Who": a seat marked absent reads "absent" and cannot be chosen. */
function pickedSeatOption(
	seat: RoomSeat,
	attendance: Record<string, AttendanceStatus>
): SeatOption {
	const option = plainSeatOption(seat);

	if (attendance[seat.id] !== 'absent') return option;

	return { ...option, mark: SEAT_MARKS.absent, isChoosable: false };
}

/**
 * Whether "The chair" matches what was typed, the way a seat's name does: the
 * whole words from the start ("the chair", "the ch") or any one word ("chair").
 */
function chairMatches(query: string): boolean {
	const wanted = foldText(query.trim());

	if (wanted === '' || foldText(CHAIR_LABEL).startsWith(wanted)) return true;

	return nameWords(CHAIR_LABEL).some((word) => word.startsWith(wanted));
}

/**
 * The options of the Motions composer's "Raised by": "The chair" first, which
 * leaves the motion's seat empty, then the matching seats, a seat marked absent
 * reading "absent" and not choosable.
 */
export function raisedByOptions(
	seats: RoomSeat[],
	attendance: Record<string, AttendanceStatus>,
	query: string
): SeatOption[] {
	const seatOptions = searchSeats(seats, query).map((seat) => pickedSeatOption(seat, attendance));

	if (!chairMatches(query)) return seatOptions;

	const chairOption: SeatOption = {
		kind: 'chair',
		seat: null,
		label: CHAIR_LABEL,
		value: CHAIR_PROPOSER,
		mark: null,
		isChoosable: true,
		marksPresent: false
	};

	return [chairOption, ...seatOptions];
}

/**
 * The options of the Single speaker form's "Who": the matching seats, a seat
 * marked absent reading "absent" and not choosable, then what was typed as
 * its own last line, "Use “Secretary-General”", for a speaker who holds no
 * seat. The typed line is left out while the box is empty or names a seat
 * exactly.
 */
export function whoOptions(
	seats: RoomSeat[],
	attendance: Record<string, AttendanceStatus>,
	query: string
): SeatOption[] {
	const seatOptions = searchSeats(seats, query).map((seat) => pickedSeatOption(seat, attendance));
	const typedName = query.trim();
	const namesASeat = seats.some((seat) => foldText(seat.name) === foldText(typedName));

	if (typedName === '' || namesASeat) return seatOptions;

	const nameOption: SeatOption = {
		kind: 'name',
		seat: null,
		label: `Use “${typedName}”`,
		value: typedName,
		mark: SEAT_MARKS.typedName,
		isChoosable: true,
		marksPresent: false
	};

	return [...seatOptions, nameOption];
}

/**
 * The option highlighted when the list opens or the text changes: the first
 * one that can be chosen, or -1 when none can. Enter chooses it until the
 * chair moves the highlight.
 */
export function firstChoosableIndex(options: SeatOption[]): number {
	return options.findIndex((option) => option.isChoosable);
}

/**
 * The option ↓ (`step` 1) or ↑ (`step` -1) highlights next, passing over the
 * options that cannot be chosen and going round from the last to the first.
 * With nothing highlighted (-1), ↓ goes to the first choosable option and ↑
 * to the last. -1 when none can be chosen.
 */
export function movedHighlight(options: SeatOption[], currentIndex: number, step: 1 | -1): number {
	const count = options.length;
	let index = currentIndex;

	// With nothing highlighted, start just outside the list on the side the arrow comes from.
	if (index < 0) index = step === 1 ? -1 : count;

	for (let tries = 0; tries < count; tries += 1) {
		// Adding `count` before taking the remainder keeps the index from going below zero.
		index = (index + step + count) % count;

		if (options[index].isChoosable) return index;
	}

	return -1;
}

/** What the list says when nothing matches: "No seat matches “xyz”". */
export function noMatchText(query: string): string {
	return `No seat matches “${query.trim()}”`;
}
