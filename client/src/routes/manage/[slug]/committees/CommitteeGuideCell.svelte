<script lang="ts">
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import CommitteeCell from './CommitteeCell.svelte';

	type Props = {
		/** Whether the committee's background guide has been uploaded. */
		hasBackgroundGuide: boolean;
		/** "Papers 9/12" from `papersLine`, or null when nobody is seated yet. */
		papers: string | null;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { hasBackgroundGuide, papers }: Props = $props();
</script>

<!-- Whether one committee's background guide is up, and the position papers handed in so far. -->
<CommitteeCell label="Background guide:">
	{#if hasBackgroundGuide}
		<StatusDot text="Uploaded" tone="success" />
	{:else}
		<span class="text-muted-foreground">None yet</span>
	{/if}
	{#if papers}
		<span class="block text-small text-muted-foreground">{papers}</span>
	{/if}
</CommitteeCell>
