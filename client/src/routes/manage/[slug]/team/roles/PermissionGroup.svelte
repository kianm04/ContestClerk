<script lang="ts">
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import type { Permission } from '$lib/permissions';
	import type { PermissionSection } from '$lib/roles';
	import PermissionLine from './PermissionLine.svelte';

	type Props = {
		section: PermissionSection;
		/** Called when the reader ticks or unticks one of the boxes. */
		onTick: (key: Permission, isChecked: boolean) => void;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { section, onTick }: Props = $props();
</script>

<!-- One of the six groups of the permission catalogue, with its own heading. -->
<ManageSection title={section.title}>
	<fieldset>
		<legend class="sr-only">{section.title}</legend>

		<!-- The `(line.key)` key lets Svelte keep each box as the others change. -->
		{#each section.lines as line (line.key)}
			<PermissionLine {line} onChange={(isChecked) => onTick(line.key, isChecked)} />
		{/each}
	</fieldset>

	{#if section.note}
		<p class="mt-2.5 max-w-2xl text-small text-muted-foreground">{section.note}</p>
	{/if}
</ManageSection>
