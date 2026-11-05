/**
 * The quick session setup's draft (S14, `05-pages/chair/quick-session.md`,
 * "The draft"): the committee's name, agenda and speaking time, what is typed
 * in the search box, and the members chosen so far, with every change a chair
 * can make to it before pressing "Start session" or "Save delegations".
 *
 * Nothing is saved until then. Until then the draft is what the form holds,
 * one hidden `member` field per member, valued `country:FR` for a country and
 * `name:Amnesty International` for anything else. The browser and the server
 * call the same functions below, so the page behaves the same with and without
 * JavaScript: with it a button changes the draft in the browser, without it
 * the button posts the whole form and the action answers with the changed
 * draft.
 *
 * Plain functions with no Svelte and nothing server-only in them, so both
 * sides import this file and it can be tested on its own.
 */

import { countryName, isCountryCode } from '$lib/countries';
import { readDuration } from '$lib/motion-input';
import {
	countryCodeForName,
	isSeatListName,
	parseSeatNames,
	PASTED_SEAT_LIMIT,
	standardSeats,
	UN_MEMBER_STATES
} from '$lib/seat-lists';
import { isTimezone } from '$lib/timezones';

/** One member of the committee being set up. */
export type QuickSessionMember = {
	/** What its hidden `member` field carries: `country:FR` or `name:Amnesty International`. */
	value: string;
	/** "France", "Amnesty International". */
	name: string;
	/** Two letters for a country's flag, or null for a member that is not a country. */
	countryCode: string | null;
};

/** Everything the setup form holds before it is saved. */
export type QuickSessionDraft = {
	/** The committee's name, as typed. */
	name: string;
	/** The agenda, as typed; may be empty. */
	agenda: string;
	/** The speaking time, as typed: "1:30", "90s" or "2". */
	speakingTime: string;
	/** The browser's own timezone, which the page fills in once it comes to life. */
	timezone: string;
	/** What is typed in the search box, the form's `q`. */
	search: string;
	/** The members chosen so far, in alphabetical order. */
	members: QuickSessionMember[];
};

/** The messages a draft can carry, each shown under the part of the page it is about. */
export type QuickSessionErrors = {
	name?: string;
	agenda?: string;
	speakingTime?: string;
	/** Shown under "Your committee". */
	members?: string;
	/** Shown under the pasted list. */
	paste?: string;
	/** Shown under the search box, about '+ Add "…" as a member'. */
	custom?: string;
};

/** A draft after one change, with the message that change was refused with, if any. */
export type DraftChange = {
	draft: QuickSessionDraft;
	errors: QuickSessionErrors;
};

/** What "Start session" hands to `create_quick_session` once every check has passed. */
export type QuickSessionStart = {
	committeeName: string;
	/** The agenda, or null when none was typed. */
	agenda: string | null;
	speakingTimeSeconds: number;
	/** The browser's timezone, or null for the database's default (`Europe/Amsterdam`). */
	timezone: string | null;
	/** In alphabetical order, the order the seats are made in. */
	members: QuickSessionMember[];
};

/** What `readQuickSessionForm` found: the draft to draw again, and either its errors or the start. */
export type QuickSessionForm = {
	draft: QuickSessionDraft;
	errors: QuickSessionErrors;
	/** Null while any field is refused. */
	start: QuickSessionStart | null;
};

/** The start of a country member's value: `country:FR`. */
const COUNTRY_PREFIX = 'country:';

/** The start of any other member's value: `name:Amnesty International`. */
const NAME_PREFIX = 'name:';

/** The speaking time an empty draft starts with. */
export const DEFAULT_SPEAKING_TIME = '1:30';

/** The fewest members a quick session can start or be saved with. */
export const FEWEST_MEMBERS = 2;

/**
 * The most members a quick session can hold. The same number as the most
 * lines one paste may add, and as `create_quick_session`'s own limit.
 */
export const MOST_MEMBERS = PASTED_SEAT_LIMIT;

/** The longest a member's name may be, in characters. */
export const LONGEST_MEMBER_NAME = 80;

/** The longest the committee's name may be, in characters. */
export const LONGEST_COMMITTEE_NAME = 120;

/** The longest the agenda may be, in characters. */
export const LONGEST_AGENDA = 200;

