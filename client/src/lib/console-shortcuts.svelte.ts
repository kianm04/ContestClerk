/**
 * The chair console's "Keyboard shortcuts" switch, remembered in this
 * browser, and the "?" key's request for the list of keys
 * (`05-pages/chair/committee-room.md`, "Keys"). The chair layout makes one and
 * hands it to `ShortcutKeys` and `CommitteeMenu`, the two that use it.
 *
 * The file name ends in `.svelte.ts` so that `$state` works in it: whatever
 * reads `isOn` or `keyListRequestCount` is redrawn when they change.
 */

import {
	SHORTCUTS_STORAGE_KEY,
	readShortcutsSetting,
	shortcutsSettingValue
} from '$lib/chair-frame';

export type ShortcutsSetting = {
	/** Whether the single-character keys act. On until the chair switches them off. */
	readonly isOn: boolean;
	/** How many times "?" has asked for the list of keys; each ask opens the committee menu at it. */
	readonly keyListRequestCount: number;
	/** Read the switch this browser remembered. Call it once the page runs in the browser. */
	readRemembered: () => void;
	/** Flip the switch, and remember it in this browser. */
	toggle: () => void;
	/** "?" was pressed. */
	askForKeyList: () => void;
};

/**
 * A fresh switch, on. `localStorage` can be missing or refuse (a private
 * window, blocked site data), so every use of it is guarded and the switch
 * then simply holds until the page reloads.
 */
export function createShortcutsSetting(): ShortcutsSetting {
	let isOn = $state(true);
	let keyListRequestCount = $state(0);

	function readRemembered() {
		try {
			isOn = readShortcutsSetting(localStorage.getItem(SHORTCUTS_STORAGE_KEY));
		} catch {
			isOn = true;
		}
	}

	function toggle() {
		isOn = !isOn;

		try {
			localStorage.setItem(SHORTCUTS_STORAGE_KEY, shortcutsSettingValue(isOn));
		} catch {
			// Storage is refused: the switch holds until the page reloads.
		}
	}

	function askForKeyList() {
		keyListRequestCount += 1;
	}

	return {
		get isOn() {
			return isOn;
		},
		get keyListRequestCount() {
			return keyListRequestCount;
		},
		readRemembered,
		toggle,
		askForKeyList
	};
}
