<script lang="ts">
	import { isSessionRunning } from '$lib/chair-room';
	import { sharedRollCallForm } from '$lib/roll-call-preview';
	import { quorumLineText, rollCallView } from '$lib/roll-call-view';
	import { chairPageUrl, chairRoomUrl } from '$lib/urls';
	import RollCallHeader from './RollCallHeader.svelte';
	import RollCallHistory from './RollCallHistory.svelte';
	import RollCallList from './RollCallList.svelte';
	import StartRollCallForm from './StartRollCallForm.svelte';
	// `PageProps` is the type of this page's props, which SvelteKit writes into
	// `./$types` for this folder from what the `load` functions return.
	import type { PageProps } from './$types';

	// `data` holds what the chair layout's `load` returned and what this page's
	// `load` added in `+page.server.ts`. Both run again after every press, in
	// the background, and whenever realtime reports a change in the room.
	let { data }: PageProps = $props();

	// The roll call's answers and "Mark all present" go through one instant
	// form that the chair layout keeps (`$lib/roll-call-preview.ts`). It shows
	// each answer the moment it is pressed, on the rows, the counts and the top
	// bar's chip, and sends them in the order pressed, the last one winning.
	const rollCallForm = sharedRollCallForm();
	const session = $derived(isSessionRunning(data.currentSession) ? data.currentSession : null);
	// The seats, answers, counts and links, with the presses laid on top (`$lib/roll-call-view.ts`).
	const view = $derived(rollCallView(data, rollCallForm.presses));
	const returnHref = $derived(chairPageUrl(data.conference.slug, data.committee.slug, data.from));
</script>

<!--
	The roll call view inside the console's frame (`chair/roll-call.md`): the
	head, the seats in alphabetical order, and the foot. Opening it stores
	nothing: before the session's first roll call every seat shows "Absent",
	and the first press makes the roll call (R2).
-->
{#if session}
	<section aria-label="Roll call" class="flex min-h-0 flex-1 flex-col">
		<RollCallHeader
			sessionName={session.name}
			counts={view.counts}
			quorumLine={quorumLineText(view)}
			hasAnyonePresent={view.hasAnyonePresent}
			rollCallId={view.rollCallId}
			from={data.from}
			{returnHref}
			onSubmit={rollCallForm.submit}
		/>
		<div class="min-h-0 flex-1 overflow-auto px-8 pb-6 max-[1100px]:px-6 max-md:px-4">
			<!--
				`{#key}` draws the list afresh whenever the value changes. A new
				roll call moves the last one into the earlier ones, so the list
				starts again as the page opens: the marker and the focus on the
				first seat, where the keys work at once. The first answer of a
				session makes its first roll call without adding an earlier one,
				so it leaves the list alone.
			-->
			{#key view.earlier.length}
				<RollCallList
					seats={view.seats}
					marks={view.marks}
					rollCallId={view.rollCallId}
					from={data.from}
					markedSeatId={data.markedSeatId}
					onSubmit={rollCallForm.submit}
				/>
			{/key}
		</div>
		<footer
			class="flex flex-col gap-1 border-t border-line px-8 py-3 text-small text-ink-600 max-[1100px]:px-6 max-md:px-4"
		>
			<p class="max-md:hidden [@media(hover:none)]:hidden">
				Every answer is saved as you press it. Keys: ↑ ↓ move, A absent, P present, V present and
				voting.
			</p>
			{#if view.earlier.length > 0}
				<RollCallHistory rollCalls={view.earlier} />
			{/if}
			<StartRollCallForm from={data.from} />
		</footer>
	</section>
{:else}
	<section
		aria-labelledby="roll-call-no-session"
		class="flex flex-col items-start gap-2 p-8 max-md:p-4"
	>
		<h2 id="roll-call-no-session" class="text-h3">No session is running.</h2>
		<a
			href={chairRoomUrl(data.conference.slug, data.committee.slug)}
			class="font-medium text-brand-700 underline"
		>
			Open the chair room
		</a>
	</section>
{/if}
