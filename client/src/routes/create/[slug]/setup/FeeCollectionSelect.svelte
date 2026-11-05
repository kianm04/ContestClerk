<script lang="ts">
	import { fieldHelpId } from '$lib/form-fields';
	import IconSelect from './IconSelect.svelte';

	type Props = {
		/** `stripe` or `manual`, as the form sends it. */
		collection: string;
	};

	// `$bindable()` lets the fields write `bind:collection`, which picks the help line and the Stripe box.
	let { collection = $bindable() }: Props = $props();

	const OPTIONS = [
		{ value: 'stripe', label: 'Through MUNMeet' },
		{ value: 'manual', label: 'Collected externally' }
	];
</script>

<!-- The Edit fee board draws the method as a dropdown with a filled radio dot at its left. -->
<IconSelect
	id="collection"
	name="collection"
	options={OPTIONS}
	class="pl-12 fs-17! data-[size=default]:h-10.75"
	describedBy={fieldHelpId('collection')}
	bind:value={collection}
/>
