<script lang="ts">
	import Flag from '$lib/components/Flag.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import { formatConferenceDay } from '$lib/conferences';
	import {
		hasNoAssignedMembers,
		headNamesSentence,
		NO_MEMBERS_ASSIGNED_TEXT,
		type OrganiserDelegationRow
	} from '$lib/delegations';
	import { seatsAssignedText, seatsGivenText } from '$lib/delegation-seat-words';
	import { manageDelegationReviewUrl } from '$lib/urls';

	type Props = {
		/** The delegation this card is about. */
		delegation: OrganiserDelegationRow;
		/** The conference, so the card can link to this delegation's review page. */
		conferenceSlug: string;
		/** The conference's timezone, so the submitted day is the day it was there. */
		timezone: string;
	};

	let { delegation, conferenceSlug, timezone }: Props = $props();

	/* `$derived` works each of these out again whenever the delegation changes,
	   which is every time `load` runs and hands down new rows. */
	const headNames = $derived(headNamesSentence(delegation.headNames));

	// The table spreads the seats over two lines of its own column. A card has
	// no columns, so they go on one line instead.
	const seatsLine = $derived(
		`${seatsGivenText(delegation.progress)} · ${seatsAssignedText(delegation.progress)}`
	);

	// The table marks a delegation the organisers have to chase with a dot you
	// read by hovering. A phone cannot hover, so the card writes the words out.
	const isUnassigned = $derived(hasNoAssignedMembers(delegation));

	// A delegation the head has not sent yet never reaches this list, but the
	// column allows no date, so the card says so rather than showing nothing.
	const submittedDay = $derived(
		delegation.submittedAt === null ? '—' : formatConferenceDay(delegation.submittedAt, timezone)
	);
</script>

<!--
	The whole row is one link, which is how a phone opens the review page.
	`resolve()` inside `manageDelegationReviewUrl` builds the address from the
	route's own folder name, so a typo in it is a type error.
-->
<a
	href={manageDelegationReviewUrl(conferenceSlug, delegation.id)}
	class="flex flex-col gap-0.5 py-3 hover:bg-muted"
>
	<span class="flex items-center gap-2 text-dense font-medium text-foreground">
		{#if delegation.countryCode}
			<Flag countryCode={delegation.countryCode} />
		{/if}
		{delegation.name}
	</span>

	<span class="text-small text-muted-foreground">{delegation.institutionName} · {headNames}</span>
	<span class="text-small text-muted-foreground">{seatsLine}</span>

	{#if isUnassigned}
		<span class="flex items-center gap-2 text-small text-warning">
			<span class="size-2 shrink-0 rounded-full bg-warning" aria-hidden="true"></span>
			{NO_MEMBERS_ASSIGNED_TEXT}
		</span>
	{/if}

	<span class="mt-1 flex flex-wrap items-center gap-x-3">
		<StatusDot text={delegation.invoice.label} tone={delegation.invoice.tone} />
		<span class="text-small text-muted-foreground">Sent {submittedDay}</span>
	</span>
</a>
