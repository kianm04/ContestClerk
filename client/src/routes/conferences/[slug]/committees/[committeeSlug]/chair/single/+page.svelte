<script lang="ts">
	import SingleSpeakerView from '$lib/components/room/single/SingleSpeakerView.svelte';
	import NoSessionNotice from '$lib/components/room/start/NoSessionNotice.svelte';
	import { roomFrameAfterPresses, sharedChairForm } from '$lib/chair-form';
	import { isSessionRunning } from '$lib/chair-room';
	import { endedModeName, isModeRunning, startBlockedReason } from '$lib/mode-start';
	import { emptySingleSpeakerForm } from '$lib/single-speaker';
	import { chairRoomUrl } from '$lib/urls';
	import SingleSpeakerStartForm from './SingleSpeakerStartForm.svelte';
	// `PageProps` is the type of this page's props, which SvelteKit writes into
	// `./$types` for this folder from what the `load` functions return.
	import type { PageProps } from './$types';

	// `data` holds what the chair layout's `load` returned and what this page's
	// `load` added in `+page.server.ts`: the single speaker's list and purpose,
	// or whether a vote is open. Both run again whenever realtime reports a
	// change in the room, and after every press. `form` is what a refused
	// "Give the floor" sent back.
	let { data, form }: PageProps = $props();

	// The room with the chair's presses on their way laid on top
	// (`$lib/chair-form.ts`), so "Give the floor" draws the speaker at once.
	const chairForm = sharedChairForm();
	const shown = $derived(roomFrameAfterPresses(data, chairForm.presses));
	const mode = $derived(shown.committeeState.mode);
	const isRunning = $derived(isModeRunning(shown.committeeState, 'single_speaker'));
	const blockedReason = $derived(
		startBlockedReason({ isSuspended: mode === 'suspended', hasOpenVote: data.hasOpenVote })
	);
</script>

<!--
	The Single speaker view: the single speaker on the floor, or the form that
	gives one the floor while nobody has it this way. The live room (`chair`)
	draws the same `SingleSpeakerView` while a single speaker has the floor.
	With no session running nothing starts.
-->
{#if !isSessionRunning(shown.currentSession)}
	<NoSessionNotice roomHref={chairRoomUrl(data.conference.slug, data.committee.slug)} />
{:else if isRunning}
	<SingleSpeakerView single={data.single ?? { list: null, purpose: null }} frame={data} />
{:else}
	<SingleSpeakerStartForm
		values={form?.values ?? emptySingleSpeakerForm()}
		errors={form?.errors ?? {}}
		frame={data}
		endedName={endedModeName(mode, 'single_speaker')}
		{blockedReason}
	/>
{/if}
