import { describe, expect, it } from 'vitest';
import { cardAction, type CardActionInput, type CardActionLink } from './application-card-actions';
import { applicationUrl, applyUrl, delegationUrl, invoiceUrl, positionPaperUrl } from './urls';

/**
 * An individual's submitted application with nothing owed and no seat yet.
 * Tests spread it and change only the fields they are about.
 */
const SUBMITTED_APPLICATION: CardActionInput = {
	kind: 'individual',
	entryId: 'application-1',
	conferenceSlug: 'thimun-2027',
	status: 'submitted',
	canFinish: false,
	hasSeat: false,
	unpaidInvoiceId: null,
	owedPositionPaper: null,
	isPast: false
};

/** The same, for a delegation the reader belongs to. */
const SUBMITTED_DELEGATION: CardActionInput = {
	...SUBMITTED_APPLICATION,
	kind: 'delegation',
	entryId: 'delegation-1'
};

/** An accepted application that holds a seat and owes nothing. */
const SEATED_APPLICATION: CardActionInput = {
	...SUBMITTED_APPLICATION,
	status: 'accepted',
	hasSeat: true
};

/** "View application" as a panel with no main button draws it, with an arrow after the words. */
const VIEW_APPLICATION_WITH_ARROW: CardActionLink = {
	label: 'View application',
	href: applicationUrl('application-1'),
	look: 'outline',
	hasUploadIcon: false,
	hasArrow: true
};

/** "View application" beside a main button, which carries the arrow instead. */
const VIEW_APPLICATION_WITHOUT_ARROW: CardActionLink = {
	...VIEW_APPLICATION_WITH_ARROW,
	hasArrow: false
};

/** "View delegation" as a panel with no main button draws it. */
const VIEW_DELEGATION_WITH_ARROW: CardActionLink = {
	label: 'View delegation',
	href: delegationUrl('delegation-1'),
	look: 'outline',
	hasUploadIcon: false,
	hasArrow: true
};

/** The link to the application, named for somebody who already has a seat. */
const REVIEW_ASSIGNMENT: CardActionLink = {
	...VIEW_APPLICATION_WITHOUT_ARROW,
	label: 'Review assignment'
};

