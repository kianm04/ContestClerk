<script lang="ts">
	import PaperSideHeading from '$lib/components/paper-side/PaperSideHeading.svelte';

	type Props = {
		/** "With the dais" or "Approved". */
		title: string;
		/** What happens next, from `withTheDaisSentence` or `approvedSentence`. */
		sentence: string;
	};

	let { title, sentence }: Props = $props();
</script>

<!-- Beside a paper its authors sent to the dais, in the margin's place: who decides, and what. -->
<section aria-label={title}>
	<PaperSideHeading {title} />
	<p class="mt-3 text-body text-foreground">{sentence}</p>
</section>
