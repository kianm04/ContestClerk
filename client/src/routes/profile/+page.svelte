<script lang="ts">
	import Award from '@lucide/svelte/icons/award';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ParagraphText from '$lib/components/ParagraphText.svelte';
	import Section from '$lib/components/Section.svelte';
	import { profileEditUrl } from '$lib/urls';
	import AwardsList from './AwardsList.svelte';
	import ConferenceHistory from './ConferenceHistory.svelte';
	import PrivateDetails from './PrivateDetails.svelte';
	import ProfileHeader from './ProfileHeader.svelte';
	import type { PageProps } from './$types';

	// `PageProps` comes from `./$types`, which SvelteKit writes for this folder,
	// so `data` is exactly what `load` in `+page.server.ts` returned. It is read
	// again whenever the page is revisited, which is how a save on
	// `/profile/edit` shows up here.
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<!-- A private page has nothing to share, so it writes its own title rather
		than using `PageMeta`, which asks for a description for the link card. -->
	<title>Your profile · MUNMeet</title>
</svelte:head>

<div class="mb-6">
	<PageHeader title="Your profile">
		<!-- `Button` with an `href` renders a link that looks like a button. The
			address comes from a helper in `$lib/urls.ts`, which is what the type of
			`href` insists on: it is built by `resolve()` and so is checked against the
			folders under `src/routes/`. -->
		<Button label="Edit profile" variant="secondary" href={profileEditUrl()} />
	</PageHeader>
</div>

<!--
	One column on a phone and three from `md` up, as the page file draws: the
	left third is who you are, the right two thirds are what you have done. On a
	phone the left column comes first, so the order is the wireframe's, with the
	private details after the About block.

	`items-start` stops the shorter column being stretched to the height of the
	taller one beside it, and `auto-rows-min` keeps each row of the grid as short
	as its own contents, the way `/home` does.
-->
<div class="grid auto-rows-min items-start gap-6 md:grid-cols-3">
	<div class="flex flex-col gap-6">
		<ProfileHeader profile={data.profile} completeness={data.completeness} />

		<Card>
			<h2 class="font-display text-h2 text-brand-900">About</h2>

			<div class="mt-2">
				{#if data.profile.bio === ''}
					<p class="text-body text-ink-600">You have not written a bio yet.</p>
				{:else}
					<ParagraphText text={data.profile.bio} />
				{/if}
			</div>
		</Card>

		<PrivateDetails details={data.details} />
	</div>

	<div class="flex flex-col gap-6 md:col-span-2">
		<Section title="Awards" icon={Award}>
			<AwardsList awards={data.awards} />
		</Section>

		<Section title="Conference history" icon={CalendarDays}>
			<ConferenceHistory entries={data.history} />
		</Section>
	</div>
</div>
