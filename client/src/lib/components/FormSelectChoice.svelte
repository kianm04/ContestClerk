<script lang="ts">
	type Props = {
		label: string;
		/** Grey words after the label, such as a role's scope, or nothing. */
		detail?: string;
	};

	let { label, detail }: Props = $props();
</script>

<!-- The choice shown on a closed `FormSelect`: "Chair · assigned committees". -->
<span>
	{label}
	{#if detail}
		<span class="text-muted-foreground">· {detail}</span>
	{/if}
</span>
