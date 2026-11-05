/**
 * The panel on the right of each card at `/applications`: what, if anything,
 * the reader should do next about this application, and the buttons that take
 * them there. `specs/05-pages/delegate/applications.md` lists every case.
 */

import type { ResolvedPathname } from '$app/types';
import type { ApplicationStatus } from '$lib/applications';
import type { DelegationStatus } from '$lib/delegations';
import { applicationUrl, applyUrl, delegationUrl, invoiceUrl, positionPaperUrl } from '$lib/urls';

/** The panel's colour: blue for a task, red for something urgent, green when all is done. */
export type CardActionTone = 'info' | 'neutral' | 'danger' | 'success';

/** The picture at the start of the panel. `closed` is for an application that is over. */
export type CardActionIcon = 'info' | 'clock' | 'alert' | 'check' | 'closed';

/** One of the panel's buttons, which are always links. */
export type CardActionLink = {
	label: string;
	href: ResolvedPathname;
	/** A filled blue or red button, or the white one with a blue border. */
	look: 'primary' | 'danger' | 'outline';
	/** An upload arrow before the words, for "Upload position paper". */
	hasUploadIcon: boolean;
	/** An arrow after the words, for a link that moves the reader on. */
	hasArrow: boolean;
};

export type CardAction = {
	tone: CardActionTone;
	icon: CardActionIcon;
	title: string;
	description: string | null;
	/** The main thing to do, or `null` when there is nothing to do. */
	primary: CardActionLink | null;
	/** The way to the application or delegation itself, always there. */
	secondary: CardActionLink;
};

/** A position paper the reader still owes for their seat. */
export type OwedPositionPaper = {
	committeeSlug: string;
	/**
	 * "In 8 days", "Today", "Tomorrow" or "Overdue", from `formatDueIn`, or
	 * `null` when the conference set no deadline.
	 */
	dueIn: string | null;
};

/** Everything the panel is decided from. */
export type CardActionInput = {
	kind: 'individual' | 'delegation';
	/** The application's id, or the delegation's. */
	entryId: string;
	conferenceSlug: string;
	status: ApplicationStatus | DelegationStatus;
	/** Whether this is an unsent draft at a conference still taking applications. */
	canFinish: boolean;
	hasSeat: boolean;
	/** The invoice the reader still has to pay for this conference, if any. */
	unpaidInvoiceId: string | null;
	/** The position paper the reader still owes, if any. */
	owedPositionPaper: OwedPositionPaper | null;
	/** Whether the conference is over, when nothing is left to do about it. */
	isPast: boolean;
};

/** A panel with no main button, only the way to the application itself. */
function quietPanel(
	input: CardActionInput,
	icon: CardActionIcon,
	title: string,
	description: string
): CardAction {
	return {
		tone: 'neutral',
		icon,
		title,
		description,
		primary: null,
		secondary: viewLink(input, true)
	};
}

/** "View application" or "View delegation", to the page the entry belongs to. */
function viewLink(input: CardActionInput, hasArrow: boolean): CardActionLink {
	const isDelegation = input.kind === 'delegation';

	return {
		label: isDelegation ? 'View delegation' : 'View application',
		href: isDelegation ? delegationUrl(input.entryId) : applicationUrl(input.entryId),
		look: 'outline',
		hasUploadIcon: false,
		hasArrow
	};
}

/** The same page as `viewLink`, named for somebody who already has a seat. */
function reviewAssignmentLink(input: CardActionInput): CardActionLink {
	return { ...viewLink(input, false), label: 'Review assignment' };
}

/** "Position paper due in 8 days", or the nearest thing to it when there is no deadline. */
function positionPaperTitle(dueIn: string | null): string {
	if (dueIn === null) {
		return 'Position paper required';
	}

	// `formatDueIn` writes a sentence of its own ("In 8 days"), so it is
	// lower-cased to sit at the end of this one.
	return `Position paper due ${dueIn.toLowerCase()}`;
}

