<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Button from '$lib/components/Button.svelte';

	type Props = {
		/** Whether a person may apply on their own. */
		acceptsIndividuals: boolean;
		/** Whether a school or club may register a delegation. */
		acceptsDelegations: boolean;
		/** Where "Apply as a delegate" goes, worked out by the page. */
		applyHref: ResolvedPathname;
		/** Where "Register a delegation" goes, worked out by the page. */
		registerDelegationHref: ResolvedPathname;
		/** The phone's bottom bar, which has room for one button and a link. */
		isCompact: boolean;
	};

	let {
		acceptsIndividuals,
		acceptsDelegations,
		applyHref,
		registerDelegationHref,
		isCompact
	}: Props = $props();

	/*
		On a phone "Register a delegation" is a plain link under the one filled
		button, so the bar stays small. With no apply button above it, it stays a
		button, because a bar holding nothing but a link would hide the one thing
		there is to press.
	*/
	const isDelegationALink = $derived(isCompact && acceptsIndividuals);
</script>

<!--
	The two ways to take part, each with a line saying who it is for
	(`05-pages/public/conference.md`, "Two ways to take part, told apart").
	`w-full` makes each group as wide as the card, so its button fills it.
-->
{#if acceptsIndividuals}
	<div class="flex w-full flex-col gap-2">
		{#if !isCompact}
			<p class="text-label text-ink-600 uppercase">On your own</p>
		{/if}

		<Button label="Apply as a delegate" variant="primary" href={applyHref} isFullWidth />
	</div>
{/if}

{#if acceptsDelegations && isDelegationALink}
	<p class="text-small text-ink-600">
		With a school or club?
		<!-- `min-h-11` keeps the link as easy to tap as a button. -->
		<a
			href={registerDelegationHref}
			class="flex min-h-11 items-center text-body text-brand-700 hover:underline"
		>
			Register a delegation
		</a>
	</p>
{:else if acceptsDelegations}
	<div class="flex w-full flex-col gap-2">
		<p class="text-label text-ink-600 uppercase">With your school or club</p>
		<p class="text-small text-ink-600">
			One person registers the group and shares a join code with the others.
		</p>

		<Button
			label="Register a delegation"
			variant="secondary"
			href={registerDelegationHref}
			isFullWidth
		/>
	</div>
{/if}
