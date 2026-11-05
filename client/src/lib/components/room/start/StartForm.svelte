<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { Snippet } from 'svelte';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import { lineAboveStartButton } from '$lib/mode-start';

	type Props = {
		/** "Start a moderated caucus". */
		title: string;
		/** The form action it posts to, such as `?/startModerated`. */
		action: string;
		/** The one filled button: "Start caucus" or "Give the floor". */
		buttonLabel: string;
		/** Motions, when the foot says "To put it to a vote first, record it in Motions."; else null. */
		motionsHref: ResolvedPathname | null;
		/** The foot's own sentence when it does not point to Motions, or null. */
		note: string | null;
		/** What starting will end ("the unmoderated caucus"), or null when it ends nothing. */
		endedName: string | null;
		/** Why the button is disabled ("Close the open vote first."), or null when it can be pressed. */
		blockedReason: string | null;
		/** Sends the start through the chair's instant form (`$lib/chair-form.ts`). */
		onSubmit: SubmitFunction;
		/** The form's fields, written between this component's tags. */
		children: Snippet;
	};

	let {
		title,
		action,
		buttonLabel,
		motionsHref,
		note,
		endedName,
		blockedReason,
		onSubmit,
		children
	}: Props = $props();

	// The one line above the button: why it is disabled, or else what starting ends.
	const lineAboveButton = $derived(lineAboveStartButton(blockedReason, endedName));
</script>

<!--
	A view's start form, shown while its mode is not running: the title, the
	fields (the `children` written between the tags), and the foot with a
	quiet sentence and the one filled button. It is inline, never a dialog,
	and a plain form that posts without JavaScript. `use:enhance` sends it in
	the background once JavaScript has loaded, so the running view is drawn
	at the press.
-->
<form
	method="post"
	{action}
	use:enhance={onSubmit}
	autocomplete="off"
	class="flex w-full max-w-190 flex-col gap-5 px-8 py-10 max-md:px-4 max-md:py-5"
>
	<h2 class="font-display text-h1 max-md:text-h1-mobile">{title}</h2>

	<div class="mt-1 flex flex-col gap-4">
		{@render children()}
	</div>

	<div
		class="flex items-center justify-between gap-4 border-t border-line pt-5 max-md:flex-col max-md:items-stretch"
	>
		<p class="text-small text-ink-600">
			{#if motionsHref}
				To put it to a vote first, record it in
				<a href={motionsHref} class="font-medium text-brand-700 hover:underline">Motions</a>.
			{:else}
				{note}
			{/if}
		</p>
		<div class="flex flex-col items-end gap-2 max-md:items-stretch">
			{#if lineAboveButton}
				<p class="text-small text-ink-600">{lineAboveButton}</p>
			{/if}
			<button
				type="submit"
				disabled={blockedReason !== null}
				class="h-14 min-w-45 rounded-control bg-brand-900 px-6 font-medium text-surface hover:bg-brand-800 disabled:bg-neutral-100 disabled:text-ink-400"
			>
				{buttonLabel}
			</button>
		</div>
	</div>
</form>