/** The shortest and longest speaking time, in seconds: 0:30 and 10:00. */
export const SHORTEST_SPEAKING_SECONDS = 30;
export const LONGEST_SPEAKING_SECONDS = 600;

/** The refusals of `quick-session.md`, word for word. */
export const QUICK_SESSION_MESSAGES = {
	nameMissing: "Please enter the committee's name.",
	nameTooLong: 'Please keep the name under 120 characters.',
	agendaTooLong: 'Please keep the agenda under 200 characters.',
	speakingTime: 'Please enter a speaking time between 0:30 and 10:00.',
	tooFewToStart: 'Add at least two members to start.',
	tooFewToSave: 'Add at least two members to save.',
	tooMany: 'A quick session holds at most 300 delegations.',
	memberNameTooLong: "Please keep a member's name under 80 characters.",
	pasteTooLong: 'Please add at most 300 delegations at a time.',
	sessionRunning: 'End the session before changing its delegations.',
	serverFailure: 'Something went wrong on our side. Please try again.'
} as const;

/** A draft with nothing in it, the speaking time at 1:30: what `/quick/new` opens on. */
export function emptyDraft(): QuickSessionDraft {
	return {
		name: '',
		agenda: '',
		speakingTime: DEFAULT_SPEAKING_TIME,
		timezone: '',
		search: '',
		members: []
	};
}

/** An empty draft holding these members, as "Edit delegations" opens on its committee's. */
export function draftOfMembers(members: QuickSessionMember[]): QuickSessionDraft {
	return { ...emptyDraft(), members: withMembers([], members) };
}

/** A country as a member, named by `countryName`. */
export function countryMember(code: string): QuickSessionMember {
	return { value: `${COUNTRY_PREFIX}${code}`, name: countryName(code), countryCode: code };
}

/**
 * A typed or pasted name as a member: a country's name ("france") becomes
 * that country, anything else ("Amnesty International") a member of its own.
 * Null for an empty name or one longer than `LONGEST_MEMBER_NAME`.
 */
export function memberFromName(typedName: string): QuickSessionMember | null {
	const name = typedName.trim();

	if (name === '' || name.length > LONGEST_MEMBER_NAME) return null;

	const code = countryCodeForName(name);

	if (code !== null) return countryMember(code);

	return { value: `${NAME_PREFIX}${name}`, name, countryCode: null };
}

/**
 * A hidden `member` field's value read back into a member, or null for a
 * value that is neither a known country nor a usable name. Anybody can post
 * anything to a form, so nothing the form sends is trusted as it is.
 */
export function memberFromValue(value: string): QuickSessionMember | null {
	if (value.startsWith(COUNTRY_PREFIX)) {
		const code = value.slice(COUNTRY_PREFIX.length);

		return isCountryCode(code) ? countryMember(code) : null;
	}

	if (value.startsWith(NAME_PREFIX)) return memberFromName(value.slice(NAME_PREFIX.length));

	return null;
}

/** Whether two members are the same one: a country by its code, any other name in any capitals. */
function isSameMember(first: QuickSessionMember, second: QuickSessionMember): boolean {
	if (first.countryCode !== null || second.countryCode !== null) {
		return first.countryCode === second.countryCode;
	}

	return first.name.toLowerCase() === second.name.toLowerCase();
}

/** The members in alphabetical order, the order a chair calls them in. */
function alphabetical(members: QuickSessionMember[]): QuickSessionMember[] {
	return [...members].sort((first, second) => first.name.localeCompare(second.name));
}

/** The members with each one added once, in alphabetical order. A member already there is kept as it was. */
function withMembers(
	members: QuickSessionMember[],
	added: QuickSessionMember[]
): QuickSessionMember[] {
	const combined = [...members];

	for (const member of added) {
		const isChosen = combined.some((chosen) => isSameMember(chosen, member));

		if (!isChosen) combined.push(member);
	}

	return alphabetical(combined);
}

/** A form field as text, or '' when the form did not send it. */
function textField(formData: FormData, name: string): string {
	const value = formData.get(name);

	return typeof value === 'string' ? value : '';
}

/**
 * The draft a posted form holds: its fields, its search and one member for
 * each hidden `member` field, a member sent twice kept once.
 */
