<script lang="ts">
	import SelectField from '$lib/components/SelectField.svelte';
	import type { SelectOption } from '$lib/components/SelectField.svelte';
	import { labelClasses } from '$lib/form-fields';

	type Props = {
		/** The code the conference is saved with, such as `EUR`. */
		value: string;
		/** Every currency the app knows, such as "EUR · Euro". */
		options: SelectOption[];
		/** True once the conference has an invoice, which fixes its currency for good. */
		isLocked: boolean;
		/** What is wrong with the chosen currency, if anything. */
		error?: string;
	};

	let { value, options, isLocked, error }: Props = $props();
</script>

<!--
	A locked currency has no control at all rather than a disabled one. A
	disabled control sends nothing when the form is posted, and the server would
	then have to guess whether that silence meant "unchanged" or "cleared";
	saying it in words leaves nothing to guess. The server puts the saved code
	back either way, so a request put together by hand cannot change it.
-->
{#if isLocked}
	<div>
		<p class={labelClasses(true)}>Currency</p>
		<p class="text-dense text-foreground">{value}</p>
		<p class="mt-1 text-small text-muted-foreground">
			The currency cannot change once invoices exist.
		</p>
	</div>
{:else}
	<SelectField
		label="Currency"
		name="currency"
		{value}
		{options}
		{error}
		isRequired
		help="It cannot change once invoices exist."
		isDense
	/>
{/if}
