<script lang="ts">
	import FormCheckbox from '$lib/components/FormCheckbox.svelte';
	import { Label } from '$lib/components/ui/label';
	import { fieldId } from '$lib/form-fields';

	type Props = {
		/** The name the box is sent under when it is ticked. */
		name: string;
		/** The setting, as section 5 names it. */
		label: string;
		/** A quiet line under the words, from section 5's notes. */
		help: string;
		isChecked: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { name, label, help, isChecked }: Props = $props();
</script>

<!-- One setting that is on or off: the box, then its words, which read as a sentence. -->
<div class="flex items-start gap-3">
	<div class="pt-0.5">
		<FormCheckbox id={fieldId(name)} {name} value="on" {isChecked} />
	</div>
	<div class="flex min-w-0 flex-col gap-0.5">
		<Label for={fieldId(name)} class="text-body font-medium text-foreground">{label}</Label>
		<p class="text-small text-muted-foreground">{help}</p>
	</div>
</div>
