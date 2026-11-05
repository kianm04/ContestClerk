<script lang="ts">
	import { OUTLINED_BUTTON_CLASSES } from '$lib/console-buttons';
	import Kbd from '$lib/components/Kbd.svelte';

	type Props = {
		/** The words on the button: "Pause", "+15 s", "End speech". */
		label: string;
		/** Shorter words for a phone, where five controls share one row: "End". */
		shortLabel?: string;
		/** The `id` of the form the button sends, which sits elsewhere on the page. */
		form: string;
		/** The form action it posts to, such as `?/timerPause`. */
		formaction: string;
		/** The key that presses it, as `aria-keyshortcuts` names it: "Space", "Plus", "E". */
		keyShortcut: string;
		isDisabled?: boolean;
		/** Width classes, for the clock button's one fixed width. */
		widthClasses?: string;
	};

	let {
		label,
		shortLabel,
		form,
		formaction,
		keyShortcut,
		isDisabled = false,
		widthClasses = ''
	}: Props = $props();
</script>

<!--
	One of the floor's speech controls: 48px tall, 44px on a phone. The `form`
	attribute makes it a submit button of a form elsewhere on the page, so the
	controls can sit in one row with the Yield and "⋯" menus between them while
	every press still goes through one form. `aria-keyshortcuts` names its key,
	which `ShortcutKeys` presses it for and a screen reader announces; `Kbd`
	shows the key over its corner on hover and focus. `group/key` is the name
	`Kbd` reads that hover and focus from. Its look is the console's outlined
	button (`$lib/console-buttons.ts`).
-->
<button
	type="submit"
	{form}
	{formaction}
	aria-keyshortcuts={keyShortcut}
	disabled={isDisabled}
	aria-label={shortLabel ? label : undefined}
	class="{OUTLINED_BUTTON_CLASSES} group/key relative h-12 max-md:h-11 max-md:px-2 {widthClasses}"
>
	{#if shortLabel}
		<span class="max-md:hidden">{label}</span>
		<span class="md:hidden">{shortLabel}</span>
	{:else}
		{label}
	{/if}
	<Kbd keyName={keyShortcut} />
</button>
