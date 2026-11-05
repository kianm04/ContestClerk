<script lang="ts">
	import TextField from '$lib/components/TextField.svelte';
	import type { FeeFormErrors, FeeFormValues } from '$lib/fees';

	type Props = {
		/** What the fields show: an empty form, the fee being edited, or what was typed. */
		values: FeeFormValues;
		/** One message per field that has something wrong with it. */
		errors: FeeFormErrors;
		/** The conference's timezone, which the two times are read in. */
		timezone: string;
	};

	let { values, errors, timezone }: Props = $props();

	const windowHelp = $derived(`Times are in ${timezone}.`);
</script>

<!-- Both bounds are optional: a fee with neither is charged all the way
	through, and one with an end date is the early bird price. -->
<div class="grid gap-4 md:grid-cols-2">
	<TextField
		label="Valid from"
		name="validFrom"
		value={values.validFrom}
		type="datetime-local"
		help={windowHelp}
		isDense
	/>

	<TextField
		label="Valid until"
		name="validUntil"
		value={values.validUntil}
		error={errors.validUntil}
		type="datetime-local"
		help={windowHelp}
		isDense
	/>
</div>
