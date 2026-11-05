<script lang="ts">
	import Receipt from '@lucide/svelte/icons/receipt';
	import StickyNote from '@lucide/svelte/icons/sticky-note';
	import Users from '@lucide/svelte/icons/users';
	import Card from '$lib/components/Card.svelte';
	import ParagraphText from '$lib/components/ParagraphText.svelte';
	import Section from '$lib/components/Section.svelte';
	import type { DelegationInvoiceLine } from '$lib/delegation-review';
	import type { DelegationMember } from '$lib/delegations';
	import type { PrivateDetailsAccess } from '$lib/private-details';
	import { manageFeesUrl } from '$lib/urls';
	import DelegationInvoices from './DelegationInvoices.svelte';
	import DelegationMembers from './DelegationMembers.svelte';

	type Props = {
		/** Everybody in the delegation, heads first. */
		members: DelegationMember[];
		/** What "now" is, for working out each member's age, from `load`. */
		now: Date;
		/** Which of the members' private details the reader may see. */
		access: PrivateDetailsAccess;
		/** The note the delegation's head wrote when applying, or `null`. */
		note: string | null;
		/** Every invoice written against this delegation, newest first, or `null` for a reader who may not read them. */
		invoices: DelegationInvoiceLine[] | null;
		/** The conference's slug, for the links to the fees page. */
		slug: string;
	};

	let { members, now, access, note, invoices, slug }: Props = $props();
</script>

<Section
	title={`Members (${members.length})`}
	icon={Users}
	description="Who is on this delegation."
>
	<DelegationMembers {members} {now} {access} />
</Section>

{#if note}
	<Section
		title="Note from the head"
		icon={StickyNote}
		description="A message the delegation's head wrote for you."
	>
		<ParagraphText text={note} />
	</Section>
{/if}

<!--
	Each invoice number links to its row on the fees page
	(`/manage/[slug]/fees?invoice=…`), as the wireframe asks, and the heading
	links to the whole fees page.
-->
{#if invoices}
	<Section
		title="Invoices"
		icon={Receipt}
		description="This delegation's invoices for conference fees."
		viewAllHref={manageFeesUrl(slug)}
		viewAllLabel="Fees"
	>
		<Card>
			<DelegationInvoices {invoices} conferenceSlug={slug} />
		</Card>
	</Section>
{/if}
