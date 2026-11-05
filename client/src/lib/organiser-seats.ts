/*
 * The sample data drawn by two pictures on the for-organisers page: the
 * applications table (section 6.5 of `docs/for-organisers-handoff.md`) and
 * the seat grid (6.6). Every name is invented. The applicants are the ones the
 * landing page draws in `SAMPLE_APPLICANTS`, but this table needs their
 * institutions and first preferences, which that list does not carry, so they
 * are written out again here.
 */

/** One tab above the applications table: a decision and how many sit under it. */
export type ApplicationTab = { label: string; count: number; isSelected: boolean };

/** The four tabs, with "Under review" open. */
export const APPLICATION_TABS: ApplicationTab[] = [
	{ label: 'Under review', count: 38, isSelected: true },
	{ label: 'Accepted', count: 96, isSelected: false },
	{ label: 'Waitlisted', count: 5, isSelected: false },
	{ label: 'Not accepted', count: 3, isSelected: false }
];

/** One row of the applications table. A ticked row is about to be decided with the others. */
export type ApplicationRow = {
	name: string;
	institution: string;
	firstPreference: string;
	isTicked: boolean;
};

/** The five applications under review, two of them ticked. */
export const APPLICATION_ROWS: ApplicationRow[] = [
	{
		name: 'Amara Okafor',
		institution: 'Northbridge University',
		firstPreference: 'Security Council',
		isTicked: false
	},
	{
		name: 'Noor Haddad',
		institution: 'Kestrel Park Academy',
		firstPreference: 'Human Rights Council',
		isTicked: true
	},
	{
		name: 'Priya Nair',
		institution: 'Northbridge University',
		firstPreference: 'Security Council',
		isTicked: true
	},
	{
		name: 'Daniel Weiss',
		institution: 'Rivermead Sixth Form',
		firstPreference: 'DISEC',
		isTicked: false
	},
	{
		name: 'Mei Tanaka',
		institution: 'Elmfield School',
		firstPreference: 'Human Rights Council',
		isTicked: false
	}
];

/** The decisions in the bar under the table, for every ticked row at once. */
export const APPLICATION_DECISIONS = ['Accept', 'Waitlist', 'Reject'];

/** A school delegation waiting in the seat grid's tray, and how far it has been seated. */
export type SeatDelegation = {
	name: string;
	seatsGiven: number;
	seatsAsked: number;
};

/** The two delegations still to seat. */
export const SEAT_DELEGATIONS: SeatDelegation[] = [
	{ name: 'Harbour View College', seatsGiven: 9, seatsAsked: 12 },
	{ name: 'Rivermead Sixth Form', seatsGiven: 0, seatsAsked: 6 }
];

/**
 * What a seat shows. `filled` names its delegate, `free` says so, `reserved`
 * is held for a school, and `vacated` is the seat the dragged delegate has
 * just been lifted from, their name left behind as a dashed ghost.
 */
export type SeatState = 'filled' | 'free' | 'reserved' | 'vacated';

/** One seat: a country and who holds it. */
export type Seat = {
	/** The two-letter ISO code, for the flag. */
	countryCode: string;
	country: string;
	state: SeatState;
	/** The delegate, or the school for a reserved seat; empty for a free one. */
	holder: string;
	/** True for the seat the dragged delegate hovers over, ringed in blue. */
	isDropTarget: boolean;
};

/** One committee's column of the grid: six seats shown and how many more follow. */
export type SeatCommittee = {
	name: string;
	filledCount: number;
	seatCount: number;
	moreSeatCount: number;
	seats: Seat[];
};

/** A seat with nothing unusual about it, to keep the committees below short. */
function seat(countryCode: string, country: string, state: SeatState, holder = ''): Seat {
	return { countryCode, country, state, holder, isDropTarget: false };
}

/** The four committees, Security Council first because a phone shows only it. */
export const SEAT_COMMITTEES: SeatCommittee[] = [
	{
		name: 'Security Council',
		filledCount: 13,
		seatCount: 15,
		moreSeatCount: 9,
		seats: [
			seat('CN', 'China', 'filled', 'Wei Zhang'),
			seat('DK', 'Denmark', 'filled', 'Priya Nair'),
			seat('FR', 'France', 'reserved', 'Harbour View College'),
			seat('RU', 'Russia', 'filled', 'Amara Okafor'),
			seat('GB', 'United Kingdom', 'filled', 'James Wilson'),
			{ ...seat('US', 'United States', 'free'), isDropTarget: true }
		]
	},
	{
		name: 'Human Rights Council',
		filledCount: 27,
		seatCount: 32,
		moreSeatCount: 26,
		seats: [
			seat('BR', 'Brazil', 'filled', 'Gabriel Santos'),
			seat('IN', 'India', 'free'),
			seat('JP', 'Japan', 'filled', 'Mei Tanaka'),
			seat('JO', 'Jordan', 'vacated', 'Noor Haddad'),
			seat('NG', 'Nigeria', 'filled', 'Zoe Adams'),
			seat('NO', 'Norway', 'reserved', 'Harbour View College')
		]
	},
	{
		name: 'DISEC',
		filledCount: 31,
		seatCount: 40,
		moreSeatCount: 34,
		seats: [
			seat('AU', 'Australia', 'filled', 'Daniel Weiss'),
			seat('CA', 'Canada', 'free'),
			seat('EG', 'Egypt', 'filled', 'Lucas Moreau'),
			seat('DE', 'Germany', 'reserved', 'Harbour View College'),
			seat('ID', 'Indonesia', 'filled', 'Hana Kimura'),
			seat('IT', 'Italy', 'filled', 'Tariq Aziz')
		]
	},
	{
		name: 'ECOSOC',
		filledCount: 24,
		seatCount: 36,
		moreSeatCount: 30,
		seats: [
			seat('AR', 'Argentina', 'filled', 'Sofia Rossi'),
			seat('GH', 'Ghana', 'filled', 'Kwame Mensah'),
			seat('MX', 'Mexico', 'reserved', 'Harbour View College'),
			seat('PL', 'Poland', 'free'),
			seat('KR', 'South Korea', 'filled', 'Min-jun Park'),
			seat('SE', 'Sweden', 'filled', 'Elsa Lindqvist')
		]
	}
];

/** The delegate drawn mid-drag over the free United States seat. */
export const DRAGGED_DELEGATE = 'Noor Haddad';

/**
 * The applications table's columns, shared by its header row and every row:
 * on a phone the tick box, the applicant and the status; from `md` up the
 * institution and first preference as well. Written out in full so Tailwind
 * finds the classes.
 */
export const APPLICATIONS_TABLE_COLUMNS =
	'grid-cols-[2.75rem_minmax(0,1fr)_auto] md:grid-cols-[2.75rem_minmax(0,0.95fr)_minmax(0,1.45fr)_minmax(0,1.45fr)_6rem]';
