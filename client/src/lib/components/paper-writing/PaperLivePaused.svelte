<script lang="ts">
	import { PAUSED_RELOAD_SECONDS, type LiveStatus } from '$lib/committee-room-live';

	type Props = {
		/** Whether the live channel to the others is connecting, live or paused. */
		status: LiveStatus;
		/** Whose writing still arrives: "your delegation's" or "the other authors'". */
		othersWriting: string;
	};

	let { status, othersWriting }: Props = $props();
</script>

<!--
	While the connection to the others is down, one quiet line says so. Saving
	still works, and the others' words arrive with each save.
-->
{#if status === 'paused'}
	<p class="text-small text-muted-foreground" role="status">
		Live editing is paused. Your writing still saves, and {othersWriting} arrives every
		{PAUSED_RELOAD_SECONDS} seconds.
	</p>
{/if}
