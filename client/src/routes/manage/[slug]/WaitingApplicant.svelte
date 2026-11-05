<script lang="ts">
	import type { WaitingRow } from '$lib/dashboard-waiting';
	import { manageApplicationReviewUrl } from '$lib/urls';

	type Props = {
		/** One application waiting for a decision. */
		row: WaitingRow;
		conferenceSlug: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { row, conferenceSlug }: Props = $props();
</script>

<!-- The applicant's name opens their application, with their school or university under it. -->
<div class="min-w-0">
	<a
		href={manageApplicationReviewUrl(conferenceSlug, row.id)}
		class="font-medium text-foreground hover:text-link hover:underline"
	>
		{row.applicantName}
	</a>

	{#if row.institutionName}
		<p class="text-small text-muted-foreground">{row.institutionName}</p>
	{/if}
</div>
