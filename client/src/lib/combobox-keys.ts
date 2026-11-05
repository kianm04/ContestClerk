/**
 * What a key does in the console's seat combobox (`SeatCombobox`), the add
 * box of a speakers list and the "Raised by" and "Who" boxes
 * (`specs/05-pages/chair/gsl.md`, "Queue column"). The component asks here
 * and then does it, so the rules can be read and tested without a browser.
 */

import { firstChoosableIndex, type SeatOption } from '$lib/seat-search';

/** What a key press does in the box. */
export type ComboboxKeyAction =
	/** Open the list, which Escape had closed. */
	| 'open'
	/** Move the highlight down or up, past the options that cannot be chosen. */
	| 'highlightNext'
	| 'highlightPrevious'
	/** Choose the highlighted option, empty the box and keep the focus in it. */
	| 'choose'
	/** Close the list and stay in the box. */
	| 'close'
	/** Leave the box. */
	| 'leave'
	/** Start or pause the room's clock, as Space does everywhere else. */
	| 'pressClock';

/** What the box is doing when the key is pressed. */
export type ComboboxState = {
	isOpen: boolean;
	/** What is typed in the box. */
	query: string;
	/** Whether Space in the empty box is the clock's, as it is in a list's add box. */
	isSpaceForTheClock: boolean;
};

/**
 * What `key` (`KeyboardEvent.key`) does, or null for a key the box leaves to
 * the browser, such as a letter. ↓, ↑ and Enter open a closed list first.
 * The first Escape closes the list and a second leaves the box. Space in an
 * empty add box starts or pauses the clock, since an empty search has no use
 * for a space. Every action is one the browser must not also do its own way.
 */
export function comboboxKeyAction(key: string, box: ComboboxState): ComboboxKeyAction | null {
	if (key === 'ArrowDown') return box.isOpen ? 'highlightNext' : 'open';
	if (key === 'ArrowUp') return box.isOpen ? 'highlightPrevious' : 'open';
	if (key === 'Enter') return box.isOpen ? 'choose' : 'open';
	if (key === 'Escape') return box.isOpen ? 'close' : 'leave';

	const isEmptyBoxSpace = key === ' ' && box.query === '' && box.isSpaceForTheClock;

	return isEmptyBoxSpace ? 'pressClock' : null;
}

/**
 * The option Enter chooses: the one ↑ and ↓ moved the highlight to, while it
 * can still be chosen, or else the first option that can be (-1 for none).
 * `movedIndex` is null until the chair moves the highlight. A seat added
 * meanwhile, which now reads "in list", gives the highlight back to the first.
 */
export function highlightedIndex(options: SeatOption[], movedIndex: number | null): number {
	if (movedIndex !== null && options[movedIndex]?.isChoosable) return movedIndex;

	return firstChoosableIndex(options);
}
