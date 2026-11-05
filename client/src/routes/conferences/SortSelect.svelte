<script lang="ts">
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import FormSelect from '$lib/components/FormSelect.svelte';
	import { Label } from '$lib/components/ui/label';
	import { SORT_OPTIONS, type ConferenceSort } from '$lib/conferences';
	import { fieldId } from '$lib/form-fields';

	type Props = {
		/** The order the results on screen are in. */
		sort: ConferenceSort;
	};

	let { sort }: Props = $props();

	const selectId = fieldId('sort');
</script>

<!--
	"Sort by: Upcoming" on the results line, as the mockup draws it (Trello
	WMcXfry0), with the label beside the box rather than above it like the
	filters. The dropdown is shadcn's `Select` (`FormSelect`), inside the one
	filter form, so a change navigates like any other filter, and without
	JavaScript it is the browser's own and is sent with the form.
-->
<div class="flex items-center gap-2">
	<SlidersHorizontal
		size={14}
		strokeWidth={1.75}
		class="text-muted-foreground"
		aria-hidden="true"
	/>
	<Label for={selectId} class="text-muted-foreground">Sort by:</Label>
	<FormSelect id={selectId} name="sort" value={sort} options={SORT_OPTIONS} class="w-36" />
</div>
