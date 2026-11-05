<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Star from '@lucide/svelte/icons/star';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { bannerImageUrl } from '$lib/media';
	import { longDateRange } from './field-display';

	type Props = {
		/** Next year's dates, worked out from the previous edition by the page's `load`. */
		suggestion: {
			startDate: string;
			endDate: string;
			span: string;
			previousName: string;
			previousBannerPath: string | null;
		};
		/** The id of the small form, outside the step form, that "Use these dates" sends. */
		formId: string;
	};

	let { suggestion, formId }: Props = $props();
</script>

<!--
	The suggestion from last year's edition, as the design draws it: a pale
	blue strip 104 pixels tall with last year's photo flush at its left, the
	dates beside it, the "Recommended" pill in its top right corner and
	"Use these dates" in its bottom right one. `-mt-1` tucks it 4 pixels up
	under the title row, as the design has it.
	"Use these dates" belongs to a form of its own, linked by the `form`
	attribute, because a form may not sit inside another (the step form around
	this strip). It posts without JavaScript too.
	On a phone the pill and the button join the flow under the dates.
-->
<div
	class="relative -mt-1 flex items-center gap-6.75 overflow-hidden rounded-lg bg-creation-note pr-3.5 max-lg:flex-wrap max-lg:gap-3 max-lg:p-3 lg:h-26"
>
	<!-- Last year's photo, or the sample picture when that edition had none, so the strip keeps its shape. -->
	<img
		src={bannerImageUrl(suggestion.previousBannerPath)}
		alt=""
		class="h-26 w-36.75 shrink-0 object-cover max-lg:hidden"
	/>
	<div class="min-w-0">
		<p class="fs-16 lh-22 font-medium text-creation-blue-pill">
			Suggested from {suggestion.previousName}
		</p>
		<p class="mt-0.5 font-display fs-24 lh-30 font-bold text-creation-ink-950 tabular-nums">
			{longDateRange(suggestion.startDate, suggestion.endDate)}
		</p>
		<p class="fs-14 lh-20 text-creation-ink-375">{suggestion.span}</p>
	</div>
	<Badge
		class="h-7 gap-2 rounded-full border-0 bg-creation-blue px-3.25 fs-13 lh-16 font-semibold text-white lg:absolute lg:top-3 lg:right-3.5"
	>
		<Star aria-hidden="true" class="size-3.5 fill-current" />Recommended
	</Badge>
	<Button
		type="submit"
		form={formId}
		class="h-10.5 gap-3.5 rounded-md px-5 fs-15 lh-20 font-semibold hover:bg-creation-blue-hover max-lg:min-h-11 lg:absolute lg:right-3 lg:bottom-3"
	>
		Use these dates <ArrowRight aria-hidden="true" class="size-4.5" />
	</Button>
</div>
