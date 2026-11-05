<script lang="ts">
	import BookOpen from '@lucide/svelte/icons/book-open';
	import ParagraphText from '$lib/components/ParagraphText.svelte';
	import Section from '$lib/components/Section.svelte';

	type Props = {
		/** What the organisers wrote about the conference, or `null` when they wrote nothing. */
		description: string | null;
		/** True for the conference's own team, who are nudged when there is no description. */
		isStaff: boolean;
	};

	let { description, isStaff }: Props = $props();
</script>

{#if description}
	<Section title="About" icon={BookOpen}>
		<ParagraphText text={description} />
	</Section>
{:else if isStaff}
	<!-- The line about a missing description is a nudge for the team. A
		visitor sees no About section at all. -->
	<Section title="About" icon={BookOpen}>
		<ParagraphText text="The organisers have not written a description yet." />
	</Section>
{/if}
