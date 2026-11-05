<script lang="ts">
	// `goto` is SvelteKit's way to open an address from code, as a click on a
	// link does; its promise settles once the new page is on screen.
	import { goto } from '$app/navigation';
	import { keyTargetOf } from '$lib/chair-frame';
	import { KEY_SHORTCUTS, shortcutForKeyPress, type KeyView } from '$lib/console-keys';

	type Props = {
		/** The committee menu's "Keyboard shortcuts" switch. Off, only Space and Escape act. */
		isEnabled: boolean;
		/** The view whose own keys apply on this page (`keyView` in `$lib/console-keys.ts`). */
		view: KeyView;
		/** Whether a roll call vote is open, which makes Y, N, A and P answer it. */
		isRollCallVoteOpen: boolean;
		/** "?" asks for the committee menu at its list of keys. */
		onShowKeyList: () => void;
	};

	let { isEnabled, view, isRollCallVoteOpen, onShowKeyList }: Props = $props();

	/** The selected view is drawn inside the console's `<main>`; the frame is everything around it. */
	const VIEW_ID = 'main';

	/** Whether a button or link can be pressed: not disabled, and not waiting for the server. */
	function isUsable(element: HTMLElement): boolean {
		return !element.matches(':disabled') && element.getAttribute('aria-disabled') !== 'true';
	}

	/**
	 * The first usable element inside `root` that declares `shortcut` in its
	 * `aria-keyshortcuts`. `~=` matches one word of the attribute, since an
	 * element may declare two keys, as the Motions tab's "2 M" does. The values
	 * are the plain words of `KEY_SHORTCUTS`, which need no escaping in quotes.
	 */
	function declaringElement(root: ParentNode | null, shortcut: string): HTMLElement | null {
		if (root === null) return null;

		const candidates = root.querySelectorAll<HTMLElement>(`[aria-keyshortcuts~="${shortcut}"]`);

		return Array.from(candidates).find(isUsable) ?? null;
	}

	/** A text field, such as the list's add box, takes the cursor; anything else is clicked. */
	function press(element: HTMLElement) {
		const isTextField = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';

		if (isTextField) element.focus();
		else element.click();
	}

	/**
	 * M opens Motions with the cursor in "Raised by" (`committee-room.md`,
	 * "Keys"). On Motions, "Raised by" declares M itself; from any other page
	 * the frame's Motions tab is what declares it, so the tab's address is
	 * opened and, once Motions is on screen, M is pressed again there.
	 */
	async function openMotionsAtRaisedBy(tab: HTMLAnchorElement) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- the Motions tab's own address, which `chairPageUrl` built with `resolve()`
		await goto(tab.href);

		const raisedBy = declaringElement(document.getElementById(VIEW_ID), KEY_SHORTCUTS.motions);

		if (raisedBy !== null) press(raisedBy);
	}

	/*
		Every key press of the chair console comes here. `$lib/console-keys.ts`
		decides from plain facts whether the press is a shortcut, and which
		`aria-keyshortcuts` value it presses. Then the element that declares that
		value is clicked, first inside the selected view and then in the frame,
		so a key goes through its button's own form and instant press exactly as
		a click does, and a key the view declares wins over the frame's.

		This is the one place the console talks to the page directly, with
		`document.querySelector`, rather than through props: a key can press any
		button on the page, wherever it is drawn, so no component could hand them
		all here. A held key repeats its press many times a second, so a repeat is
		ignored, or holding Space would start and stop the clock over and over.
	*/
	function handleKeydown(event: KeyboardEvent) {
		if (event.repeat || event.isComposing) return;

		// With nothing focused the browser names the body, which `keyTargetOf` reads as null.
		const focused = document.activeElement === document.body ? null : document.activeElement;
		const match = shortcutForKeyPress({
			key: event.key,
			hasModifier: event.ctrlKey || event.metaKey || event.altKey,
			isAlreadyHandled: event.defaultPrevented,
			target: keyTargetOf(focused),
			view,
			isRollCallVoteOpen,
			areShortcutsOn: isEnabled
		});

		if (match === null) return;

		if (match.shortcut === KEY_SHORTCUTS.keyList) {
			event.preventDefault();
			onShowKeyList();
			return;
		}

		const inView = declaringElement(document.getElementById(VIEW_ID), match.shortcut);
		const inFrame = match.searchesFrame ? declaringElement(document, match.shortcut) : null;
		const element = inView ?? inFrame;

		if (element === null) return;

		event.preventDefault();

		if (match.shortcut === KEY_SHORTCUTS.motions && element instanceof HTMLAnchorElement) {
			openMotionsAtRaisedBy(element);
			return;
		}

		press(element);
	}
</script>

<!--
	Draws nothing. `<svelte:window onkeydown>` listens for keys on the whole
	window, and Svelte removes the listener when the chair leaves the console.
	Without JavaScript there are no keys, and every button still works.
-->
<svelte:window onkeydown={handleKeydown} />
