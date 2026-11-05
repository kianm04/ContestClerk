<script lang="ts">
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import { paperStatusLine, type PaperListItem } from '$lib/committee-papers';

	type Props = {
		paper: Pick<PaperListItem, 'status' | 'isOpenForSignatures'>;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { paper }: Props = $props();

	// `$derived` works this out again whenever `paper` changes.
	const status = $derived(paperStatusLine(paper));
</script>

<!--
	Where a paper stands, in a word. A coloured dot comes before it only when
	the colour says something, such as amber for a paper waiting on the dais;
	"Being written" is the ordinary state and has none (docs/DESIGN.md, "Lists").
-->
{#if status.tone === 'neutral'}
	<span class="text-small whitespace-nowrap text-foreground">{status.text}</span>
{:else}
	<StatusDot text={status.text} tone={status.tone} />
{/if}
