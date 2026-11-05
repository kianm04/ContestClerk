<script lang="ts">
	import GslScreen from '$lib/components/room/gsl/GslScreen.svelte';
	import { sharedChairForm } from '$lib/chair-form';
	import { consoleFrame } from '$lib/chair-frame';
	import { sharedRollCallForm } from '$lib/roll-call-preview';
	import { chairRoomUrl } from '$lib/urls';
	// `PageProps` is the type of this page's props, which SvelteKit writes into
	// `./$types` for this folder from what the `load` functions return.
	import type { PageProps } from './$types';

	// `data` holds what the chair layout's `load` returned and what this page's
	// `load` added in `+page.server.ts`: the General Speakers' List. Both run
	// again whenever realtime reports a change in the room, and after every
	// press, and `data` is replaced with the fresh result.
	let { data }: PageProps = $props();

	// The room's state as the frame works it out, with the chair's and the roll
	// call's presses laid on top (`consoleFrame`), so the band leaves at the
	// press that calls the first speaker and counts a roll call answer at once.
	const chairForm = sharedChairForm();
	const rollCallForm = sharedRollCallForm();
	const shown = $derived(consoleFrame(data, 'gsl', chairForm.presses, rollCallForm.presses));
</script>

<!--
	The GSL view, with the opening band above it while the session opens. The
	live room (`chair`) draws the same `GslScreen` while the room is in formal
	debate, so the two pages cannot drift apart. With no session running there
	is no list to show.
-->
{#if data.gsl}
	<GslScreen
		gsl={data.gsl}
		frame={data}
		isTimeFieldOpen={data.isTimeFieldOpen}
		page="gsl"
		openingPresence={shown.roomState === 'opening' ? shown.presence : null}
		canAddTopic={data.isQuickSession}
	/>
{:else}
	<section aria-labelledby="gsl-no-session" class="flex flex-col items-start gap-2 p-8 max-md:p-4">
		<h2 id="gsl-no-session" class="text-h3">No session is running.</h2>
		<a
			href={chairRoomUrl(data.conference.slug, data.committee.slug)}
			class="font-medium text-brand-700 underline"
		>
			Open the chair room
		</a>
	</section>
{/if}
