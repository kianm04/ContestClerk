<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Check from '@lucide/svelte/icons/check';
	import Button from '$lib/components/Button.svelte';

	type Props = {
		/** The committee's topics, in the organiser's order. */
		topics: string[];
		/** The topic under debate, or null while the agenda is not set. */
		agendaTopic: string | null;
		/** The live room's `setAgenda`, naming the page the chair is on. */
		setAgendaAction: string;
		/** This page with the agenda menu open (`?agenda=change`), behind "Change" and "Add a topic". */
		changeAgendaHref: string;
		/** Sends the press through the chair's instant form, so the row ticks off at once. */
		onSubmit: SubmitFunction;
	};

	let { topics, agendaTopic, setAgendaAction, changeAgendaHref, onSubmit }: Props = $props();

	/* "Change" looks like every other link of the band (`TextLink`). */
	const CHANGE_LINK_CLASSES =
		'inline-flex items-center font-medium text-brand-700 hover:underline max-md:min-h-11';
</script>

<!--
	The band's agenda row: one outlined button per topic, so one press sets the
	agenda, and none of them is ever the filled one (P1). It is one form whose
	buttons each send their own `topic`: whichever is pressed is the one sent.
	Once set, "✓ {topic}" and "Change", which opens the top bar's agenda menu.
	A committee with no topics has nothing to choose, so the band draws no row;
	a quick session's has "Add a topic" instead, which opens the same menu.
-->
<span class="text-ink-600 max-md:self-start max-md:pt-2.5">Agenda</span>
<div class="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1">
	{#if agendaTopic !== null}
		<span class="inline-flex min-w-0 items-center gap-2">
			<Check size={18} strokeWidth={2} class="shrink-0 text-success-700" aria-hidden="true" />
			{agendaTopic}
		</span>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- this page with `?agenda=change` (`pageWithQuery`), built from its own address, so there is no route for `resolve()` to build -->
		<a href={changeAgendaHref} class={CHANGE_LINK_CLASSES}>Change</a>
	{:else if topics.length === 0}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- this page with `?agenda=change` (`pageWithQuery`), built from its own address, so there is no route for `resolve()` to build -->
		<a href={changeAgendaHref} class={CHANGE_LINK_CLASSES}>Add a topic</a>
	{:else}
		<form
			method="post"
			action={setAgendaAction}
			use:enhance={onSubmit}
			class="flex flex-wrap gap-3"
		>
			<!-- A list of plain strings has nothing but its position to be keyed by. -->
			{#each topics as topic, index (index)}
				<Button label={topic} variant="secondary" name="topic" value={topic} />
			{/each}
		</form>
	{/if}
</div>