export function readQuickSessionDraft(formData: FormData): QuickSessionDraft {
	const memberValues = formData.getAll('member').filter((value) => typeof value === 'string');
	const members = memberValues
		.map((value) => memberFromValue(value))
		.filter((member) => member !== null);

	return {
		name: textField(formData, 'name'),
		agenda: textField(formData, 'agenda'),
		speakingTime: textField(formData, 'speakingTime'),
		timezone: textField(formData, 'timezone'),
		search: textField(formData, 'q'),
		members: withMembers([], members)
	};
}

/** "+": adds one member, from its `country:` value. An unusable value changes nothing. */
export function addMember(draft: QuickSessionDraft, value: string): QuickSessionDraft {
	const member = memberFromValue(value);

	if (member === null) return draft;

	return { ...draft, members: withMembers(draft.members, [member]) };
}

/**
 * '+ Add "{typed}" as a member': adds what is typed in the search box and
 * empties the box. A name over 80 characters is refused and kept in the box.
 */
export function addCustomMember(draft: QuickSessionDraft): DraftChange {
	const typed = draft.search.trim();

	if (typed === '') return { draft, errors: {} };

	const member = memberFromName(typed);

	if (member === null) {
		return { draft, errors: { custom: QUICK_SESSION_MESSAGES.memberNameTooLong } };
	}

	return {
		draft: { ...draft, search: '', members: withMembers(draft.members, [member]) },
		errors: {}
	};
}

/** "×": removes one member, by its value. */
export function removeMember(draft: QuickSessionDraft, value: string): QuickSessionDraft {
	const members = draft.members.filter((member) => member.value !== value);

	return { ...draft, members };
}

/**
 * "UN members", "Security Council", "EU members": replaces the members with
 * that list, as myMUN's own lists do. A list name it does not know changes
 * nothing.
 */
export function fillFromList(draft: QuickSessionDraft, listName: string): QuickSessionDraft {
	if (!isSeatListName(listName)) return draft;

	const members: QuickSessionMember[] = [];

	// Every seat of a ready-made list is a country, so each has its code.
	for (const seat of standardSeats(listName)) {
		if (seat.countryCode !== null) members.push(countryMember(seat.countryCode));
	}

	return { ...draft, members: alphabetical(members) };
}

/**
 * "Add these": adds one member per pasted line, a recognised country's name
 * as that country, each name once, to the members chosen so far. More lines
 * than `PASTED_SEAT_LIMIT`, or a line over 80 characters, refuses the whole
 * paste, so nothing is added that the chair did not see added.
 */
export function addPastedNames(draft: QuickSessionDraft, text: string): DraftChange {
	const names = parseSeatNames(text);

	if (names.length > PASTED_SEAT_LIMIT) {
		return { draft, errors: { paste: QUICK_SESSION_MESSAGES.pasteTooLong } };
	}

	const members = names.map((name) => memberFromName(name));
	const usableMembers = members.filter((member) => member !== null);

	if (usableMembers.length < members.length) {
		return { draft, errors: { paste: QUICK_SESSION_MESSAGES.memberNameTooLong } };
	}

	return { draft: { ...draft, members: withMembers(draft.members, usableMembers) }, errors: {} };
}

/** "Clear all": removes every member. */
export function clearMembers(draft: QuickSessionDraft): QuickSessionDraft {
	return { ...draft, members: [] };
}