describe('cardAction', () => {
	it('asks nothing more once the conference is over, not even an unpaid invoice', () => {
		const action = cardAction({
			...SEATED_APPLICATION,
			unpaidInvoiceId: 'invoice-1',
			owedPositionPaper: { committeeSlug: 'unsc', dueIn: 'Overdue' },
			isPast: true
		});

		expect(action).toEqual({
			tone: 'neutral',
			icon: 'closed',
			title: 'This conference has ended',
			description: 'Your application stays here for reference.',
			primary: null,
			secondary: VIEW_APPLICATION_WITH_ARROW
		});
	});

	it('puts an unpaid invoice before everything else, even a position paper owed', () => {
		const action = cardAction({
			...SEATED_APPLICATION,
			unpaidInvoiceId: 'invoice-1',
			owedPositionPaper: { committeeSlug: 'unsc', dueIn: 'In 8 days' }
		});

		expect(action).toEqual({
			tone: 'danger',
			icon: 'alert',
			title: 'Confirm participation and complete payment to secure your place.',
			description: null,
			primary: {
				label: 'Complete next step',
				href: invoiceUrl('invoice-1'),
				look: 'danger',
				hasUploadIcon: false,
				hasArrow: true
			},
			secondary: VIEW_APPLICATION_WITHOUT_ARROW
		});
	});

	it('puts an unpaid invoice before an open draft too', () => {
		const action = cardAction({
			...SUBMITTED_APPLICATION,
			status: 'draft',
			canFinish: true,
			unpaidInvoiceId: 'invoice-1'
		});

		expect(action.primary?.label).toBe('Complete next step');
		expect(action.primary?.href).toBe(invoiceUrl('invoice-1'));
	});

	it('sends an open individual draft to the apply form, in red', () => {
		const action = cardAction({ ...SUBMITTED_APPLICATION, status: 'draft', canFinish: true });

		expect(action).toEqual({
			tone: 'danger',
			icon: 'alert',
			title: 'Finish and submit your application before applications close.',
			description: null,
			primary: {
				label: 'Finish application',
				href: applyUrl('thimun-2027'),
				look: 'danger',
				hasUploadIcon: false,
				hasArrow: true
			},
			secondary: VIEW_APPLICATION_WITHOUT_ARROW
		});
	});

	it('offers nothing to do about a draft once applications have closed', () => {
		const action = cardAction({ ...SUBMITTED_APPLICATION, status: 'draft', canFinish: false });

		expect(action).toEqual({
			tone: 'neutral',
			icon: 'closed',
			title: 'Applications have closed',
			description: 'This draft can no longer be submitted.',
			primary: null,
			secondary: VIEW_APPLICATION_WITH_ARROW
		});
	});

	it('tells a member of a delegation still in draft that the delegation is preparing', () => {
		const action = cardAction({ ...SUBMITTED_DELEGATION, status: 'draft' });

		expect(action).toEqual({
			tone: 'neutral',
			icon: 'clock',
			title: 'Not submitted yet',
			description: 'Your delegation is still preparing its application.',
			primary: null,
			secondary: VIEW_DELEGATION_WITH_ARROW
		});
	});

	it('asks for an owed position paper, naming when it is due', () => {
		const action = cardAction({
			...SEATED_APPLICATION,
			owedPositionPaper: { committeeSlug: 'unsc', dueIn: 'In 8 days' }
		});

		expect(action).toEqual({
			tone: 'info',
			icon: 'info',
			// `formatDueIn` wrote "In 8 days"; the panel lower-cases it mid-sentence.
			title: 'Position paper due in 8 days',
			description: 'Submit your position paper to complete your application.',
			primary: {
				label: 'Upload position paper',
				href: positionPaperUrl('thimun-2027', 'unsc'),
				look: 'primary',
				hasUploadIcon: true,
				hasArrow: false
			},
			secondary: REVIEW_ASSIGNMENT
		});
	});

	it('lower-cases "Today" too when the paper is due today', () => {
		const action = cardAction({
			...SEATED_APPLICATION,
			owedPositionPaper: { committeeSlug: 'unsc', dueIn: 'Today' }
		});

		expect(action.title).toBe('Position paper due today');
	});

	it('still asks for a position paper when the conference set no deadline', () => {
		const action = cardAction({
			...SEATED_APPLICATION,
			owedPositionPaper: { committeeSlug: 'unsc', dueIn: null }
		});

		expect(action.tone).toBe('info');
		expect(action.title).toBe('Position paper required');
		expect(action.primary?.href).toBe(positionPaperUrl('thimun-2027', 'unsc'));
	});

	it('offers no upload once the position paper deadline has passed', () => {
		const action = cardAction({
			...SEATED_APPLICATION,
			owedPositionPaper: { committeeSlug: 'unsc', dueIn: 'Overdue' }
		});

		expect(action).toEqual({
			tone: 'neutral',
			icon: 'clock',
			title: 'The position paper deadline has passed',
			description: 'Ask the organisers whether you can still send it.',
			primary: null,
			secondary: REVIEW_ASSIGNMENT
		});
	});

	it('tells a seated reader who owes nothing that they are all set', () => {
		const action = cardAction(SEATED_APPLICATION);

		expect(action).toEqual({
			tone: 'success',
			icon: 'check',
			title: "You're all set",
			description: 'Your seat is confirmed. See you at the conference.',
			primary: null,
			secondary: REVIEW_ASSIGNMENT
		});
	});

	it('points "Review assignment" at the delegation for a seated delegation member', () => {
		const action = cardAction({ ...SUBMITTED_DELEGATION, status: 'accepted', hasSeat: true });

		expect(action.secondary).toEqual({
			label: 'Review assignment',
			href: delegationUrl('delegation-1'),
			look: 'outline',
			hasUploadIcon: false,
			hasArrow: false
		});
	});

	it('tells an accepted individual without a seat that the organisers will give one', () => {
		const action = cardAction({ ...SUBMITTED_APPLICATION, status: 'accepted', hasSeat: false });

		expect(action).toEqual({
			tone: 'neutral',
			icon: 'clock',
			title: 'Waiting for your seat',
			description: 'The organisers will give you a committee and a country.',
			primary: null,
			secondary: VIEW_APPLICATION_WITH_ARROW
		});
	});

	it('tells an accepted delegation member without a seat that their head delegate will give one', () => {
		const action = cardAction({ ...SUBMITTED_DELEGATION, status: 'accepted', hasSeat: false });

		expect(action).toEqual({
			tone: 'neutral',
			icon: 'clock',
			title: 'Waiting for your seat',
			description: 'Your head delegate will give you a committee and a country.',
			primary: null,
			secondary: VIEW_DELEGATION_WITH_ARROW
		});
	});

	it('asks nothing of a submitted application while the organisers decide', () => {
		const action = cardAction(SUBMITTED_APPLICATION);

		expect(action).toEqual({
			tone: 'neutral',
			icon: 'clock',
			title: 'No action required',
			description: "We'll notify you once a decision is made.",
			primary: null,
			secondary: VIEW_APPLICATION_WITH_ARROW
		});
	});

	it('tells a waitlisted reader they will hear if a place opens up', () => {
		const action = cardAction({ ...SUBMITTED_APPLICATION, status: 'waitlisted' });

		expect(action).toEqual({
			tone: 'neutral',
			icon: 'clock',
			title: "You're on the waiting list",
			description: "We'll notify you if a place opens up.",
			primary: null,
			secondary: VIEW_APPLICATION_WITH_ARROW
		});
	});

	it('closes a rejected application', () => {
		const action = cardAction({ ...SUBMITTED_APPLICATION, status: 'rejected' });

		expect(action).toEqual({
			tone: 'neutral',
			icon: 'closed',
			title: 'Not accepted',
			description: 'This application is closed.',
			primary: null,
			secondary: VIEW_APPLICATION_WITH_ARROW
		});
	});

	it('closes a withdrawn application', () => {
		const action = cardAction({ ...SUBMITTED_APPLICATION, status: 'withdrawn' });

		expect(action).toEqual({
			tone: 'neutral',
			icon: 'closed',
			title: 'Withdrawn',
			description: 'This application was withdrawn.',
			primary: null,
			secondary: VIEW_APPLICATION_WITH_ARROW
		});
	});
});
