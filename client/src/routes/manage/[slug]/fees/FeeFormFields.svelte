<script lang="ts">
	import SelectField from '$lib/components/SelectField.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import {
		FEE_APPLIES_TO_OPTIONS,
		FEE_NAME_MAX_LENGTH,
		type FeeFormErrors,
		type FeeFormValues
	} from '$lib/fees';

	type Props = {
		/** What the fields show: an empty form, the fee being edited, or what was typed. */
		values: FeeFormValues;
		/** One message per field that has something wrong with it. */
		errors: FeeFormErrors;
		/** A three-letter ISO 4217 code, such as `EUR`, named in the amount's label. */
		currency: string;
		/** True when the fields belong to an existing fee rather than a new one. */
		isEditing: boolean;
	};

	let { values, errors, currency, isEditing }: Props = $props();

	/* Amounts are typed with at most two decimals and never below nothing. This
	   is the browser's own check; `validateFeeForm` on the server is the one that
	   counts. */
	const AMOUNT_STEP = '0.01';
	const SMALLEST_AMOUNT = '0';

	/*
		Under the list, the name box is the start of the "Add a fee" row and says
		so in its label; while editing, it is plainly the fee's name.
	*/
	const nameLabel = $derived(isEditing ? 'Name' : 'Add a fee');
	const amountLabel = $derived(`Amount in ${currency}`);
</script>

<!--
	Three fields with no box of their own around them, so each one is a cell of
	the grid `FeeForm` lays them out in, next to its button.
-->
<TextField
	label={nameLabel}
	name="name"
	value={values.name}
	error={errors.name}
	placeholder="Name, such as Late fee"
	isRequired
	maxLength={FEE_NAME_MAX_LENGTH}
	isDense
/>

<TextField
	label={amountLabel}
	name="amount"
	value={values.amount}
	error={errors.amount}
	type="number"
	placeholder="55.00"
	isRequired
	min={SMALLEST_AMOUNT}
	step={AMOUNT_STEP}
	isDense
/>

<SelectField
	label="Charged to"
	name="appliesTo"
	value={values.appliesTo}
	error={errors.appliesTo}
	options={FEE_APPLIES_TO_OPTIONS}
	isRequired
	isDense
/>