/** A name or a search as plain lowercase letters: "Côte d'Ivoire" as "cote d'ivoire". */
function foldForSearch(text: string): string {
	// `NFKD` splits a letter such as `ô` into `o` and a separate accent mark,
	// which `\p{M}` then removes, the way `slugify` in `$lib/slugs.ts` does.
	return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

/** One member state as the search reads it, worked out once when this file is first imported. */
type SearchableState = { code: string; name: string; words: string[] };

/** The 193 member states in alphabetical order, each with the words of its name. */
const SEARCHABLE_STATES: SearchableState[] = UN_MEMBER_STATES.map((code) => {
	const name = foldForSearch(countryName(code));

	return { code, name, words: name.split(/[\s\-(),]+/) };
}).sort((first, second) => first.name.localeCompare(second.name));

/**
 * The member states the search lets through, as codes in alphabetical order:
 * every one while nothing is typed, else those with a word of their name
 * starting with what was typed, ignoring capitals and accents ("king" finds
 * the United Kingdom). What was typed may also run over several words
 * ("united k").
 */
export function searchMemberStates(search: string): string[] {
	const typed = foldForSearch(search.trim());

	if (typed === '') return SEARCHABLE_STATES.map((state) => state.code);

	const matches = SEARCHABLE_STATES.filter(
		(state) => state.name.startsWith(typed) || state.words.some((word) => word.startsWith(typed))
	);

	return matches.map((state) => state.code);
}

/** Whether the draft has a country with this code already. */
export function isCountryChosen(draft: QuickSessionDraft, code: string): boolean {
	return draft.members.some((member) => member.countryCode === code);
}

/** Whether "Start session" (or "Save delegations") may be pressed: at least two members. */
export function canStart(draft: QuickSessionDraft): boolean {
	return draft.members.length >= FEWEST_MEMBERS;
}

/** Which page's footer a line is for: `/quick/new`'s "Start session" or "Save delegations". */
export type QuickSessionPurpose = 'start' | 'save';

/**
 * The line beside the footer's button: what pressing it does, or, under two
 * members, why it cannot be pressed yet.
 */
export function footerNote(draft: QuickSessionDraft, purpose: QuickSessionPurpose): string {
	const isReady = canStart(draft);

	if (purpose === 'save') {
		return isReady
			? 'Removing a delegation keeps it in the record of earlier sessions.'
			: 'Add at least two members to save';
	}

	return isReady
		? 'Opens Session 1 straight away. The committee is kept for next time.'
		: 'Add at least two members to start';
}

/**
 * The members' own message, or undefined when their number is fine: fewer
 * than two (`tooFewMessage`, which says what cannot happen yet), or more than
 * 300.
 */
export function memberCountError(
	members: QuickSessionMember[],
	tooFewMessage: string
): string | undefined {
	if (members.length < FEWEST_MEMBERS) return tooFewMessage;
	if (members.length > MOST_MEMBERS) return QUICK_SESSION_MESSAGES.tooMany;

	return undefined;
}

/** The committee's name's message, or undefined when it is fine. */
function nameError(name: string): string | undefined {
	if (name === '') return QUICK_SESSION_MESSAGES.nameMissing;
	if (name.length > LONGEST_COMMITTEE_NAME) return QUICK_SESSION_MESSAGES.nameTooLong;

	return undefined;
}

/** The speaking time in seconds, or null when it is not a time between 0:30 and 10:00. */
function speakingSeconds(speakingTime: string): number | null {
	const seconds = readDuration(speakingTime);

	if (seconds === null) return null;
	if (seconds < SHORTEST_SPEAKING_SECONDS || seconds > LONGEST_SPEAKING_SECONDS) return null;

	return seconds;
}

/**
 * "Start session": the draft a posted form holds, checked by the table under
 * "`start`" in `quick-session.md`. Every refused field has its message; when
 * none is refused, `start` holds what `create_quick_session` is called with.
 * A timezone this app does not know falls back to the database's default.
 */
export function readQuickSessionForm(formData: FormData): QuickSessionForm {
	const draft = readQuickSessionDraft(formData);
	const name = draft.name.trim();
	const agenda = draft.agenda.trim();
	const seconds = speakingSeconds(draft.speakingTime);

	const errors = withoutEmpty({
		name: nameError(name),
		agenda: agenda.length > LONGEST_AGENDA ? QUICK_SESSION_MESSAGES.agendaTooLong : undefined,
		speakingTime: seconds === null ? QUICK_SESSION_MESSAGES.speakingTime : undefined,
		members: memberCountError(draft.members, QUICK_SESSION_MESSAGES.tooFewToStart)
	});
	const isRefused = Object.keys(errors).length > 0;

	if (isRefused || seconds === null) return { draft, errors, start: null };

	return {
		draft,
		errors: {},
		start: {
			committeeName: name,
			agenda: agenda === '' ? null : agenda,
			speakingTimeSeconds: seconds,
			timezone: isTimezone(draft.timezone) ? draft.timezone : null,
			members: draft.members
		}
	};
}

/**
 * The errors with the fields that have none left out, so a refused form's
 * errors name only the fields that were refused and a form with none is `{}`.
 */
function withoutEmpty(errors: QuickSessionErrors): QuickSessionErrors {
	const entries = Object.entries(errors).filter(([, message]) => message !== undefined);

	return Object.fromEntries(entries);
}
