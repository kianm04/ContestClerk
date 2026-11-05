<script lang="ts">
	import ConferencePreview from '$lib/components/creation/ConferencePreview.svelte';
	import type { CreationPreview } from '$lib/creation-draft';

	type Props = {
		/** From `basicsPreview()`: the draft as typed so far, with the facts Basics shows. */
		preview: CreationPreview;
	};

	let { preview }: Props = $props();

	/*
		The design's four lines under the tagline: the dates, the place, who
		organises it, and who it is for. `basicsPreview()` gives the dates, the
		place and the level; "Organised by" goes in third, as the design has it.
		The fourth line is the draft's level ("University delegates") rather
		than the design's "Open to delegates worldwide", which nothing in the
		draft says.
	*/
	const facts = $derived([
		...preview.facts.filter((fact) => fact.kind !== 'level'),
		{ kind: 'organiser' as const, text: `Organised by ${preview.organizedBy}` },
		...preview.facts.filter((fact) => fact.kind === 'level')
	]);
</script>

<ConferencePreview
	preview={{ ...preview, facts }}
	variant="basics"
	note={{
		title: 'These basics shape your public page',
		text: 'The name, description, and branding will be visible to delegates on MUNMeet. You can change these details at any time.'
	}}
/>
