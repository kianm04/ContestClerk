<script lang="ts">
	import School from '@lucide/svelte/icons/school';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { DELEGATION_EMPTY_TITLES, type ListedDelegationStatus } from '$lib/delegations';

	type Props = {
		/** The tab the organiser is looking at, which decides the sentence. */
		status: ListedDelegationStatus;
	};

	let { status }: Props = $props();

	/*
		One sentence per tab, saying what would put a delegation in it. The title
		above each of them comes from `DELEGATION_EMPTY_TITLES`, which is shared
		with anything else that has to name an empty tab; these four belong to
		this empty state alone, the way `ApplicationsEmptyState` keeps its own.
	*/
	const DESCRIPTIONS: Record<ListedDelegationStatus, string> = {
		submitted: 'Schools that register a delegation appear here.',
		accepted: 'Delegations you accept appear here.',
		rejected: 'Delegations you do not accept appear here.',
		withdrawn: 'Delegations that pull out before the conference appear here.'
	};

	// `$derived` picks the sentence again whenever the open tab changes.
	const description = $derived(DESCRIPTIONS[status]);
</script>

<!-- No button: nothing an organiser can press would fill an empty tab. -->
<EmptyState icon={School} title={DELEGATION_EMPTY_TITLES[status]} {description} />
