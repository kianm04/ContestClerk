<script lang="ts">
	import FormSelect, { type FormSelectOption } from '$lib/components/FormSelect.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { fieldId } from '$lib/form-fields';

	type Props = {
		/** Every role of the conference, by id and name. */
		roles: FormSelectOption[];
		/** The role the form was copied from, or `null` for Blank. */
		fromRoleId: string | null;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { roles, fromRoleId }: Props = $props();

	/** "Blank" first, then each role. Any value that is no role reads as Blank. */
	const options = $derived([{ value: 'blank', label: 'Blank' }, ...roles]);
</script>

<!--
	A GET form of its own: "Copy" puts `?from=<role id>` in the address and
	the page's `load` fills the form below with that role. Nothing is saved.
-->
<form method="get" class="flex max-w-2xl flex-col gap-1.5">
	<Label for={fieldId('from')} class="text-dense font-medium">Start from</Label>
	<div class="flex gap-3">
		<FormSelect
			id={fieldId('from')}
			name="from"
			value={fromRoleId ?? 'blank'}
			{options}
			class="min-w-0 flex-1"
		/>
		<Button type="submit" variant="outline" size="lg" class="max-lg:h-11">Copy</Button>
	</div>
	<p class="text-small text-muted-foreground">
		Copies a role’s scope and permissions into the form. Nothing is saved until you create the role.
	</p>
</form>
