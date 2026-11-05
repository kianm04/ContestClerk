<script lang="ts">
	import Database from '@lucide/svelte/icons/database';
	import Plus from '@lucide/svelte/icons/plus';
	import CreationPanel from '$lib/components/creation/CreationPanel.svelte';
	import StatusChip, { type CreationStatus } from '$lib/components/creation/StatusChip.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { FeeStatus } from '$lib/creation-draft';
	import type { SetupFee } from '$lib/creation-setup-dialog';
	import { createSetupDialogUrl, manageFeesTabUrl } from '$lib/urls';
	import FeeImportForm from './FeeImportForm.svelte';
	import FeeRow from './FeeRow.svelte';
	import FeeStatusChoice from './FeeStatusChoice.svelte';
	import PanelLink from './PanelLink.svelte';

	type Props = {
		slug: string;
		fees: SetupFee[];
		currency: string;
		feeStatus: FeeStatus;
		status: CreationStatus;
		/** "€35 delegate fee": what the last edition charged, or `null`. */
		previousFeeSummary: string | null;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { slug, fees, currency, feeStatus, status, previousFeeSummary }: Props = $props();
</script>

<div id="fees" class="scroll-mt-24">
	<CreationPanel
		title="Fees"
		description="Set whether delegates pay and how."
		icon={Database}
		size="small"
	>
		<!-- `{#snippet actions()}` fills the panel's space on the right of its title. -->
		{#snippet actions()}
			<div class="flex items-center gap-3.25">
				<StatusChip {status} />
				<Button
					variant="outline"
					href={createSetupDialogUrl(slug, 'fee')}
					class="h-8.5 gap-2 rounded-md border-creation-track bg-white px-3.5 fs-13 font-medium text-creation-blue hover:bg-creation-hover hover:text-creation-blue max-lg:min-h-11"
				>
					<Plus class="size-4" aria-hidden="true" />
					Add fee
				</Button>
				<PanelLink href={manageFeesTabUrl(slug, 'fees')} label="All fees" class="ml-1" />
			</div>
		{/snippet}

		{#if fees.length > 0}
			<ul class="mt-1 flex flex-col">
				<!-- Keyed by id, so Svelte keeps each row's elements with its fee. -->
				{#each fees as fee (fee.id)}
					<FeeRow {slug} {fee} {currency} />
				{/each}
			</ul>
		{/if}

		<!--
			The three choices, then last year's fee and its button, on one row on a
			wide screen as drawn; below a laptop they stack.
		-->
		<div class="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-0">
			<FeeStatusChoice {feeStatus} />
			{#if previousFeeSummary}
				<FeeImportForm {previousFeeSummary} />
			{/if}
		</div>
	</CreationPanel>
</div>
