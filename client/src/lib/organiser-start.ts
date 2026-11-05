/*
	The words and sample figures of the first three sections of /for-organisers:
	the hero's dashboard, the "What it replaces" ledger and the launch step.
	They are plain data so the components only lay them out. Every name and
	number belongs to the page's one invented conference, Northbridge MUN 2027
	(docs/for-organisers-handoff.md, section 5).
*/

/** One row of the hero dashboard's "Needs attention" list. */
export type AttentionRow = {
	/** The large blue number at the start of the row. */
	count: number;
	/** The sentence the number begins. */
	sentence: string;
	/** The grey line under the sentence. */
	detail: string;
};

/** The four things the drawn dashboard asks its secretariat to deal with. */
export const HERO_ATTENTION_ROWS: AttentionRow[] = [
	{
		count: 38,
		sentence: 'applications are waiting for a decision',
		detail: 'The oldest for 6 days'
	},
	{
		count: 12,
		sentence: 'seats asked for by Harbour View College',
		detail: 'A delegation request'
	},
	{ count: 2, sentence: 'committees have no chair', detail: 'DISEC and ECOSOC' },
	{ count: 9, sentence: 'invoices are unpaid', detail: '€3,180 outstanding' }
];

/** One figure in the strip along the bottom of the drawn dashboard. */
export type HeroFigure = {
	label: string;
	value: string;
};

/** The four running totals under the dashboard's list. */
export const HERO_FIGURES: HeroFigure[] = [
	{ label: 'Applications', value: '142' },
	{ label: 'Delegations', value: '3' },
	{ label: 'Seats', value: '164 of 220' },
	{ label: 'Paid', value: '€6,480' }
];

/** One job in the "What it replaces" ledger, and the chapter that shows it. */
export type LedgerRow = {
	/** The id of the section further down the page that this row links to. */
	chapterId: string;
	/** The job a secretariat has to do. */
	job: string;
	/** What it is usually done with. */
	usually: string;
	/** Where it lives on MUNMeet. */
	onMunmeet: string;
};

/**
 * The seven jobs, in the order the page tells them. Position papers and news
 * both happen in the weeks before the conference, so both link to `#before`.
 */
export const LEDGER_ROWS: LedgerRow[] = [
	{
		chapterId: 'applications',
		job: 'Applications',
		usually: 'A form and a sheet of responses',
		onMunmeet: 'Your own questions, on top of a profile each applicant fills in once'
	},
	{
		chapterId: 'allocation',
		job: 'Country allocation',
		usually: 'A matrix in a spreadsheet',
		onMunmeet: 'A seat grid: every seat free, reserved for a school, or filled'
	},
	{
		chapterId: 'schools',
		job: 'School delegations',
		usually: 'An email thread with every teacher',
		onMunmeet: 'A school asks for seats, you allocate them, its head of delegation hands them out'
	},
	{
		chapterId: 'fees',
		job: 'Fees',
		usually: 'A "paid?" column and a bank statement',
		onMunmeet: 'An invoice written the moment a seat is given, paid by card, marked paid by itself'
	},
	{
		chapterId: 'before',
		job: 'Position papers',
		usually: "Attachments in the chairs' inboxes",
		onMunmeet: 'Written or uploaded in MUNMeet, approved or sent back by the chair'
	},
	{
		chapterId: 'before',
		job: 'News and changes',
		usually: 'The group chat',
		onMunmeet: 'Announcements to everyone, one committee or one delegation, in MUNMeet and by email'
	},
	{
		chapterId: 'days',
		job: 'Debate',
		usually: "A stopwatch and a paper speakers' list",
		onMunmeet: "The committee room: one clock on the chair's laptop and every delegate's phone"
	}
];

/** The committee chips on the drawn public page, before the "+5" for the rest. */
export const LAUNCH_COMMITTEES: string[] = ['Security Council', 'UNHRC', 'DISEC'];

/** The four steps of creating a conference that come before "Launch", all done. */
export const LAUNCH_DONE_STEPS: string[] = ['Organisation', 'Basics', 'When & where', 'Setup'];
