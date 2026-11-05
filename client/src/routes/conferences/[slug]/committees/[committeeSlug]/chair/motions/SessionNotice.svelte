<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import { chairMotionsUrl, chairRoomUrl } from '$lib/urls';

	type Props = {
		/** `none` while no session runs; `ended` on an ended session's record. */
		state: 'none' | 'ended';
		conferenceSlug: string;
		committeeSlug: string;
	};

	let { state, conferenceSlug, committeeSlug }: Props = $props();
</script>

<!--
	The two states in which nothing can be recorded, each a neutral notice
	rather than a warning (P4): no session running, which links to the live
	room where the lobby starts one (the frame hides the mode bar there), and
	an ended session's record, which links back to the running motions.
-->
<Notice tone="info">
	{#if state === 'none'}
		<p>
			No session is running.
			<a href={chairRoomUrl(conferenceSlug, committeeSlug)} class="font-medium underline">
				Open the chair room
			</a>
		</p>
	{:else}
		<p>
			This session has ended.
			<a href={chairMotionsUrl(conferenceSlug, committeeSlug)} class="font-medium underline">
				Back to the current motions
			</a>
		</p>
	{/if}
</Notice>
