<script lang="ts">
	import { buttonClasses } from '$lib/button-classes';
	import type { LobbyView } from '$lib/room-ready';
	import RenameSession from './RenameSession.svelte';
	import StartSessionForm from './StartSessionForm.svelte';
	import TextLink from './TextLink.svelte';

	type Props = {
		/** The lobby's lines (`lobbyView` in `$lib/room-ready.ts`). */
		view: LobbyView;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { view }: Props = $props();

	/** The start form's id, which "Rename this session"'s field names to be sent with it. */
	const START_FORM_ID = 'start-session-form';

	/* A quick session's "Edit delegations" beside the start button: outlined, a second step (P1). */
	const EDIT_DELEGATIONS_CLASSES = `${buttonClasses('secondary', 'lg', false)} max-md:w-full`;
</script>

<!--
	The next session: its name with "Rename this session", the agenda carried
	over and the seats on the left, and the one filled button on the right,
	across all three lines. On a phone the two columns become one and the
	button takes the full width. Without seats nothing can start, so the
	button is disabled and the sentence says why, in plain ink (P4).
-->
<div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-8 gap-y-2 max-md:grid-cols-1">
	<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
		<h2 class="text-h2">{view.sessionName}</h2>
		<RenameSession defaultName={view.sessionName} formId={START_FORM_ID} />
	</div>

	<div
		class="col-start-2 row-span-4 row-start-1 flex flex-wrap items-center gap-3 self-center max-md:order-last max-md:col-start-1 max-md:row-span-1 max-md:row-start-auto max-md:mt-2"
	>
		<StartSessionForm
			label={view.startLabel}
			look="primary"
			isDisabled={!view.hasSeats}
			formId={START_FORM_ID}
		/>
		{#if view.editDelegationsHref}
			<a href={view.editDelegationsHref} class={EDIT_DELEGATIONS_CLASSES}>Edit delegations</a>
		{/if}
	</div>

	{#if view.agendaLine}
		<p>{view.agendaLine}</p>
	{/if}
	<p class="flex flex-wrap items-center gap-x-3 text-ink-600">
		{view.seatsLine}
		{#if view.addSeatsHref}
			<TextLink href={view.addSeatsHref} label="Add seats" />
		{/if}
	</p>
	{#if view.isPracticeSession}
		<p class="text-small text-ink-600">
			Practice sessions do not count towards Session 1, so the numbering starts fresh once the
			conference begins.
		</p>
	{/if}
</div>
