<script lang="ts">
	import type { ResolvedPathname } from '$app/types';

	type Props = {
		/** The item's words: "To the chair", "Move up", "Reset clock". */
		label: string;
		/** Quieter words at the right, such as "ends the speech". */
		meta?: string;
		/** When given, the item is a link to this page instead of a button. */
		href?: ResolvedPathname;
		/** The form action the button posts to, such as `?/moveUp`. */
		formaction?: string;
		/** A field the button sends with its action, such as which entry to move. */
		name?: string;
		value?: string;
		/** Drawn grey and not pressable, as "Move up" on the first row is. */
		isDisabled?: boolean;
	};

	let { label, meta, href, formaction, name, value, isDisabled = false }: Props = $props();

	// The look of every item, written once so the link and the button match.
	const ITEM_CLASSES =
		'flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left whitespace-nowrap text-ink-900 hover:bg-neutral-100 disabled:text-ink-400 disabled:hover:bg-transparent max-md:min-h-11';
</script>

<!--
	One item of a console menu: a link, or a submit button of the menu's form
	that posts to its own `formaction`, so a menu works without JavaScript.
-->
{#if href}
	<a {href} class={ITEM_CLASSES}>{label}</a>
{:else}
	<button type="submit" {formaction} {name} {value} disabled={isDisabled} class={ITEM_CLASSES}>
		<span>{label}</span>
		{#if meta}
			<span class="ml-auto pl-6 text-small text-ink-600">{meta}</span>
		{/if}
	</button>
{/if}
