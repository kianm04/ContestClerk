/**
 * Application teams (Trello pZNcdPqU): friends who apply to represent one
 * country together. Each still sends an application of their own and, once
 * accepted, sits in a seat of their own: the team is given one country, and
 * each member takes that country's seat in a different committee.
 *
 * Everything here is pure, so the applicant's page, the organiser's review page
 * and the tests all agree without a database. The database side is migration
 * 20261010120000_application_teams.sql; the queries are in
 * `$lib/server/application-teams.ts`.
 */
import type { ResolvedPathname } from '$app/types';
import type { AllocatableSeat, SeatGroup } from '$lib/allocation';
import type { ApplicationStatus } from '$lib/applications';
import type { SelectOption } from '$lib/components/SelectField.svelte';
import { countryName } from '$lib/countries';

/** The longest code anyone could mean: the database makes them eight characters. */
export const TEAM_CODE_MAX_LENGTH = 12;

/** One person in a team, as the organiser's review page lists them. */
export type TeamMember = {
	applicationId: string;
	userId: string;
	fullName: string;
	status: ApplicationStatus;
	/** The committee ids they asked for, most wanted first. */
	committeePreferences: string[];
};

/** A member as the organiser's team section lists them, with where their name leads. */
export type TeamMemberRow = TeamMember & {
	/** Their own review page, or `null` for a draft nobody can review yet. */
	reviewHref: ResolvedPathname | null;
	/** Their public profile at `/people/[userId]`. */
	profileHref: ResolvedPathname;
};

/** What the organiser's team section draws, and where its two forms post. */
export type TeamSection = {
	/** Everybody in the team, this applicant included; empty when applying alone. */
	members: TeamMemberRow[];
	/** The other applicants still under review, for "Add to team". */
	partnerOptions: SelectOption[];
	addAction: string;
	removeAction: string;
};

/** "Accept the team": the countries free for every undecided member, and where it posts. */
export type TeamAccept = {
	countryOptions: SelectOption[];
	formaction: string;
};

/** The team an applicant sees on their own application: its code and who is in it. */
export type MyTeam = {
	joinCode: string;
	memberNames: string[];
};

/** A member the organiser can still accept, waitlist or reject. */
export function isOpenMember(member: Pick<TeamMember, 'status'>): boolean {
	return member.status === 'submitted' || member.status === 'waitlisted';
}

/**
 * The other members of an application's team that are still undecided. A team
 * is decided as one, so waitlisting or rejecting one application takes these
 * along, and a single seat is never given to one of them alone.
 */
export function openTeammateIds(members: TeamMember[], applicationId: string): string[] {
	return members
		.filter((member) => member.applicationId !== applicationId && isOpenMember(member))
		.map((member) => member.applicationId);
}

/** A code as somebody typed it, in the capitals the database stores. */
export function normaliseTeamCode(value: string): string {
	return value.trim().toUpperCase().slice(0, TEAM_CODE_MAX_LENGTH);
}

/** One free seat and the committee it is in, which the flash after accepting names. */
export type TeamSeatChoice = {
	applicationId: string;
	seat: AllocatableSeat;
	committeeLabel: string;
};

/**
 * For each country with a free seat, the free seats of it, at most one per
 * committee: a team member never shares a committee with a teammate.
 */
function seatsByCountry(
	groups: SeatGroup[]
): Map<string, { seat: AllocatableSeat; committeeLabel: string }[]> {
	const byCountry = new Map<string, { seat: AllocatableSeat; committeeLabel: string }[]>();

	for (const group of groups) {
		const countriesInThisCommittee = new Set<string>();

		for (const seat of group.seats) {
			if (seat.countryCode === null || countriesInThisCommittee.has(seat.countryCode)) continue;

			countriesInThisCommittee.add(seat.countryCode);
			const seats = byCountry.get(seat.countryCode) ?? [];
			seats.push({ seat, committeeLabel: group.committeeLabel });
			byCountry.set(seat.countryCode, seats);
		}
	}

	return byCountry;
}

/**
 * The countries a team of `memberCount` can be given: those with a free seat
 * in at least that many committees, by name. "Kenya (3 committees free)".
 */
