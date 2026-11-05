<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { FeeDialogValues } from '$lib/creation-setup-dialog';
	import { FEE_DESCRIPTION_MAX_LENGTH } from '$lib/creation-setup-forms';
	import { FEE_NAME_MAX_LENGTH, type FeeFormErrors } from '$lib/fees';
	import { fieldErrorId, fieldHelpId } from '$lib/form-fields';
	import FeeAmountInput from './FeeAmountInput.svelte';
	import FeeCollectionSelect from './FeeCollectionSelect.svelte';
	import SideField from './SideField.svelte';
	import StripeStatusBox from './StripeStatusBox.svelte';

	type Props = {
		values: FeeDialogValues;
		errors: FeeFormErrors & { description?: string };
		/** The conference's currency code, such as `EUR`. */
		currency: string;
		isStripeConnected: boolean;
		/** The organisation's settings, where Stripe is connected. */
		stripeSettingsUrl: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { values, errors, currency, isStripeConnected, stripeSettingsUrl }: Props = $props();

	// Writable `$derived`: what the organiser has typed or picked, starting from the saved fee.
	let description = $derived(values.description);
	let collection = $derived<string>(values.collection);

	/** Builds `aria-describedby`: the help line, and the error when there is one. */
	function describedBy(id: string, error: string | undefined) {
		return error ? `${fieldHelpId(id)} ${fieldErrorId(id)}` : fieldHelpId(id);
	}

	const FIELD_CLASSES = 'rounded-md border-creation-input-border bg-white px-4 fs-17!';
</script>

<!--
	The Edit fee board's rows. The fee type and who pays are not asked again
	here: they travel as hidden fields, so saving keeps them.
-->
<input type="hidden" name="kind" value={values.kind} />
<input type="hidden" name="appliesTo" value={values.appliesTo} />
<SideField
	id="name"
	label="Name"
	help="A short name for this fee, visible to delegates (e.g. “Delegate fee”)."
	error={errors.name}
	layout="edit"
	class="mt-5.75"
>
	<Input
		id="name"
		name="name"
		maxlength={FEE_NAME_MAX_LENGTH}
		placeholder="Fee name"
		class="{FIELD_CLASSES} h-10.75 max-lg:h-11"
		aria-describedby={describedBy('name', errors.name)}
		value={values.name}
	/>
</SideField>
<SideField
	id="amount"
	label="Amount"
	help="The amount each delegate will pay."
	error={errors.amount}
	layout="edit"
	class="mt-5.25"
>
	<FeeAmountInput
		value={values.amount}
		{currency}
		describedBy={describedBy('amount', errors.amount)}
		isLarge
	/>
</SideField>
<SideField
	id="description"
	label="Description"
	help="A short description of what this fee covers. This will be shown on the public page."
	error={errors.description}
	layout="edit"
	class="mt-6"
>
	<!-- The board puts the count inside the box, at its bottom right. -->
	<div class="relative">
		<Textarea
			id="description"
			name="description"
			maxlength={FEE_DESCRIPTION_MAX_LENGTH}
			placeholder="What this fee includes"
			class="{FIELD_CLASSES} field-sizing-fixed h-21.25 min-h-0 resize-y pt-2.75 pb-6"
			aria-describedby={describedBy('description', errors.description)}
			bind:value={description}
		/>
		<p
			class="pointer-events-none absolute right-3 bottom-1.5 fs-14 lh-20 text-creation-ink-300 tabular-nums"
		>
			{description.length}/{FEE_DESCRIPTION_MAX_LENGTH}
		</p>
	</div>
</SideField>
<SideField
	id="collection"
	label="Collection method"
	help={collection === 'stripe'
		? 'Payments will be collected securely through MUNMeet (Stripe).'
		: 'You will collect the payments yourself, for example by bank transfer.'}
	layout="edit"
	class="mt-6.25"
>
	<FeeCollectionSelect bind:collection />
</SideField>
{#if collection === 'stripe'}
	<StripeStatusBox {isStripeConnected} {stripeSettingsUrl} />
{/if}
