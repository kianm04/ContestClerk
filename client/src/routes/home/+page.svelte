<script lang="ts">
	import { greeting } from '$lib/home';
	import { homeHero, remainingTasks, titleRowLink } from '$lib/home-hero';
	import {
		announcementsLink,
		comingUpLink,
		conferenceRows,
		programmeSection,
		quickSessionRows
	} from '$lib/home-rows';
	import AnnouncementsSection from './AnnouncementsSection.svelte';
	import ApplicationsSection from './ApplicationsSection.svelte';
	import ComingUpSection from './ComingUpSection.svelte';
	import ExploreSection from './ExploreSection.svelte';
	import FindHero from './FindHero.svelte';
	import HomeHero from './HomeHero.svelte';
	import HomeTitleRow from './HomeTitleRow.svelte';
	import ProgrammeSection from './ProgrammeSection.svelte';
	import QuickSessionsSection from './QuickSessionsSection.svelte';
	import ToDoSection from './ToDoSection.svelte';
	import type { PageProps } from './$types';

	// `PageProps` comes from `./$types`, which SvelteKit writes for this folder:
	// `data` is what `load` in `+page.server.ts` returned (the `HomeDashboard`)
	// plus the root layout's `now` and `person`. `$props()` receives it.
	let { data }: PageProps = $props();

	// `person` is `null` only for a visitor, whom `requireOnboarded` in the load
	// function has already sent to `/login`. A `$derived` works a value out from
	// others and keeps it up to date when they change.
	const fullName = $derived(data.person?.fullName ?? '');

	// The greeting says the time of day on the reader's own clock, which the
	// server cannot know: the hour starts as the server's moment (both renders
	// must agree, or Svelte complains) and the `$effect`, which runs in the
	// browser alone once the page is on the screen, swaps in the reader's own.
	let hour = $derived(data.now.getHours());
	$effect(() => {
		hour = new Date().getHours();
	});

	// The panel at the top holds the page's one button: the reader's next
	// conference, or the invitation to find one; every rule about what it says
	// is in `$lib/home-hero.ts`. "To do" leaves out the task the hero took.
	const hero = $derived(homeHero(data, data.now));
	const tasks = $derived(remainingTasks(data.tasks, hero));

	// The programme: what is left of today at the hero conference on a
	// conference day, otherwise the next events across all the reader's
	// conferences; `null` when there is nothing to list.
	const programme = $derived(programmeSection(data, hero, data.now));

	// Every conference but the hero, with "Manage" at the right for an
	// organiser. `?all=` in the address lifts a list's limit; the address is
	// the only state this page has.
	const comingUp = $derived({
		...conferenceRows(data.upcomingConferences.slice(1), data.showAll === 'conferences'),
		link: comingUpLink(data)
	});
	const quickSessions = $derived(quickSessionRows(data.quickSessions, data.showAll === 'quick'));
</script>

<svelte:head>
	<!-- A private page has nothing to share, so it writes its own title rather
		than using `PageMeta`, which asks for a description for the link card. -->
	<title>Home · MUNMeet</title>
</svelte:head>

<!--
	The page as `docs/home.md` lays it out: one column of blocks in the order a
	reader needs them, each drawn only when it has something to say, so nothing
	is ever empty. `{#if}` draws its contents while the condition holds, and
	`{...programme}` hands an object's fields to a component as its props. The
	title row sits 1rem above the hero; the blocks under them are 2.5rem apart.
-->
<div class="flex flex-col gap-8 md:gap-10">
	<div class="flex flex-col gap-4">
		<HomeTitleRow greeting={greeting(hour, fullName)} link={titleRowLink(data)} />

		{#if hero.kind === 'conference'}
			<HomeHero {hero} />
		{:else}
			<FindHero {hero} />
		{/if}
	</div>

	{#if tasks.length > 0}
		<ToDoSection {tasks} now={data.now} />
	{/if}

	{#if programme !== null}
		<ProgrammeSection {...programme} />
	{/if}

	{#if data.announcements.length > 0}
		<AnnouncementsSection
			announcements={data.announcements}
			link={announcementsLink(data.announcements)}
			now={data.now}
		/>
	{/if}

	{#if comingUp.rows.length > 0}
		<ComingUpSection {...comingUp} />
	{/if}

	{#if data.myApplications.length > 0}
		<ApplicationsSection entries={data.myApplications} now={data.now} />
	{/if}

	{#if quickSessions.rows.length > 0}
		<QuickSessionsSection {...quickSessions} />
	{/if}

	{#if data.exploreConferences.length > 0}
		<ExploreSection conferences={data.exploreConferences} now={data.now} />
	{/if}
</div>
