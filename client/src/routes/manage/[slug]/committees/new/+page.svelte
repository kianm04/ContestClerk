<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import BackLink from '$lib/components/manage/BackLink.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import { hasCommitteeErrors } from '$lib/committee-details';
	import { manageCommitteesUrl } from '$lib/urls';
	import CommitteeForm from '../CommitteeForm.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned together with what the
	// layout above it loaded, which is where the conference itself comes from.
	// `form` is what the last action returned, and is `null` until one of them
	// has answered: the save that works redirects instead of returning.
	let { data, form }: PageProps = $props();

	/** What the error notice says when the fields themselves are what need fixing. */
	const FIELDS_FAILURE_MESSAGE = 'Please fix the fields below.';

	// A refused save sends back everything that was typed, so nothing is lost,
	// and so do the two topic buttons. Until an action has answered there is
	// nothing to send back and the page shows the empty form `load` made.
	// `$derived` works both out again on every new `form`.
	const values = $derived(form?.values ?? data.values);
	const errors = $derived(form?.errors ?? {});

	// `addTopic` and `removeTopic` answer in the same shape a refusal does but
	// with nothing wrong, so the notice asks the fields rather than asking
	// whether an action answered at all. `message` is filled in when the fault
	// was ours, and is null when the form is what needs fixing.
	const hasFieldErrors = $derived(hasCommitteeErrors(errors));
	const failureMessage = $derived(
		form?.message ?? (hasFieldErrors ? FIELDS_FAILURE_MESSAGE : null)
	);
</script>

<svelte:head>
	<!-- A private page has nothing to share, so it writes its own title rather
		than using `PageMeta`, which asks for a description for the link card. -->
	<title>New committee · {data.conference.name} · MUNMeet</title>
</svelte:head>

<div class="lg:mb-2">
	<BackLink href={manageCommitteesUrl(data.conference.slug)} label="Committees" />
</div>

<ManageHeader
	title="New committee"
	summary="Seats, chairs and a background guide can be added once it is created."
/>

{#if failureMessage}
	<Notice tone="error">{failureMessage}</Notice>
{/if}

<CommitteeForm {values} {errors} hasSharedLink={false} submitLabel="Create committee" />