/** The panel for an accepted application or delegation. */
function acceptedPanel(input: CardActionInput): CardAction {
	const paper = input.owedPositionPaper;

	// The paper can no longer be sent once its deadline has passed, so there is
	// no upload button to offer.
	if (paper !== null && paper.dueIn === 'Overdue') {
		return {
			tone: 'neutral',
			icon: 'clock',
			title: 'The position paper deadline has passed',
			description: 'Ask the organisers whether you can still send it.',
			primary: null,
			secondary: reviewAssignmentLink(input)
		};
	}

	if (paper !== null) {
		return {
			tone: 'info',
			icon: 'info',
			title: positionPaperTitle(paper.dueIn),
			description: 'Submit your position paper to complete your application.',
			primary: {
				label: 'Upload position paper',
				href: positionPaperUrl(input.conferenceSlug, paper.committeeSlug),
				look: 'primary',
				hasUploadIcon: true,
				hasArrow: false
			},
			secondary: reviewAssignmentLink(input)
		};
	}

	if (input.hasSeat) {
		return {
			tone: 'success',
			icon: 'check',
			title: "You're all set",
			description: 'Your seat is confirmed. See you at the conference.',
			primary: null,
			secondary: reviewAssignmentLink(input)
		};
	}

	const whoAssigns =
		input.kind === 'delegation'
			? 'Your head delegate will give you a committee and a country.'
			: 'The organisers will give you a committee and a country.';

	return quietPanel(input, 'clock', 'Waiting for your seat', whoAssigns);
}

/** The panel for an unsent draft, whether or not it can still be sent. */
function draftPanel(input: CardActionInput): CardAction {
	if (input.kind === 'delegation') {
		return quietPanel(
			input,
			'clock',
			'Not submitted yet',
			'Your delegation is still preparing its application.'
		);
	}

	if (!input.canFinish) {
		return quietPanel(
			input,
			'closed',
			'Applications have closed',
			'This draft can no longer be submitted.'
		);
	}

	return {
		tone: 'danger',
		icon: 'alert',
		title: 'Finish and submit your application before applications close.',
		description: null,
		primary: {
			label: 'Finish application',
			href: applyUrl(input.conferenceSlug),
			look: 'danger',
			hasUploadIcon: false,
			hasArrow: true
		},
		secondary: viewLink(input, false)
	};
}

/** The action panel for one card. */
export function cardAction(input: CardActionInput): CardAction {
	// Once the conference is over, "See you at the conference" or "Waiting for
	// your seat" would be untrue, and there is no place left to secure.
	if (input.isPast) {
		return quietPanel(
			input,
			'closed',
			'This conference has ended',
			'Your application stays here for reference.'
		);
	}

	// Money owed comes first: an unpaid invoice can cost the reader their place.
	if (input.unpaidInvoiceId !== null) {
		return {
			tone: 'danger',
			icon: 'alert',
			title: 'Confirm participation and complete payment to secure your place.',
			description: null,
			primary: {
				label: 'Complete next step',
				href: invoiceUrl(input.unpaidInvoiceId),
				look: 'danger',
				hasUploadIcon: false,
				hasArrow: true
			},
			secondary: viewLink(input, false)
		};
	}

	if (input.status === 'draft') {
		return draftPanel(input);
	}

	if (input.status === 'accepted') {
		return acceptedPanel(input);
	}

	// The mockup speaks for MUNMeet as "we" here, although `writing-style.md`
	// keeps "we" for marketing pages; the product owner's mockup wins
	// (`07-delivery/open-questions.md`, 30 Sep 2026).
	if (input.status === 'submitted') {
		return quietPanel(
			input,
			'clock',
			'No action required',
			"We'll notify you once a decision is made."
		);
	}

	if (input.status === 'waitlisted') {
		return quietPanel(
			input,
			'clock',
			"You're on the waiting list",
			"We'll notify you if a place opens up."
		);
	}

	if (input.status === 'rejected') {
		return quietPanel(input, 'closed', 'Not accepted', 'This application is closed.');
	}

	return quietPanel(input, 'closed', 'Withdrawn', 'This application was withdrawn.');
}
