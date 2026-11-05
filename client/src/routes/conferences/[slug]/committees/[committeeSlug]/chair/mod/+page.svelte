<script lang="ts">
	import ModView from '$lib/components/room/mod/ModView.svelte';
	import NoSessionNotice from '$lib/components/room/start/NoSessionNotice.svelte';
	import { roomFrameAfterPresses, sharedChairForm } from '$lib/chair-form';
	import { isSessionRunning } from '$lib/chair-room';
	import { emptyModStart } from '$lib/caucus-start';
	import { endedModeName, isModeRunning, startBlockedReason } from '$lib/mode-start';
	import { chairRoomUrl } from '$lib/urls';
	import ModStartForm from './ModStartForm.svelte';
	// `PageProps` is the type of this page's props, which SvelteKit writes into
	// `./$types` for this folder from what the `load` functions return.
	import type { PageProps } from './$types';

	// `data` holds what the chair layout's `load` returned and what this page's
	// `load` added in `+page.server.ts`: the running caucus, or whether a vote
	// is open. Both run again whenever realtime reports a change in the room,
	// and after every press. `form` is what a refused "Start caucus" sent back.
	let { data, form }: PageProps = $props();

	// The room with the chair's presses on their way laid on top
	// (`$lib/chair-form.ts`), so "Start caucus" draws the running caucus at once.
	const chairForm = sharedChairForm();
	const shown = $derived(roomFrameAfterPresses(data, chairForm.presses));
	const mode = $derived(shown.committeeState.mode);
	const isRunning = $derived(isModeRunning(shown.committeeState, 'moderated_caucus'));
	const blockedReason = $derived(
		startBlockedReason({ isSuspended: mode === 'suspended', hasOpenVote: data.hasOpenVote })
	);
</script>

<!--
	The Mod view: the running moderated caucus, or its start form while none
	runs. The live room (`chair`) draws the same `ModView` while the room is in
	a moderated caucus. With no session running nothing can start.
-->
{#if !isSessionRunning(shown.currentSession)}
	<NoSessionNotice roomHref={chairRoomUrl(data.conference.slug, data.committee.slug)} />
{:else if isRunning}
	<ModView caucus={data.mod ?? { list: null, motion: null }} frame={data} />
{:else}
	<ModStartForm
		values={form?.values ?? emptyModStart()}
		errors={form?.errors ?? {}}
		frame={data}
		endedName={endedModeName(mode, 'moderated_caucus')}
		{blockedReason}
	/>
{/if}
