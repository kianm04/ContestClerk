/*
	Signing a draft resolution or a committee directive
	(docs/committee-papers.md, sections 5 and 6): its authors open it for
	signatures, any other seat of the committee then signs it, and the page's
	one main button is the next of these steps for whoever reads it. Once the
	paper is open its authors' main button is "Submit to the dais", so
	"Close signatures" is a quiet link under the signatories instead.

	This file is plain TypeScript with no Svelte in it, so the browser and the
	server both use it.
*/

import { formatTimeOfDay } from '$lib/dates';

/** Where the paper stands on signing, for the reader. */
export type SigningState = {
	/** True while the paper takes signatures. */
	isOpen: boolean;
	/** When it was opened, or `null` while it is not open. */
	openedAt: string | null;
	/** True for one of its authors, who opens and closes it. */
	isAuthor: boolean;
	/** The reader's seat, which signs, or `null` for a reader with none. */
	mySeatName: string | null;
	/** True once the reader's seat has signed. */
	hasSigned: boolean;
	/**
	 * True while the paper is being written, before it is first submitted or
	 * after the dais returns it: a signatory may take their signature off
	 * then, even while it takes no new ones (section 3, rule 5).
	 */
	isBeingWritten: boolean;
};

/** The form actions on the paper's page that change who signs it. */
export type SigningAction = 'openSignatures' | 'closeSignatures' | 'sign' | 'removeSignature';

/** The button in the title row. */
export type SigningButton = {
	action: SigningAction;
	label: string;
	/** True for the page's one dark-blue button; otherwise it is an outline button. */
	isPrimary: boolean;
};

/**
 * The title row's button: an author opens the paper; anybody else with a
 * seat signs it while it is open, or takes their signature back while it is
 * being written. `null` for a reader with nothing to do here, which includes
 * an author of an open paper, who closes it under the signatories
 * (`closeSignaturesNote`).
 */
export function signingButton(state: SigningState): SigningButton | null {
	if (state.isAuthor) {
		return state.isOpen
			? null
			: { action: 'openSignatures', label: 'Open for signatures', isPrimary: true };
	}

	if (state.mySeatName === null) return null;

	if (state.hasSigned) {
		return state.isBeingWritten
			? { action: 'removeSignature', label: 'Remove my signature', isPrimary: false }
			: null;
	}

	return state.isOpen
		? { action: 'sign', label: `Sign as ${state.mySeatName}`, isPrimary: true }
		: null;
}

/**
 * The line above "Close signatures", for an author of an open paper: "Open
 * for signatures since 17:05.", in the conference's own time. `null` for
 * anybody else, who has no "Close signatures".
 */
export function closeSignaturesNote(state: SigningState, timeZone: string): string | null {
	if (!state.isAuthor || !state.isOpen) return null;
	if (state.openedAt === null) return 'Open for signatures.';

	return `Open for signatures since ${formatTimeOfDay(state.openedAt, timeZone)}.`;
}

/** Who may see the paper, for the line under its title: "Open for signatures", "Private to the authors". */
export function signingStateWord(isOpen: boolean): string {
	return isOpen ? 'Open for signatures' : 'Private to the authors';
}

/** The toast once the reader has done what the button said. */
export function signingMessage(action: SigningAction, title: string): string {
	switch (action) {
		case 'openSignatures':
			return `“${title}” is open for signatures.`;
		case 'closeSignatures':
			return `“${title}” no longer takes signatures.`;
		case 'sign':
			return `You signed “${title}”.`;
		case 'removeSignature':
			return `Your signature is off “${title}”.`;
	}
}

/** Everything a draft's page says about signing, worked out at once. */
export type SigningView = {
	isOpen: boolean;
	/** The title row's button, from `signingButton`. */
	button: SigningButton | null;
	/** The line under the title's word for who may see it, from `signingStateWord`. */
	stateWord: string;
	/** The line over "Close signatures", from `closeSignaturesNote`. */
	closeNote: string | null;
};

/** What the page shows of signing, for the reader. */
export function signingView(state: SigningState, timeZone: string): SigningView {
	return {
		isOpen: state.isOpen,
		button: signingButton(state),
		stateWord: signingStateWord(state.isOpen),
		closeNote: closeSignaturesNote(state, timeZone)
	};
}
