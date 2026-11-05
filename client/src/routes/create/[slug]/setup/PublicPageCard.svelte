<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	import CreationPanel from '$lib/components/creation/CreationPanel.svelte';
	import StatusChip, { type CreationStatus } from '$lib/components/creation/StatusChip.svelte';
	import type { CreationDraft } from '$lib/creation-draft';
	import { bannerImageUrl } from '$lib/media';
	import { createStepUrl } from '$lib/urls';
	import PanelLink from './PanelLink.svelte';
	import PublicPageFacts from './PublicPageFacts.svelte';
	import PublicPageLines from './PublicPageLines.svelte';

	type Props = {
		slug: string;
		draft: CreationDraft;
		status: CreationStatus;
		/** Description, Banner and Contact email, in words. */
		facts: { label: string; value: string }[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { slug, draft, status, facts }: Props = $props();
</script>

<!-- The `id` is what "Public page" in Setup progress links to. -->
<div id="public-page" class="scroll-mt-24">
	<CreationPanel
		title="Public page"
		description="Name, description, branding and contact details."
		icon={FileText}
		size="small"
	>
		<!-- `{#snippet actions()}` fills the panel's space on the right of its title. -->
		{#snippet actions()}
			<div class="flex items-center gap-3.75">
				<StatusChip {status} />
				<PanelLink href={createStepUrl(slug, 'basics')} label="Edit basics" />
			</div>
		{/snippet}

		<!--
			One bordered box, 136 design pixels tall: the banner filling its height,
			the name with its three lines, a hairline, then the facts. On a phone
			the parts stack and the box grows to fit them.
		-->
		<div
			class="mt-1.5 flex rounded-lg border border-creation-card-border bg-white p-1 max-lg:flex-col max-lg:gap-3 lg:h-34"
		>
			<!-- The banner, or the sample picture until one is uploaded, so the box keeps its shape. -->
			<img
				src={bannerImageUrl(draft.bannerPath)}
				alt=""
				class="h-26.25 w-full shrink-0 rounded-md object-cover lg:h-full lg:w-75"
			/>
			<PublicPageLines {draft} class="lg:ml-5" />
			<span
				aria-hidden="true"
				class="my-3.5 mr-6.5 ml-4 w-px shrink-0 bg-creation-rule max-lg:hidden"
			></span>
			<PublicPageFacts {facts} />
		</div>
	</CreationPanel>
</div>
