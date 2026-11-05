<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Button from '$lib/components/Button.svelte';
	import ActionRow from '$lib/components/manage/ActionRow.svelte';
	import ConferencePreviewCard from '$lib/components/manage/ConferencePreviewCard.svelte';
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import { conferenceUrl, manageConferenceUrl } from '$lib/urls';
	import ShareLink from './ShareLink.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned together with what the
	// layout above it loaded, which is where the conference itself comes from.
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<!-- A private page has nothing to share, so it writes its own title rather
		than using `PageMeta`, which asks for a description for the link card. -->
	<title>Published · {data.conference.name} · MUNMeet</title>
</svelte:head>

<!--
	Where "Publish conference" lands (the manage redesign). Two columns on a
	wide screen, one on a phone: `flex-wrap` drops the preview under the rest.
-->
<div class="flex flex-wrap items-start gap-x-16 gap-y-10 lg:pt-6">
	<div class="flex min-w-0 flex-1 basis-110 flex-col gap-7">
		<div>
			<p class="mb-3.5"><StatusDot text="Published" tone="success" /></p>
			<h1 class="font-display text-h1-mobile text-foreground md:text-[2.5rem] md:leading-12">
				{data.headline.title}
			</h1>
			<p class="mt-3 text-lg leading-7 text-muted-foreground">{data.headline.sentence}</p>
		</div>

		<ShareLink publicPath={conferenceUrl(data.conference.slug)} />

		<ManageSection title="Good next steps">
			<ul>
				<!-- The `(step.key)` key lets Svelte reuse rows instead of rebuilding them. -->
				{#each data.nextSteps as step (step.key)}
					<ActionRow title={step.title} detail={step.detail}>
						<a href={step.href} class="font-medium text-link">{step.linkLabel}</a>
					</ActionRow>
				{/each}
			</ul>
		</ManageSection>

		<div>
			<Button
				label="Go to the dashboard"
				variant="secondary"
				size="dense"
				href={manageConferenceUrl(data.conference.slug)}
				icon={ArrowRight}
				isIconAfterLabel
			/>
		</div>
	</div>

	<aside aria-label="What visitors see" class="min-w-60 flex-1 basis-80 xl:grow-0">
		<ConferencePreviewCard preview={data.preview} />
	</aside>
</div>
