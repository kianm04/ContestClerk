// The sample data drawn in two pictures on /for-organisers: the fees table
// with a delegate's invoice on a phone ("As seats are given"), and an
// announcement with the two places it lands ("The weeks before"). Nothing here
// is read from the database; it is the made-up Northbridge MUN 2027 the whole
// page uses, written out so the pictures only have to lay it out.

/** The sample conference every invoice and announcement belongs to. */
export const SAMPLE_CONFERENCE_NAME = 'Northbridge MUN 2027';

/** The colour an invoice's status is drawn in: green paid, amber due, grey neither. */
export type InvoiceTone = 'paid' | 'due' | 'neutral';

/** One total in the strip of four figures above the invoices. */
export type FeeTotal = {
	label: string;
	amount: string;
};

/** The four totals across the top of the fees card, in the order they are drawn. */
export const FEE_TOTALS: FeeTotal[] = [
	{ label: 'Invoiced', amount: '€9,725' },
	{ label: 'Paid', amount: '€6,480' },
	{ label: 'Outstanding', amount: '€3,180' },
	{ label: 'Refunded', amount: '€65' }
];

/** One row of the drawn invoices table. */
export type SampleInvoice = {
	/** The invoice's number, also the row's key. */
	number: string;
	payer: string;
	/** What the invoice is for: a fee, or a school's seats together. */
	purpose: string;
	amount: string;
	status: string;
	tone: InvoiceTone;
};

/** The five invoices in the table, oldest first. */
export const SAMPLE_INVOICES: SampleInvoice[] = [
	{
		number: '0041',
		payer: 'Amara Okafor',
		purpose: 'Early delegate fee',
		amount: '€55.00',
		status: 'Paid by card',
		tone: 'paid'
	},
	{
		number: '0042',
		payer: 'Elmfield School',
		purpose: 'Delegation, 8 seats',
		amount: '€480.00',
		status: 'Paid by card',
		tone: 'paid'
	},
	{
		number: '0043',
		payer: 'Daniel Weiss',
		purpose: 'Delegate fee',
		amount: '€65.00',
		status: 'Due 14 Jan',
		tone: 'due'
	},
	{
		number: '0044',
		payer: 'Harbour View College',
		purpose: 'Delegation, 9 seats',
		amount: '€540.00',
		status: 'Paid, bank transfer',
		tone: 'paid'
	},
	{
		number: '0045',
		payer: 'Zoe Adams',
		purpose: 'Delegate fee',
		amount: '€65.00',
		status: 'Refunded',
		tone: 'neutral'
	}
];

/** The one invoice the delegate's phone shows: Daniel Weiss's, still due. */
export const PHONE_INVOICE: SampleInvoice = SAMPLE_INVOICES[2];

/** The announcement being written in the form, and arriving in both places. */
export const SAMPLE_ANNOUNCEMENT = {
	title: 'Room change for the Human Rights Council',
	audience: 'One committee · Human Rights Council',
	reach: 'Reaches 29 people',
	body: 'Committee session III moves to Room 204. Everything else in the programme stays as it was.'
};

/** One row of the delegate's notifications. */
export type SampleNotification = {
	title: string;
	/** Where it came from and when, under the title. */
	meta: string;
	/** An unread one has a blue dot and a heavier title. */
	isUnread: boolean;
};

/** The delegate's notifications, newest first; the announcement is the newest. */
export const SAMPLE_NOTIFICATIONS: SampleNotification[] = [
	{ title: SAMPLE_ANNOUNCEMENT.title, meta: 'Announcement · just now', isUnread: true },
	{
		title: 'Committee session III is now in Room 204',
		meta: 'Programme · 2 min ago',
		isUnread: true
	},
	{
		title: 'Your position paper was approved',
		meta: 'Human Rights Council · yesterday',
		isUnread: false
	}
];
