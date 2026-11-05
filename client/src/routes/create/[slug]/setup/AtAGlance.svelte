<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import CreationPanel from '$lib/components/creation/CreationPanel.svelte';
	import type { CreationStatus } from '$lib/components/creation/StatusChip.svelte';
	import type { CreationPreview } from '$lib/creation-draft';
	import { bannerImageUrl } from '$lib/media';
	import GlanceFacts from './GlanceFacts.svelte';
	import SetupProgress from './SetupProgress.svelte';

	type Props = {
		preview: CreationPreview;
		statuses: {
			publicPage: CreationStatus;
			committees: CreationStatus;
			applications: CreationStatus;
			fees: CreationStatus;
		};
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { preview, statuses }: Props = $props();
</script>

<!--
	The right-hand column as one panel: the conference as delegates will meet
	it, then how far Setup is. From a laptop up the panel fills its column
	(`flex-1`), and the empty `flex-1` block before the rule takes whatever
	height is left, so Setup progress sits at the foot of the panel, level with
	the end of the left column.
-->
<CreationPanel
	title="Conference at a glance"
	description="This is a draft. You can change everything later."
	icon={Eye}
	size="small"
	class="pb-5 lg:flex lg:flex-1 lg:flex-col"
	headerClass="gap-4"
>
	<!-- The banner, or the sample picture until one is uploaded, with the Draft pill on it. -->
	<div class="relative mt-3">
		<img
			src={bannerImageUrl(preview.bannerPath)}
			alt=""
			class="block h-46 w-full rounded-lg object-cover"
		/>
		<span
			class="absolute top-2.5 right-2 inline-flex h-7 items-center gap-2 rounded-full bg-white px-3 fs-13 font-medium text-creation-ink-650 shadow-creation-pill"
		>
			<span aria-hidden="true" class="size-2 rounded-full bg-creation-blue"></span>
			Draft
		</span>
	</div>

	<h3 class="mt-3 font-display fs-24 lh-30 font-bold break-words text-creation-ink-950">
		{preview.name}
	</h3>
	<p class="fs-14 lh-20 text-creation-ink-375">Organised by {preview.organizedBy}</p>
	<GlanceFacts facts={preview.facts} />

	<div aria-hidden="true" class="min-h-4 flex-1"></div>
	<hr class="border-creation-rule" />
	<SetupProgress {statuses} />
</CreationPanel>
