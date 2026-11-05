// The words and sample data for the last sections of `/for-organisers`: a new
// edition, who sees what, the team, the price, the questions and the closing
// call. They are plain data so the components only arrange them, and they
// follow the design brief in `docs/for-organisers-handoff.md` (6.10 to 6.14).

/** The eyebrow and title of a section that carries its own heading. */
export type OrganiserSectionHeading = { eyebrow: string; title: string };

/** The drawn "New conference" card: next year's edition, started from this one. */
export const NEW_EDITION = {
	name: 'Northbridge MUN 2028',
	dates: '3 – 5 Mar 2028',
	datesNote: 'Suggested from 2027',
	copyFrom: 'Copy from Northbridge MUN 2027',
	/** The parts of the 2027 edition that are ticked to copy. */
	copiedParts: ['8 committees', 'Application form, 6 questions', '3 fees']
};

/** A role in a conference and what it can see. */
export type OrganiserRoleAccess = { role: string; sees: string };

/** Who sees what, one row per role, from the widest view to the narrowest. */
export const ROLE_ACCESS: OrganiserRoleAccess[] = [
	{
		role: 'Organisers',
		sees: 'Everything about the conference: applications, seats, fees, the programme, documents and every room.'
	},
	{
		role: 'Chairs',
		sees: "Their own committee: its room, its description and agenda, its delegates' position papers, their own notes and the awards they propose. Not applications, fees or private details."
	},
	{
		role: 'Volunteers',
		sees: 'The staff programme, staff announcements and staff documents.'
	},
	{
		role: 'Roles you make',
		sees: 'Exactly what you tick, for the whole conference or for chosen committees: a USG delegate affairs who decides applications, a Finance role that sees the invoices and no welfare details, a registration desk that sees the participants and nothing else.'
	},
	{
		role: 'Heads of delegation',
		sees: 'Their own delegation: its members, its seats and its invoices.'
	},
	{
		role: 'Delegates',
		sees: "Their own application, seat, invoice and paper, and their committee's room."
	}
];

/** The line under the access list, about the most private details. */
export const PRIVATE_DETAILS_NOTE =
	'Private details, such as date of birth, dietary requirements and an emergency contact, are read only by the person, the head of their own delegation, and the team members whose role is allowed to see them.';

/** A person in the drawn team card. */
export type TeamMember = { name: string; initials: string; title: string; role: string };

/** The sample secretariat in the team card. */
export const SAMPLE_TEAM: TeamMember[] = [
	{ name: 'Eleanor Wright', initials: 'EW', title: 'Secretary-General', role: 'Organiser' },
	{
		name: 'Tomasz Zielinski',
		initials: 'TZ',
		title: 'Under-Secretary-General',
		role: 'USG delegate affairs'
	},
	{ name: 'Fiona Campbell', initials: 'FC', title: 'Human Rights Council', role: 'Chair' },
	{ name: 'Idris Bello', initials: 'IB', title: 'Security Council', role: 'Chair' },
	{ name: 'Lena Fischer', initials: 'LF', title: 'Registration', role: 'Registration desk' }
];

/** The invitation still waiting at the foot of the team card. */
export const SAMPLE_TEAM_INVITATION = 'Invitation sent to j.morgan@northbridge.example';

/** The price section's eyebrow and title. */
export const PRICE_HEADING: OrganiserSectionHeading = { eyebrow: 'Price', title: 'What it costs.' };

/** A line of the price list. */
export type PriceLine = { item: string; price: string };

/**
 * The price list. The €2.00 is written out here rather than read from
 * `PLATFORM_FEE_PER_DELEGATE_CENTS`, which lives in `$lib/server` and may never
 * reach the browser; if the fee changes, change it here and in the questions.
 */
export const PRICE_LINES: PriceLine[] = [
	{ item: 'Setting up and running a conference', price: 'Free' },
	{ item: 'Each delegate seat paid by card through MUNMeet', price: '€2.00' },
	{ item: 'Fees you collect yourselves', price: 'Free' },
	{ item: 'Free conferences', price: 'Free' }
];

/** The small line under the price list. */
export const PRICE_NOTE =
	'A flat fee for each seat, not a share of your delegate fee. A conference of 200 delegates paying by card pays €400.';

/** The questions section's eyebrow and title. */
export const QUESTIONS_HEADING: OrganiserSectionHeading = {
	eyebrow: 'Questions',
	title: 'What organisers ask first.'
};

/** A question an organiser asks, and its answer. */
export type OrganiserQuestion = { question: string; answer: string };

/**
 * The questions in the two columns the design draws them in on a desktop. A
 * phone shows the second column under the first.
 */
export const ORGANISER_QUESTION_COLUMNS: OrganiserQuestion[][] = [
	[
		{
			question: 'Can we try it first?',
			answer:
				'Yes, twice over. Run a quick session to try the committee room tonight, or create a conference and keep it as a draft for as long as you like.'
		},
		{
			question: 'What does it cost?',
			answer:
				'€2.00 for each delegate seat paid by card through MUNMeet. Conferences that collect their own fees, and free conferences, pay nothing.'
		},
		{
			question: 'Can we collect fees ourselves?',
			answer:
				'Yes. Choose to collect payments outside MUNMeet, and delegates see your instructions on their invoice instead of a card button.'
		},
		{
			question: 'Do delegates need an account?',
			answer:
				'Yes, one free account, which they keep from conference to conference. Their profile fills in the parts of your form that every conference asks for.'
		},
		{
			question: 'Our delegates come as school groups. Does that work?',
			answer:
				'Yes. A school registers one delegation and asks for a number of seats. You allocate them, its head of delegation assigns the students, and the school is invoiced for its seats together.'
		},
		{
			question: 'How are delegates told about decisions and changes?',
			answer:
				'By email and by a notification in MUNMeet, the moment it happens: a decision, a seat, an invoice, an announcement, a reviewed paper, an award.'
		}
	],
	[
		{
			question: 'Which rules of procedure does the committee room follow?',
			answer:
				"A general speakers' list, moderated and unmoderated caucuses, motions, and votes by simple or two-thirds majority. Points, amendments and draft resolutions are not in the room yet; chairs record a vote by its subject."
		},
		{
			question: 'Can chairs use it without being organisers?',
			answer:
				'Yes. Invite each chair to their committee by email. They open their own rooms and see nothing of applications or fees.'
		},
		{
			question: 'What if the connection drops during a session?',
			answer:
				'Every screen keeps its own clock running and catches up when it is back. Changing the room, such as calling the next speaker, needs a connection.'
		},
		{
			question: 'Can we take our data out?',
			answer: 'Yes. Applications, participants and invoices export as CSV at any time.'
		},
		{
			question: "Who can see our applicants' details?",
			answer:
				"Only the organisers of your conference, and a delegation's own head for its members. The rule is enforced in the database, not only on the screen."
		}
	]
];

/** The address under the questions, for anything they do not answer. */
export const QUESTIONS_EMAIL = 'hello@munmeet.app';

/** The words of the closing band. */
export const CLOSING_BAND = {
	title: 'Start with a draft.',
	text: 'Nothing is public until you publish it.',
	createLabel: 'Create a conference',
	quickSessionLabel: 'or run a quick session'
};
