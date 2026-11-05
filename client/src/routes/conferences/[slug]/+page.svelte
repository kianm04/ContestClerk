<script lang="ts">
	// `page` from `$app/state` is the page being shown. Only its address is read
	// here, to work out where the apply button sends somebody who is signed out.
	import { page } from '$app/state';
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import PageMeta from '$lib/components/shell/PageMeta.svelte';
	import { applyPanelState, conferenceShareSentence } from '$lib/conferences';
	import { splitIntoParagraphs } from '$lib/text';
	import {
		applyUrl,
		conferenceAnnouncementsUrl,
		conferenceListUrl,
		manageConferenceUrl,
		newDelegationUrl,
		pathThroughRegister
	} from '$lib/urls';
	import type { PageProps } from './$types';
	import ApplyPanel from './ApplyPanel.svelte';
	import CommitteeGrid from './CommitteeGrid.svelte';
	import ConferenceAbout from './ConferenceAbout.svelte';
	import ConferenceFacts from './ConferenceFacts.svelte';
	import ConferenceHero from './ConferenceHero.svelte';
	import PublicProgramme from './PublicProgramme.svelte';
	import ResourceList from './ResourceList.svelte';
	import TeamList from './TeamList.svelte';

	// `PageProps` comes from `./$types`, which SvelteKit writes for this folder, so
	// `data` is exactly what `load` in `+page.server.ts` returned. It is replaced
	// with fresh data every time the URL changes.
	let { data }: PageProps = $props();

	// `$derived` keeps this up to date when the page is reused for another
	// conference, for example after following a link from one to the next.
	const conference = $derived(data.conference);

	// The one thing the apply panel says. The rule itself is in `$lib/conferences.ts`.
	const state = $derived(applyPanelState(conference, data.viewer, data.now, data.today));

	/*
		Where the apply panel's two buttons send the reader. Somebody signed in goes
		straight to the page; everybody else goes to the create account page
		carrying that address. `pathThroughRegister` in `$lib/urls.ts` is the whole
		rule, and its doc comment says why a relative address has to be resolved
		first. `data.person`
		comes from the root layout's `load` and is `null` for a reader who is not
		signed in.
	*/
	const isSignedIn = $derived(data.person !== null);
	const applyHref = $derived(
		pathThroughRegister(applyUrl(conference.slug), page.url.pathname, isSignedIn)
	);
	const registerDelegationHref = $derived(
		pathThroughRegister(newDelegationUrl(conference.slug), page.url.pathname, isSignedIn)
	);

	// "Announcements" beside the programme's "Full schedule", for a participant
	// or a member of staff only: anybody else would be met with a 404 there.
	const announcementsHref = $derived(
		data.canReadAnnouncements ? conferenceAnnouncementsUrl(conference.slug) : null
	);

	// The first paragraph of the description, or '' when there is no description.
	const firstParagraph = $derived(splitIntoParagraphs(conference.description ?? '')[0] ?? '');

	// What a shared link and a search result say under the name. `||` takes the
	// first of the three that is not empty, so the written sentence is only used
	// when the organisers gave us neither a tagline nor a description.
	const shareDescription = $derived(
		conference.tagline || firstParagraph || conferenceShareSentence(conference)
	);
</script>

<PageMeta title={conference.name} description={shareDescription} imageUrl={data.shareImageUrl} />

<!-- `pb-28` keeps the bar fixed along the bottom of a phone screen off the last
	thing on the page. There is no bar from `lg` up, so the room is given back. -->
<div class="flex flex-col gap-8 pb-28 lg:pb-0">
	{#if conference.status === 'draft'}
		<Notice tone="warning" title="Draft preview">
			Only your team can see this page.

			<!-- The notice is shown to every member of the team, but only an
				organiser may open the management area: `has_permission(id, 'administrator')` is
				false for a chair and for a volunteer, who would be met with a 404. -->
			{#if data.viewer.canManage}
				<div class="mt-2">
					<Button
						label="Manage"
						variant="secondary"
						size="sm"
						href={manageConferenceUrl(conference.slug)}
					/>
				</div>
			{/if}
		</Notice>
	{/if}

	<ConferenceHero {conference} now={data.now} />

	<!-- One column on a phone; from `lg` up the panel and the facts move into a
		second column, and `minmax(0,1fr)` stops a long word pushing it off screen. -->
	<div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
		<div class="flex flex-col gap-8">
			<ConferenceAbout description={conference.description} isStaff={data.viewer.isStaff} />

			<!-- Under `lg` the facts sit here, under About: there is no second column. -->
			<div class="lg:hidden">
				<ConferenceFacts {conference} canManage={data.viewer.canManage} />
			</div>
			<CommitteeGrid committees={data.committees} conferenceSlug={conference.slug} />

			<TeamList team={data.team} />

			{#if data.programme.length > 0}
				<PublicProgramme events={data.programme} {conference} now={data.now} {announcementsHref} />
			{/if}
			<ResourceList resources={data.resources} />
		</div>

		<!-- The same panel and the same facts a second time, for a wide screen. Only
			one copy is ever on show: `getByRole` in a browser test ignores anything
			`display:none`, so a test still finds exactly one of each. -->
		<div class="hidden lg:block">
			<div class="sticky top-20 flex flex-col gap-6">
				<ApplyPanel {state} {conference} {applyHref} {registerDelegationHref} />
				<ConferenceFacts {conference} canManage={data.viewer.canManage} />
			</div>
		</div>
	</div>

	<p><a href={conferenceListUrl()} class="text-brand-700">Back to all conferences</a></p>
</div>

<!-- Under `lg` the apply panel is a bar fixed along the bottom of the screen, so
	the one action a delegate came for is always within reach. -->
<div class="fixed inset-x-0 bottom-0 z-10 p-4 shadow-card lg:hidden">
	<ApplyPanel {state} {conference} {applyHref} {registerDelegationHref} isCompact />
</div>
