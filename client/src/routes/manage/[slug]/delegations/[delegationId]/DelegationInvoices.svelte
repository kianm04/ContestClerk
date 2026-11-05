<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import Money from '$lib/components/Money.svelte';
	import type { DelegationInvoiceLine } from '$lib/delegation-review';
	import { statusBadgeTone, statusLabel } from '$lib/status';
	import { manageFeesInvoiceUrl } from '$lib/urls';

	type Props = {
		/** Every invoice written against this delegation, newest first. */
		invoices: DelegationInvoiceLine[];
		/** The conference's slug, for the link from each number to its row on the fees page. */
		conferenceSlug: string;
	};

	let { invoices, conferenceSlug }: Props = $props();
</script>

{#if invoices.length === 0}
	<p class="text-body text-ink-600">No invoices yet.</p>
{:else}
	<ul class="flex flex-col gap-2">
		<!-- The `(invoice.id)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each invoices as invoice (invoice.id)}
			<li class="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-b-0">
				<span class="min-w-0">
					<!-- Opens the fees page with this invoice highlighted, where it can be settled. -->
					<a
						href={manageFeesInvoiceUrl(conferenceSlug, invoice.id)}
						class="block truncate text-body text-brand-700 hover:underline"
					>
						{invoice.number}
					</a>
					<span class="block truncate text-small text-ink-600">{invoice.description}</span>
				</span>

				<span class="flex shrink-0 items-center gap-2">
					<Money amountCents={invoice.amountCents} currency={invoice.currency} />
					<Badge
						tone={statusBadgeTone('invoice_status', invoice.status)}
						label={statusLabel('invoice_status', invoice.status)}
					/>
				</span>
			</li>
		{/each}
	</ul>
{/if}
