<script lang="ts">
	import Inbox from '@lucide/svelte/icons/inbox';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { APPLICATION_EMPTY_TITLES, type ListedApplicationStatus } from '$lib/applications';
	import { manageDetailsUrl } from '$lib/urls';

	type Props = {
		/** The tab the organiser is looking at, which decides the sentence. */
		status: ListedApplicationStatus;
		/** Whether the conference is still a draft, which is a different reason to be empty. */
		isDraft: boolean;
		/** The conference's slug, for the "Go to details" button. */
		conferenceSlug: string;
	};

	let { status, isDraft, conferenceSlug }: Props = $props();

	/*
		A draft conference has no applications because nobody can apply yet, which
		is something the organiser can do about it; every other empty tab is just
		empty. `$derived` picks the sentence again whenever either changes.
	*/
	const description = $derived(
		isDraft ? 'Applications open once the conference is published.' : 'New submissions appear here.'
	);
</script>

<EmptyState
	icon={Inbox}
	title={APPLICATION_EMPTY_TITLES[status]}
	{description}
	actionLabel={isDraft ? 'Go to details' : undefined}
	actionHref={isDraft ? manageDetailsUrl(conferenceSlug) : undefined}
/>
