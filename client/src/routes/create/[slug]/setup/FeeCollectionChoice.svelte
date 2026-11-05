<script lang="ts">
	import CreditCard from '@lucide/svelte/icons/credit-card';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { RadioGroup } from '$lib/components/ui/radio-group';
	import ChoiceTile from './ChoiceTile.svelte';

	type Props = {
		collection: 'stripe' | 'manual';
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { collection }: Props = $props();

	// Writable `$derived`: the choice made now, starting from the conference's.
	let chosen = $derived<string>(collection);
</script>

<!--
	Create fee's payment row: the title on the left, centred against the two
	cards on the right. One answer for the whole conference: saving the fee
	saves it on the conference too. shadcn's `RadioGroup`, named by its
	visible title, holds the choice and sends it as `collection`.
-->
<div class="mt-3.25 grid items-center gap-1.5 lg:grid-cols-[189fr_518fr] lg:gap-0">
	<div>
		<p id="collection-title" class="fs-14 lh-20 font-semibold text-creation-ink-900">
			Payment collection
		</p>
		<p class="fs-12 lh-18 text-creation-ink-225">How will this fee be collected?</p>
	</div>
	<RadioGroup
		name="collection"
		aria-labelledby="collection-title"
		class="grid gap-2.75 lg:grid-cols-2"
		bind:value={chosen}
	>
		<ChoiceTile
			value="stripe"
			label="Through MUNMeet"
			description="Let delegates pay online via MUNMeet."
			icon={CreditCard}
			shape="collection"
		/>
		<ChoiceTile
			value="manual"
			label="Collected externally"
			description="You will collect the payments yourself (e.g. bank transfer)."
			icon={ExternalLink}
			shape="collection"
		/>
	</RadioGroup>
</div>
