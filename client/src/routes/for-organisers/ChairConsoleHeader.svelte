<script lang="ts">
	import {
		ROOM_COMMITTEE_NAME,
		ROOM_ROLL_CALL,
		ROOM_SESSION,
		ROOM_TOPIC,
		ROOM_VIEWS
	} from '$lib/organiser-room';

	// The view the console has open, drawn selected.
	const OPEN_VIEW = 'GSL';
</script>

<!--
	The top of the drawn chair's console: the committee, its topic and session,
	the roll call's green pill, and under them the row of views with the
	general speakers' list selected. The views are drawn as plain words, since
	nothing in a picture can be pressed.

	`{#each … (view)}` draws one word per view, keyed by the word itself, which
	is never repeated.
-->
<div
	class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-neutral-100 px-5 py-3.5"
>
	<div class="flex min-w-0 flex-col">
		<span class="text-dense font-semibold">{ROOM_COMMITTEE_NAME}</span>
		<span class="text-caption text-ink-600">{ROOM_TOPIC} · {ROOM_SESSION}</span>
	</div>
	<span
		class="rounded-full bg-success-100 px-2.5 py-0.5 text-caption font-medium whitespace-nowrap text-success-700 tabular-nums"
	>
		{ROOM_ROLL_CALL}
	</span>
</div>

<div
	class="flex flex-wrap gap-1 border-b border-neutral-100 py-2 pr-5 pl-3.5 text-caption font-medium text-ink-600"
>
	{#each ROOM_VIEWS as view (view)}
		<span
			class={[
				'rounded-lg px-2.5 py-[0.3125rem]',
				view === OPEN_VIEW && 'bg-brand-100 text-brand-900'
			]}
		>
			{view}
		</span>
	{/each}
</div>
