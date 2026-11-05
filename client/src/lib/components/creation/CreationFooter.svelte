<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import type { ResolvedPathname } from '$app/types';
	import type { AutosaveStatus } from '$lib/autosave-form.svelte';
	import { Button } from '$lib/components/ui/button';
	import SaveStatus from './SaveStatus.svelte';

	type Props = {
		/** What the autosave is doing; `none` on a page with nothing saved yet, which says nothing. */
		status: AutosaveStatus | 'none';
		/** When the draft was last stored, ISO. */
		savedAt: string | null;
		/** The page's "now", ISO, which "2 minutes ago" counts from. */
		now: string;
		/** The conference's timezone, for a save old enough to be written as a date. */
		timezone?: string;
		/** The step before, drawn as an outline "Back" link. */
		backHref?: ResolvedPathname;
		/** The words on the one primary button, such as "Continue to basics". */
		primaryLabel: string;
		/** The `id` of the form the primary button sends. */
		primaryForm?: string;
		/** Where the primary button goes, when it is a link rather than a form's button. */
		primaryHref?: ResolvedPathname;
		/** While that form is on its way, from `createInPlaceForm()`. */
		isPrimaryBusy?: boolean;
		/** Until there is something to continue with, such as an organisation. */
		isPrimaryDisabled?: boolean;
		/** A quiet way out, such as "Cancel" back to the list of conferences. */
		exitHref?: ResolvedPathname;
		exitLabel?: string;
		/** `link` draws the way out as quiet underlined text ("Save draft and exit"), `button` as an outline button ("Cancel"). */
		exitStyle?: 'link' | 'button';
		/** `roomy` on the first three steps (a 70 pixel bar), `dense` on Setup and Launch (48), as the designs draw it. */
		density?: 'roomy' | 'dense';
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let {
		status,
		savedAt,
		now,
		timezone,
		backHref,
		primaryLabel,
		primaryForm,
		primaryHref,
		isPrimaryBusy = false,
		isPrimaryDisabled = false,
		exitHref,
		exitLabel = 'Cancel',
		exitStyle = 'button',
		density = 'roomy'
	}: Props = $props();

	/* The design's pixels for the two sizes of the bar. Written out in full so Tailwind can find the classes. */
	const SIZES = {
		roomy: {
			bar: 'lg:h-17.5 lg:pr-12 lg:pl-12.5',
			group: 'gap-3.5',
			button: 'h-11 px-5.5 fs-17 lh-22',
			primary: 'gap-3.5',
			icon: 'size-5'
		},
		dense: {
			bar: 'lg:h-12 lg:pr-11.5 lg:pl-11.75',
			group: 'gap-2.25',
			button: 'h-8.75 px-5 fs-13 lh-16',
			primary: 'gap-3.5 px-4.5',
			icon: 'size-4.5'
		}
	};
	const size = $derived(SIZES[density]);

	/* The design's two buttons: white with a hairline, and the filled blue. shadcn's `Button` brings the shape; these bring the design's size and colours. */
	const OUTLINE_CLASSES =
		'rounded-md border-creation-button-border bg-white font-medium text-creation-cancel hover:bg-creation-field hover:text-creation-cancel max-lg:min-h-11';
	const PRIMARY_CLASSES = 'rounded-md font-semibold hover:bg-creation-blue-hover max-lg:min-h-11';
</script>

<!--
	The white bar along the bottom of every creation step, as the designs draw
	it: whether the draft is saved at the left, the way out, back and on at the
	right. `mt-auto` takes it to the bottom of the window (the step is a flex
	column that fills the height under the top bar); `sticky bottom-0` keeps it
	in view on the one step that may be taller than a short window.
-->
<div
	class="creation-footer sticky bottom-0 z-10 mt-auto flex w-full flex-wrap items-center justify-between gap-2 border-t border-creation-rule bg-white px-4 py-2 lg:flex-nowrap lg:py-0 {size.bar}"
>
	<SaveStatus {status} {savedAt} {now} {timezone} {density} />

	<div class="flex flex-wrap items-center {size.group}">
		{#if exitHref && exitStyle === 'link'}
			<Button
				variant="link"
				class="px-0 font-medium text-creation-blue underline max-lg:min-h-11 {size.button}"
				href={exitHref}
			>
				{exitLabel}
			</Button>
		{:else if exitHref}
			<Button variant="outline" class="{OUTLINE_CLASSES} {size.button}" href={exitHref}>
				{exitLabel}
			</Button>
		{/if}
		{#if backHref}
			<Button variant="outline" class="{OUTLINE_CLASSES} {size.button}" href={backHref}>Back</Button
			>
		{/if}
		<!-- With `href` the button is a link; without, it sends the form named by `form`. -->
		<Button
			variant="default"
			class="{PRIMARY_CLASSES} {size.button} {size.primary}"
			href={primaryHref}
			type={primaryHref ? undefined : 'submit'}
			form={primaryForm}
			disabled={isPrimaryDisabled || isPrimaryBusy}
			aria-busy={isPrimaryBusy}
		>
			{primaryLabel}
			<!-- Sized by class: shadcn's button sizes any icon without one to 16 pixels. -->
			<ArrowRight class={size.icon} aria-hidden="true" />
		</Button>
	</div>
</div>

<style>
	/*
		Keep whatever the keyboard or a link scrolls to clear of this bar: it
		sticks to the bottom of the window, so without room kept for it a
		focused field can sit hidden underneath. `scroll-padding` belongs on the
		page's scroller, `<html>`, which only `:global` reaches from here, and
		`:has` keeps it to the pages that show the bar. On a phone the bar wraps
		to three lines, so it keeps more room there.
	*/
	:global(html:has(.creation-footer)) {
		scroll-padding-bottom: 4rem;
	}

	@media (width < 40rem) {
		:global(html:has(.creation-footer)) {
			scroll-padding-bottom: 12rem;
		}
	}
</style>
