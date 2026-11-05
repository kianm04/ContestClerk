/**
 * What happens when a writer leaves the paper page with text not yet stored.
 * `PaperDraftFields` and `LivePaperDraftFields` both take this same care, so
 * it is written once here.
 */

// `beforeNavigate` runs just before the writer leaves the page or reloads it.
import { beforeNavigate } from '$app/navigation';

/** What the browser asks when the last save failed or a clash is waiting. */
export const LEAVE_WARNING = 'Your draft has not been saved. Leave this page anyway?';

/** The part of a draft's saving that leaving the page needs to know about. */
export type LeaveGuardedSave = {
	/** True while the text on screen is newer than the text stored. */
	hasUnsavedText: boolean;
	/** True when saving on the way out cannot be trusted to work, so the writer must be asked. */
	isAtRisk: boolean;
	saveNow: () => Promise<unknown>;
};

/**
 * Save the draft, or ask, before the writer leaves. Going to another page or
 * tab saves it first, and asks when saving cannot work. Closing or reloading
 * the tab cannot wait for a save, so `cancel()` makes the browser ask. A
 * form's answer moves on with `goto`, after a submit that already sent the
 * text, so there is nothing to save then. Nor is there when the address
 * changes but the page stays, as it does when "Add an author" opens its
 * dialog (`?add=1`): the editor stays on screen and goes on saving.
 *
 * Call it while the component starts, like `onMount`. `save` is read when the
 * writer leaves, not now, so it may be `null` while the server draws the page
 * and the saving has not started yet.
 */
export function saveOrAskBeforeLeaving(save: LeaveGuardedSave | null): void {
	beforeNavigate((navigation) => {
		if (!save?.hasUnsavedText || navigation.type === 'goto') return;
		// Closing the tab has no `to`, so it is never mistaken for staying.
		if (navigation.to?.url.pathname === navigation.from?.url.pathname) return;

		if (navigation.type === 'leave') {
			navigation.cancel();
		} else if (save.isAtRisk && !confirm(LEAVE_WARNING)) {
			navigation.cancel();
			return;
		}

		void save.saveNow();
	});
}
