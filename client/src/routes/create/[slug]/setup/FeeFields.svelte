<script lang="ts">
	import User from '@lucide/svelte/icons/user';
	import Users from '@lucide/svelte/icons/users';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { FeeDialogValues } from '$lib/creation-setup-dialog';
	import { FEE_DESCRIPTION_MAX_LENGTH } from '$lib/creation-setup-forms';
	import { FEE_APPLIES_TO_OPTIONS, FEE_NAME_MAX_LENGTH, type FeeFormErrors } from '$lib/fees';
	import { fieldErrorId, fieldHelpId } from '$lib/form-fields';
	import FeeAmountInput from './FeeAmountInput.svelte';
	import IconSelect from './IconSelect.svelte';
	import SideField from './SideField.svelte';

	type Props = {
		values: FeeDialogValues;
		errors: FeeFormErrors & { description?: string };
		/** The conference's currency code, such as `EUR`. */
		currency: string;
		name: string;
		appliesTo: string;
	};

	// `$bindable()` lets the dialog write `bind:name` and `bind:appliesTo`,
	// the two fields the fee type fills in.
	let { values, errors, currency, name = $bindable(), appliesTo = $bindable() }: Props = $props();

	let description = $derived(values.description);

	/** Builds `aria-describedby`: the help line, and the error when there is one. */
	function describedBy(id: string, error: string | undefined) {
		return error ? `${fieldHelpId(id)} ${fieldErrorId(id)}` : fieldHelpId(id);
	}

	const FIELD_CLASSES = 'rounded-md border-creation-input-border bg-white px-4';
</script>

<!-- The Create fee board's rows under the fee types, each at the board's distance from the last. -->
<SideField
	id="name"
	label="Name"
	help="A short name for this fee."
	error={errors.name}
	class="mt-6.75"
>
	<Input
		id="name"
		name="name"
		maxlength={FEE_NAME_MAX_LENGTH}
		placeholder="Fee name"
		class="{FIELD_CLASSES} h-10.75 max-lg:h-11"
		aria-describedby={describedBy('name', errors.name)}
		bind:value={name}
	/>
</SideField>
<SideField
	id="amount"
	label="Amount"
	help="The amount delegates pay."
	error={errors.amount}
	class="mt-4.75"
>
	<FeeAmountInput
		value={values.amount}
		{currency}
		describedBy={describedBy('amount', errors.amount)}
	/>
</SideField>
<SideField
	id="description"
	label="Description"
	help="Visible to applicants."
	error={errors.description}
	class="mt-5.5"
>
	<Textarea
		id="description"
		name="description"
		maxlength={FEE_DESCRIPTION_MAX_LENGTH}
		placeholder="Optional description (e.g. what this fee includes)..."
		class="{FIELD_CLASSES} field-sizing-fixed h-19.75 min-h-0 resize-y py-2.75"
		aria-describedby={describedBy('description', errors.description)}
		bind:value={description}
	/>
	<p class="mt-0.75 text-right fs-12 lh-18 text-creation-ink-300 tabular-nums">
		{description.length}/{FEE_DESCRIPTION_MAX_LENGTH}
	</p>
</SideField>
<hr class="mt-3.75 border-creation-rule" />
<SideField
	id="appliesTo"
	label="Applies to"
	help="Who needs to pay this fee?"
	error={errors.appliesTo}
	class="mt-4.75"
>
	<IconSelect
		id="appliesTo"
		name="appliesTo"
		options={FEE_APPLIES_TO_OPTIONS}
		icon={appliesTo === 'delegation_member' ? Users : User}
		class="pl-13.5 fs-14! data-[size=default]:h-10.5 [&>svg:first-child]:size-5.5"
		describedBy={describedBy('appliesTo', errors.appliesTo)}
		bind:value={appliesTo}
	/>
</SideField>
