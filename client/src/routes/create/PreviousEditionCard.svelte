<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import History from '@lucide/svelte/icons/history';
	import CreationPanel from '$lib/components/creation/CreationPanel.svelte';
	import type { EditionComparison } from '$lib/creation-start';
	import { conferenceUrl } from '$lib/urls';
	import EditionSummary from './EditionSummary.svelte';
	import SuggestedEdition from './SuggestedEdition.svelte';

	type Props = {
		/** From `editionComparison()` in `$lib/creation-start.ts`. */
		comparison: EditionComparison;
		organizationName: string;
		/** The previous conference's address and banner, for "View details" and the thumbnails. */
		previousSlug: string;
		bannerPath: string | null;
		/** The `id` of the step's form, which "Use this setup" sends. */
		formId: string;
	};

	let { comparison, organizationName, previousSlug, bannerPath, formId }: Props = $props();
</script>

<!--
	The organisation's latest conference on the left and the next edition this
	draft would start as on the right, a 26 pixel arrow in the 52 pixel gap
	between them, in the design's proportions (411, 52, 510). The arrow only
	makes sense side by side, so a phone stacks the cards without it. The
	design cuts this panel off at the foot of the board; it is drawn whole,
	with 16 pixels under the cards.
-->
<CreationPanel
	title="We found your previous conference"
	description="Based on {organizationName}, we can prepare a draft with the most important details."
	icon={History}
	class="pt-4 pb-4"
>
	<div class="mt-3.5 grid items-center gap-3.5 lg:grid-cols-[411fr_52fr_510fr] lg:gap-0">
		<EditionSummary
			edition={comparison.previous}
			{bannerPath}
			detailsHref={conferenceUrl(previousSlug)}
		/>
		<ArrowRight
			aria-hidden="true"
			class="hidden size-6.5 justify-self-center text-creation-ink-600 lg:block"
		/>
		<SuggestedEdition next={comparison.next} {bannerPath} {formId} />
	</div>
</CreationPanel>
