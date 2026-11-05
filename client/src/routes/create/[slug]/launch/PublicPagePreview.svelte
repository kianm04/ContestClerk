<script lang="ts">
	import Clock from '@lucide/svelte/icons/clock';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Eye from '@lucide/svelte/icons/eye';
	import type { ResolvedPathname } from '$app/types';
	import IconCircle from '$lib/components/creation/IconCircle.svelte';
	import InfoBox from '$lib/components/creation/InfoBox.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import type { CreationPreview } from '$lib/creation-draft';
	import { bannerImageUrl } from '$lib/media';
	import PreviewFactLines from './PreviewFactLines.svelte';

	type Props = {
		preview: CreationPreview;
		/** The blue note at the foot, about when applications open. */
		applicationsNote: { title: string; text: string };
		/** The conference's public page, which its organisers can already open. */
		publicUrl: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { preview, applicationsNote, publicUrl }: Props = $props();

	// The design's preview is the banner, the name and five facts: the fees are
	// already in "What applicants will see". `$derived` works this out again
	// whenever `preview` changes.
	const facts = $derived(preview.facts.filter((fact) => fact.kind !== 'fees'));
</script>

<!--
	The public page as it will look, in the design's 512 pixel panel: a 40
	pixel circle and a sans title rather than the serif of the panels on the
	left, a link to the real page (organisers can open a draft's page), the
	160 pixel banner with the white "Draft" pill over it, the name, five facts
	and the note. Until a banner is uploaded the sample picture stands in, so
	nothing moves when the real one comes.
-->
<section
	class="rounded-xl border border-creation-panel-border bg-white pt-2 pr-4.75 pb-3.25 pl-5 shadow-creation-panel lg:min-h-128"
>
	<div class="flex min-h-10 items-center gap-3.5">
		<IconCircle icon={Eye} class="size-10" iconClass="size-5" />
		<h2 class="fs-16 lh-20 font-semibold text-creation-ink-950">Public page preview</h2>
		<a
			href={publicUrl}
			class="ml-auto inline-flex shrink-0 items-center gap-2 fs-13 font-semibold text-creation-blue hover:text-creation-blue-hover max-lg:min-h-11"
		>
			View full page
			<ExternalLink class="size-4" aria-hidden="true" />
		</a>
	</div>
	<div class="relative mt-2">
		<!-- Decorative here: the conference's name is written right under it. -->
		<img
			src={bannerImageUrl(preview.bannerPath)}
			alt=""
			class="h-40 w-full rounded-lg object-cover"
		/>
		<Badge
			variant="outline"
			class="absolute top-2.75 right-3.5 h-7 gap-2 rounded-full border-0 bg-white px-3 fs-13 font-medium text-creation-ink-650 shadow-creation-pill"
		>
			<span aria-hidden="true" class="size-2 rounded-full bg-creation-blue"></span>
			Draft
		</Badge>
	</div>
	<h3 class="mt-3.25 font-display fs-24 lh-30 font-bold break-words text-creation-ink-950">
		{preview.name}
	</h3>
	<p class="fs-14 lh-20 text-creation-ink-375">Organised by {preview.organizedBy}</p>
	<PreviewFactLines {facts} />
	<InfoBox
		icon={Clock}
		title={applicationsNote.title}
		text={applicationsNote.text}
		class="mt-2.75 min-h-14.25 gap-4.75 pt-2.25 pr-4.5 pb-1.25 pl-4.5"
		iconClass="mt-0"
		titleClass="fs-13 lh-22"
		textClass="fs-13 lh-22"
	/>
</section>
