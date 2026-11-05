<script lang="ts">
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { ResolvedPathname } from '$app/types';
	import { Button } from '$lib/components/ui/button';
	import { creationClasses } from '$lib/creation-classes';

	type Props = {
		/** The primary button's verb, such as "Add committee". */
		submitLabel: string;
		closeHref: ResolvedPathname;
		isBusy: boolean;
		/** Where Delete leads, for an existing row; left out when there is nothing to delete. */
		deleteHref?: ResolvedPathname;
		/** The id of the form the button sends, when the button sits outside it. */
		form?: string;
		/**
		 * `split` puts Cancel at the left and the primary button at the right, as
		 * the committee designs draw it; `end` keeps the pair together on the
		 * right, as the other dialogs do. Delete, when there is one, is always
		 * at the left.
		 */
		layout?: 'split' | 'end';
		/** The row's distance above and gap in the design's pixels, when not `mt-5` and `gap-3`. */
		class?: string;
		/** The buttons' size when not 40 pixels tall with 14 pixel words, such as `h-10.5 fs-15`. */
		buttonClass?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let {
		submitLabel,
		closeHref,
		isBusy,
		deleteHref,
		form,
		layout = 'split',
		class: className,
		buttonClass
	}: Props = $props();

	/* The design's two buttons: white with a hairline, and the filled blue. shadcn's `Button` brings the shape; these bring the design's size and colours. */
	const OUTLINE_CLASSES =
		'h-10 rounded-md border-creation-button-border bg-white px-5 fs-14 lh-20 font-medium text-creation-cancel hover:bg-creation-field hover:text-creation-cancel max-lg:min-h-11';
	const PRIMARY_CLASSES =
		'h-10 rounded-md px-5 fs-14 lh-20 font-semibold hover:bg-creation-blue-hover max-lg:min-h-11';
</script>

<!--
	The bottom row every Setup dialog shares, as the designs draw it: plain
	space, no band and no rule. Delete opens its own confirming dialog, so it is
	an outline link in the design's red, not a filled red button.
-->
<div
	class={creationClasses(
		'mt-5 flex flex-wrap items-center gap-3',
		layout === 'split' ? 'justify-between' : 'justify-end',
		className
	)}
>
	{#if deleteHref || layout === 'split'}
		<div class="flex flex-wrap items-center gap-3">
			{#if deleteHref}
				<Button
					variant="outline"
					href={deleteHref}
					class={creationClasses(
						OUTLINE_CLASSES,
						'gap-2 text-creation-red hover:text-creation-red',
						buttonClass
					)}
				>
					<Trash2 class="size-4.5" aria-hidden="true" />
					Delete
				</Button>
			{/if}
			{#if layout === 'split'}
				<Button
					variant="outline"
					href={closeHref}
					class={creationClasses(OUTLINE_CLASSES, buttonClass)}>Cancel</Button
				>
			{/if}
		</div>
	{/if}
	<div class="flex flex-wrap items-center gap-3">
		{#if layout === 'end'}
			<Button
				variant="outline"
				href={closeHref}
				class={creationClasses(OUTLINE_CLASSES, buttonClass)}>Cancel</Button
			>
		{/if}
		<Button
			type="submit"
			{form}
			class={creationClasses(PRIMARY_CLASSES, buttonClass)}
			disabled={isBusy}
		>
			{submitLabel}
		</Button>
	</div>
</div>
