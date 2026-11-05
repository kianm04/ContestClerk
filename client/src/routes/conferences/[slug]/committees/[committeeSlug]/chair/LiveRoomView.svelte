<script lang="ts">
	import type { FramePresence } from '$lib/chair-frame';
	import type { LiveRoomScreen } from '$lib/chair-room';
	import GslScreen from '$lib/components/room/gsl/GslScreen.svelte';
	import ModView from '$lib/components/room/mod/ModView.svelte';
	import SingleSpeakerView from '$lib/components/room/single/SingleSpeakerView.svelte';
	import UnmodView from '$lib/components/room/unmod/UnmodView.svelte';
	import VoteView from '$lib/components/room/vote/VoteView.svelte';
	// The types SvelteKit writes for this route's own page: what its `load`
	// returned (`PageData`) and what a refused action sent back (`ActionData`).
	import type { ActionData, PageData } from './$types';

	type Props = {
		/** The live view the room's mode draws (`liveRoomScreen`); `opening` is the GSL with its band. */
		screen: Exclude<LiveRoomScreen, 'lobby' | 'suspended' | 'ended'>;
		/** The live room's data: the layout's frame and every view `load` read (`readLiveRoomViews`). */
		data: PageData;
		/** What a refused "Open vote" sent back, so the set-up keeps what was typed. */
		form: ActionData;
		/** Who is present, with the roll call's presses counted in (`consoleFrame`), for the band. */
		presence: FramePresence;
	};

	let { screen, data, form, presence }: Props = $props();
</script>

<!--
	The view of the mode the room is in, as each view's own route draws it,
	from the same component and the same data (`committee-room.md`, "What
	`chair` draws in the opening and in debate"). Its buttons post to the live
	room's actions, which `+page.server.ts` takes from the same factories as
	the view's route, so every press lands back here. When a co-chair's press
	changes the mode, the new view's data arrives with the next `load`: until
	then the caucus and single speaker views draw from the frame alone, and the
	GSL and Vote views, which cannot, wait for theirs.
-->
{#if (screen === 'opening' || screen === 'gsl') && data.gsl}
	<GslScreen
		gsl={data.gsl}
		frame={data}
		isTimeFieldOpen={data.isTimeFieldOpen}
		page="chair"
		openingPresence={screen === 'opening' ? presence : null}
		canAddTopic={data.isQuickSession}
	/>
{:else if screen === 'mod'}
	<ModView caucus={data.mod ?? { list: null, motion: null }} frame={data} />
{:else if screen === 'unmod'}
	<UnmodView
		unmod={data.unmod ?? { gsl: data.gsl, motion: null }}
		frame={data}
		isTimeFieldOpen={data.isTimeFieldOpen}
		page="chair"
	/>
{:else if screen === 'single'}
	<SingleSpeakerView single={data.single ?? { list: null, purpose: null }} frame={data} />
{:else if screen === 'voting' && data.voteView}
	<VoteView
		view={data.voteView}
		frame={data}
		refusedValues={form?.values ?? null}
		refusedErrors={form?.errors ?? {}}
		page="chair"
	/>
{/if}
