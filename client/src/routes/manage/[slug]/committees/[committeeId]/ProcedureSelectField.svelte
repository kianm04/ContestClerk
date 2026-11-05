<script lang="ts">
	import FieldError from '$lib/components/FieldError.svelte';
	import FormSelect, { type FormSelectOption } from '$lib/components/FormSelect.svelte';
	import { Label } from '$lib/components/ui/label';
	import { fieldErrorId, fieldId } from '$lib/form-fields';

	type Props = {
		/** The words above the dropdown, as section 5 names the setting. */
		label: string;
		name: string;
		value: string;
		options: FormSelectOption[];
		/** A quiet line under the dropdown, from section 5's notes. */
		help: string;
		error?: string;
		/** Called after every pick, for a form that changes with it. */
		onChange?: (value: string) => void;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { label, name, value, options, help, error, onChange }: Props = $props();
</script>

<!-- One setting chosen from a short list: its name, the dropdown, a line of help, and what is wrong. -->
<div class="flex flex-col gap-1.5">
	<Label for={fieldId(name)} class="text-small font-medium">{label}</Label>
	<FormSelect id={fieldId(name)} {name} {value} {options} class="max-w-sm" {onChange} />
	<p class="text-small text-muted-foreground">{help}</p>
	<FieldError id={fieldErrorId(name)} message={error} />
</div>
