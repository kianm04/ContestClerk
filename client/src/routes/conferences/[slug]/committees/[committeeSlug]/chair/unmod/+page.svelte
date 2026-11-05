<script lang="ts">
	import NoSessionNotice from '$lib/components/room/start/NoSessionNotice.svelte';
	import UnmodView from '$lib/components/room/unmod/UnmodView.svelte';
	import { roomFrameAfterPresses, sharedChairForm } from '$lib/chair-form';
	import { isSessionRunning } from '$lib/chair-room';
	import { emptyUnmodStart } from '$lib/caucus-start';
	import { endedModeName, isModeRunning, startBlockedReason } from '$lib/mode-start';
	import { chairRoomUrl } from '$lib/urls';
	import UnmodStartForm from './UnmodStartForm.svelte';
	// `PageProps` is the type of this page's props, which SvelteKit writes into
	// `./$types` for this folder from what the `load` functions return.
	import type { PageProps } from './$types';

	// `data` holds what the chair layout's `load` returned and what this page's
	// `load` added in `+page.server.ts`: the General Speakers' List and the
	// running caucus, and whether a vote is open. Both run again whenever
	// realtime reports a change in the room, and after every press. `form` is
	// what a refused "Start caucus" sent back.
	let { data, form }: PageProps = $props();

	// The room with the chair's presses on their way laid on top
	// (`$lib/chair-form.ts`), so "Start caucus" draws the running caucus at once.
	const chairForm = sharedChairForm();
	const shown = $derived(roomFrameAfterPresses(data, chairForm.presses));
	const mode = $derived(shown.committeeState.mode);
	const isRunning = $derived(isModeRunning(shown.committeeState, 'unmoderated_caucus'));
	const blockedReason = $derived(
		startBlockedReason({ isSuspended: mode === 'suspended', hasOpenVote: data.hasOpenVote })
	);
</script>

<!--
	The Unmod view: the running unmoderated caucus, or its start form while
	none runs. The live room (`chair`) draws the same `UnmodView` while the
	room is in an unmoderated caucus. With no session running nothing starts.
-->
{#if !isSessionRunning(shown.currentSession)}
	<NoSessionNotice roomHref={chairRoomUrl(data.conference.slug, data.committee.slug)} />
{:else if isRunning}
	<UnmodView
		unmod={data.unmod ?? { gsl: null, motion: null }}
		frame={data}
		isTimeFieldOpen={data.isTimeFieldOpen}
		page="unmod"
	/>
{:else}
	<UnmodStartForm
		values={form?.values ?? emptyUnmodStart()}
		errors={form?.errors ?? {}}
		frame={data}
		endedName={endedModeName(mode, 'unmoderated_caucus')}
		{blockedReason}
	/>
{/if}
