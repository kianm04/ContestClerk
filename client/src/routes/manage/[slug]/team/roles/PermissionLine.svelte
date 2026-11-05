<script lang="ts">
	import FormCheckbox from '$lib/components/FormCheckbox.svelte';
	import { Label } from '$lib/components/ui/label';
	import { fieldId } from '$lib/form-fields';
	import type { PermissionLine } from '$lib/roles';
	import { cn } from '$lib/utils';

	type Props = {
		line: PermissionLine;
		/** Called when the reader ticks or unticks the box. */
		onChange: (isChecked: boolean) => void;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { line, onChange }: Props = $props();

	const boxId = $derived(fieldId(`permission-${line.key}`));
</script>

<!--
	One permission: its box, its name, the grey "per committee" when it is
	one, a line of help, and at the right why it cannot be changed, if so. A
	disabled box sends nothing; `readRoleForm` adds back what it stood for.
-->
<div class="flex items-start gap-3 border-b border-border py-3">
	<div class="pt-1">
		<FormCheckbox
			id={boxId}
			name="permission"
			value={line.key}
			isChecked={line.isChecked}
			isDisabled={line.isDisabled}
			{onChange}
		/>
	</div>

	<div class="flex min-w-0 flex-1 flex-col gap-0.5">
		<Label
			for={boxId}
			class={cn(
				'text-body font-medium',
				line.isDisabled ? 'text-muted-foreground' : 'text-foreground'
			)}
		>
			{line.label}
			{#if line.isPerCommittee}
				<span class="text-small font-normal text-muted-foreground">per committee</span>
			{/if}
		</Label>
		<p class="text-small text-muted-foreground">{line.help}</p>
	</div>

	{#if line.aside}
		<p class="text-small text-muted-foreground max-sm:hidden">{line.aside}</p>
	{/if}
</div>
