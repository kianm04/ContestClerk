<script lang="ts">
	import type { LobbyView } from '$lib/room-ready';
	import { ROOM_SCREEN_CLASSES, ROOM_TITLE_CLASSES } from '$lib/room-screen-classes';
	import LobbyFacts from './LobbyFacts.svelte';
	import LobbyNextSession from './LobbyNextSession.svelte';

	type Props = {
		/** What the lobby shows, worked out by `lobbyView` in `$lib/room-ready.ts`. */
		view: LobbyView;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { view }: Props = $props();
</script>

<!--
	The live room while no session runs and none ended today
	(`committee-room.md`, "Lobby"): the committee's name as the page's heading,
	where and when it meets, the next session with its one filled button, then
	the last session and the next event on the schedule. No mode bar: there is
	no session to run. The three room screens share their look
	(`$lib/room-screen-classes.ts`).
-->
<section aria-labelledby="lobby-heading" class={ROOM_SCREEN_CLASSES}>
	<div>
		<h1 id="lobby-heading" class={ROOM_TITLE_CLASSES}>
			{view.committeeName}
		</h1>
		{#if view.whereLine}
			<p class="mt-2 text-ink-600">{view.whereLine}</p>
		{/if}
	</div>

	<LobbyNextSession {view} />
	{#if view.lastSession || view.nextOnSchedule}
		<LobbyFacts lastSession={view.lastSession} nextOnSchedule={view.nextOnSchedule} />
	{/if}
</section>
