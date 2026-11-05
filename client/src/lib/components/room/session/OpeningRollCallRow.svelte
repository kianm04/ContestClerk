<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ResolvedPathname } from '$app/types';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Check from '@lucide/svelte/icons/check';
	import Button from '$lib/components/Button.svelte';
	import { FROM_VIEW_FIELD, type ChairPage } from '$lib/live-mode';
	import { rollCallDoneText, type OpeningRollCall } from '$lib/room-opening';
	import TextLink from './TextLink.svelte';

	type Props = {
		/** The session's roll call with its counts, or null before its first. */
		rollCall: OpeningRollCall | null;
		/** The roll call view's `markAllPresent`, which gets or makes the session's roll call (R2). */
		markAllPresentAction: string;
		/** The roll call view, opened from this page. */
		rollCallHref: ResolvedPathname;
		/** The page the band is on, where "Mark all present" brings the chair back to. */
		fromView: ChairPage;
		/** Sends the press through the roll call's instant form, so the row ticks off at once. */
		onSubmit: SubmitFunction;
	};

	let { rollCall, markAllPresentAction, rollCallHref, fromView, onSubmit }: Props = $props();
</script>

<!--
	The band's roll call row: a label in the grid's second column, the step in
	its third. Before any roll call, "Mark all present", the screen's one filled
	button (P1), and "Take it seat by seat"; once one exists, "✓ 6 of 6 present ·
	quorum met" and "Edit". "no quorum" stays in plain ink: the roll is still
	being taken (P4). The form names no roll call, so the server uses the
	session's, or makes it (R2), and `fromView` brings the chair back here.
-->
<span class="text-ink-600 max-md:self-start max-md:pt-2.5">Roll call</span>
<div class="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1">
	{#if rollCall}
		<span class="inline-flex items-center gap-2">
			<Check size={18} strokeWidth={2} class="text-success-700" aria-hidden="true" />
			{rollCallDoneText(rollCall)}
		</span>
		<TextLink href={rollCallHref} label="Edit" />
	{:else}
		<form method="post" action={markAllPresentAction} use:enhance={onSubmit}>
			<input type="hidden" name={FROM_VIEW_FIELD} value={fromView} />
			<Button label="Mark all present" variant="primary" />
		</form>
		<TextLink href={rollCallHref} label="Take it seat by seat" />
	{/if}
</div>
