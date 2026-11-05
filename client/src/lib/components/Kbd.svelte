<script lang="ts">
	import { keyHint } from '$lib/console-keys';

	type Props = {
		/** The key as `aria-keyshortcuts` names it: "N", "Space" or "Plus" (`$lib/console-keys.ts`). */
		keyName: string;
	};

	let { keyName }: Props = $props();
</script>

<!--
	The key a button of the chair console answers to, in the quiet `kbd` style of
	`03-design/session-redesign/visual-language.md`, "Keys on buttons". This is
	how a chair learns the keys without reading a list.

	It floats over the top right corner of the button, so showing it never
	changes the button's width. It is not drawn at all until the button is
	hovered or has the keyboard focus, so a hint at the edge of the window
	cannot widen the page while it waits: the button carries Tailwind's named
	group `group/key`, and `group-hover/key:` and `group-focus-visible/key:`
	read the hover and focus of that button only, not of a row around it. A
	touch screen has no keys to learn, so `[@media(hover:none)]` leaves it out.

	`aria-hidden`: the button's own `aria-keyshortcuts` already tells a screen
	reader about the key, and the hint must not become part of its name.
-->
<kbd
	aria-hidden="true"
	class="pointer-events-none absolute -top-2.5 -right-1.5 z-10 hidden min-w-5 rounded border border-line bg-neutral-100 px-1.5 py-0.5 text-center font-sans text-small leading-none font-medium text-ink-600 group-hover/key:inline-block group-focus-visible/key:inline-block [@media(hover:none)]:hidden"
>
	{keyHint(keyName)}
</kbd>
