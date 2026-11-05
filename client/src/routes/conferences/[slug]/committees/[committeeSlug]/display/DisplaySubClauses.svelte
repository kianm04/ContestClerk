<script lang="ts">
	import type { SubClauseForScreen } from '$lib/paper-on-screen';
	// A component may import itself, which is how a list draws the lists inside it.
	import DisplaySubClauses from './DisplaySubClauses.svelte';

	type Props = {
		/** The sub-clauses, each with its label, "(a)" or "(i)", and its own sub-clauses. */
		subClauses: SubClauseForScreen[];
		/** 2 for the lettered sub-clauses, 3 for the numbered ones under them, which sit closer. */
		level: 2 | 3;
	};

	let { subClauses, level }: Props = $props();
</script>

<!--
	A clause's sub-clauses as a printed resolution sets them: each label hangs
	in the gap to the left of its words, so the words of every line start at
	the same place. The labels are written out rather than drawn by the list,
	so they read the same in every browser. `{#each … (subClause.label)}` keys
	each row by its label, so Svelte keeps the right row when the list changes.
-->
{#if subClauses.length > 0}
	<ol class={['list-none p-0', level === 2 ? 'mt-[0.6vw]' : 'mt-[0.3vw]']}>
		{#each subClauses as subClause (subClause.label)}
			<li class={['relative pl-[3vw]', level === 2 ? 'mb-[0.45vw]' : 'mb-[0.2vw]']}>
				<span class="absolute top-0 left-0">{subClause.label}</span>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- made by `renderMarkdown` on the server -->
				{@html subClause.html}
				<DisplaySubClauses subClauses={subClause.subClauses} level={3} />
			</li>
		{/each}
	</ol>
{/if}
