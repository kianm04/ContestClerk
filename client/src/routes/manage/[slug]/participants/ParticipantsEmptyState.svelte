<script lang="ts">
	import Contact from '@lucide/svelte/icons/contact';
	import SearchX from '@lucide/svelte/icons/search-x';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { manageApplicationsUrl } from '$lib/urls';

	type Props = {
		/** True when the conference has participants and only the filters hide them. */
		hasParticipants: boolean;
		/** Whether the reader's permissions open the applications page the action leads to. */
		mayOpenApplications: boolean;
		conferenceSlug: string;
	};

	let { hasParticipants, mayOpenApplications, conferenceSlug }: Props = $props();
</script>

{#if hasParticipants}
	<EmptyState
		icon={SearchX}
		title="No participants match."
		description="Try a different search, or reset the filters."
	/>
{:else}
	<EmptyState
		icon={Contact}
		title="Nobody is seated yet."
		description="Participants appear here once applications are accepted and delegation members are assigned."
		actionLabel={mayOpenApplications ? 'Go to applications' : undefined}
		actionHref={mayOpenApplications ? manageApplicationsUrl(conferenceSlug) : undefined}
	/>
{/if}
