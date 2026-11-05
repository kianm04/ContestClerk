<script lang="ts">
	import ParagraphText from '$lib/components/ParagraphText.svelte';
	import type { PanelFact } from '$lib/application-panel';
	import { NOT_PROVIDED } from '$lib/application-review';

	type Props = {
		/** School, experience, age, preferences and diet, in that order. */
		facts: PanelFact[];
		/** Why the applicant wants to come, as they typed it, or null. */
		motivation: string | null;
	};

	let { facts, motivation }: Props = $props();
</script>

<!-- A description list: each `<dt>` is a label and the `<dd>` after it its value. -->
<dl
	class="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2 border-b border-border py-4 text-dense"
>
	<!-- The `(fact.label)` key lets Svelte reuse lines instead of rebuilding them. -->
	{#each facts as fact (fact.label)}
		<dt class="text-muted-foreground">{fact.label}</dt>
		<dd class="text-foreground">{fact.value}</dd>
	{/each}
</dl>

<div class="pt-4">
	<h3 class="mb-2 text-dense font-medium text-foreground">Motivation</h3>
	<ParagraphText text={motivation ?? NOT_PROVIDED} />
</div>
