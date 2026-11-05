import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHORTCUTS_STORAGE_KEY } from '$lib/chair-frame';
import { createShortcutsSetting } from '$lib/console-shortcuts.svelte';

afterEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
});

describe('createShortcutsSetting', () => {
	it('starts on, and stays on with nothing remembered', () => {
		const shortcuts = createShortcutsSetting();
		shortcuts.readRemembered();

		expect(shortcuts.isOn).toBe(true);
	});

	it('remembers the switch in this browser, so a reload keeps it', () => {
		const first = createShortcutsSetting();
		first.toggle();

		expect(first.isOn).toBe(false);
		expect(localStorage.getItem(SHORTCUTS_STORAGE_KEY)).toBe('off');

		const afterReload = createShortcutsSetting();
		afterReload.readRemembered();
		expect(afterReload.isOn).toBe(false);

		afterReload.toggle();
		expect(afterReload.isOn).toBe(true);
	});

	it('still switches when the browser refuses storage', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('refused');
		});
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('refused');
		});
		const shortcuts = createShortcutsSetting();

		shortcuts.readRemembered();
		shortcuts.toggle();

		expect(shortcuts.isOn).toBe(false);
	});

	it('counts each ask for the list of keys', () => {
		const shortcuts = createShortcutsSetting();

		shortcuts.askForKeyList();
		shortcuts.askForKeyList();

		expect(shortcuts.keyListRequestCount).toBe(2);
	});
});
