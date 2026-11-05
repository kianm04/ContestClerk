<script lang="ts">
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import type { SetupFee } from '$lib/creation-setup-dialog';
	import { formatMoney } from '$lib/money';
	import { createSetupDialogUrl } from '$lib/urls';
	import RowActions from './RowActions.svelte';

	type Props = {
		slug: string;
		fee: SetupFee;
		/** The conference's currency, such as `EUR`. */
		currency: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { slug, fee, currency }: Props = $props();
</script>

<!--
	One fee on one 32 design pixel line: the grip in a 42 pixel
	column, the name 31 pixels after it in a 285 pixel column, the amount, then
	the pencil and the bin at the right. The grip is only a picture; fees are
	put in order on the full fees page.
-->
<li class="flex h-8 items-center pr-5.25 fs-14 text-creation-ink-950 max-lg:h-11">
	<span class="flex w-10.5 shrink-0 justify-center text-creation-ink-600">
		<GripVertical class="size-4.5" aria-hidden="true" />
	</span>
	<span class="ml-7.75 min-w-0 truncate font-semibold max-lg:flex-1 lg:w-71.25 lg:shrink-0">
		{fee.name}
	</span>
	<span class="tabular-nums max-lg:ml-2">{formatMoney(fee.amountCents, currency)}</span>
	<span class="ml-auto">
		<RowActions
			name={fee.name}
			editHref={createSetupDialogUrl(slug, 'fee', fee.id)}
			deleteHref={createSetupDialogUrl(slug, 'delete-fee', fee.id)}
		/>
	</span>
</li>