export function teamCountryOptions(groups: SeatGroup[], memberCount: number): SelectOption[] {
	const options: SelectOption[] = [];

	for (const [countryCode, seats] of seatsByCountry(groups)) {
		if (seats.length < memberCount) continue;

		const committees = seats.length === 1 ? '1 committee free' : `${seats.length} committees free`;
		options.push({ value: countryCode, label: `${countryName(countryCode)} (${committees})` });
	}

	return options.sort((first, second) => first.label.localeCompare(second.label));
}

/**
 * Which seat of `countryCode` each member takes, or null when the country has
 * too few committees with a free seat for all of them.
 *
 * Each member in turn takes the free seat in the first committee they asked
 * for that no teammate has taken yet, and otherwise the first free one left,
 * in the order `groups` lists the committees.
 */
export function assignTeamSeats(
	groups: SeatGroup[],
	members: Pick<TeamMember, 'applicationId' | 'committeePreferences'>[],
	countryCode: string
): TeamSeatChoice[] | null {
	const remaining = [...(seatsByCountry(groups).get(countryCode) ?? [])];

	if (members.length === 0 || remaining.length < members.length) return null;

	return members.map((member) => {
		const preferredIndex = member.committeePreferences
			.map((committeeId) =>
				remaining.findIndex((choice) => choice.seat.committeeId === committeeId)
			)
			.find((index) => index !== -1);
		const [choice] = remaining.splice(preferredIndex ?? 0, 1);

		return { applicationId: member.applicationId, ...choice };
	});
}

/** "Umarbek Ismoilov and Kian Matton are now Kenya in DISEC and HRC." */
export function teamAcceptedFlash(choices: TeamSeatChoice[], names: Map<string, string>): string {
	const people = joinWithAnd(
		choices.map((choice) => names.get(choice.applicationId) ?? 'Somebody')
	);
	const committees = joinWithAnd(choices.map((choice) => choice.committeeLabel));
	const country = choices[0]?.seat.name ?? '';

	return `${people} are now ${country} in ${committees}.`;
}

/** "A", "A and B", "A, B and C". */
export function joinWithAnd(parts: string[]): string {
	if (parts.length <= 1) return parts.join('');

	return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The sentences the team forms answer with, on both sides. */
export const TEAM_STARTED_FLASH = 'Team started. Give your friends the code.';
export const TEAM_JOINED_FLASH = 'You joined the team.';
export const TEAM_LEFT_FLASH = 'You left the team.';
export const TEAM_CHANGED_FLASH = 'Team updated.';
export const TEAM_WAITLISTED_FLASH = 'The team was waitlisted.';
export const TEAM_REJECTED_FLASH =
	'The team was marked as not accepted. Everyone in it has been notified.';
export const TEAM_CODE_MISSING_REFUSAL = 'Enter the code your friend gave you.';
export const CHOOSE_PARTNER_REFUSAL = 'Choose who to add to the team.';
export const CHOOSE_COUNTRY_REFUSAL = 'Choose a country first.';
export const ACCEPT_TEAM_ON_REVIEW_PAGE_REFUSAL =
	'This applicant is in a team. Open their review page to give the team one country.';
export const COUNTRY_JUST_TAKEN_REFUSAL =
	'That country no longer has a free seat for every member. Pick another.';

/**
 * What a code that matches no team is answered with. The database itself says
 * nothing for a wrong code: it writes the attempt down and answers null, so
 * that an error does not undo the writing (join_application_team in migration
 * 20261022141000_codes_and_shape_checks.sql). `joinMyTeam` in
 * `$lib/server/application-teams.ts` turns that null into this sentence.
 */
export const UNKNOWN_TEAM_CODE_REFUSAL = 'That code does not belong to a team at this conference';

/**
 * The sentences the team functions in the migration refuse with. They were
 * written to be read by the person who pressed the button, so they are shown
 * as they are; any other error is somebody else's text and is not.
 */
const TEAM_REFUSALS = [
	'This application can no longer be changed',
	'You are already in a team for this conference',
	UNKNOWN_TEAM_CODE_REFUSAL,
	'Too many wrong codes. Try again in an hour',
	'You are already in this team',
	'You are not in a team',
	'They are already in the same team',
	'That application is not in a team'
];

/** The refusal in `databaseMessage` with a full stop, or null when it is not one of ours. */
export function teamRefusal(databaseMessage: string): string | null {
	const refusal = TEAM_REFUSALS.find((sentence) => databaseMessage.includes(sentence));

	return refusal === undefined ? null : `${refusal}.`;
}
