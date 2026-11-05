<script lang="ts">
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import FileText from '@lucide/svelte/icons/file-text';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import DangerZone from '$lib/components/DangerZone.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Section from '$lib/components/Section.svelte';
	import Sidebar, { type SidebarGroup } from '$lib/components/Sidebar.svelte';
	import Stat from '$lib/components/Stat.svelte';
	import Tabs, { type Tab } from '$lib/components/Tabs.svelte';
	import { EMPTY_CONFERENCE_QUERY } from '$lib/conferences';
	import { conferenceListUrl, createConferenceUrl, styleguideUrl } from '$lib/urls';
	import Example from './Example.svelte';
	import Group from './Group.svelte';

	// Every `href` prop is a `ResolvedPathname`, which is what a helper in
	// `$lib/urls.ts` hands back. A hand-written string fails the type check.
	//
	// Both components key their list by the address, so every item has to point
	// somewhere different. These point at pages that really exist, so a teammate
	// can press one and see where it goes.
	const sidebarGroups: SidebarGroup[] = [
		{ items: [{ label: 'Styleguide', href: styleguideUrl(), isActive: true }] },
		{
			heading: 'Elsewhere',
			items: [
				{ label: 'Conferences', href: conferenceListUrl(), isActive: false },
				{ label: 'Create a conference', href: createConferenceUrl(), isActive: false }
			]
		}
	];

	const tabs: Tab[] = [
		{ label: 'All', href: conferenceListUrl(), isActive: true, count: 42 },
		{
			label: 'Netherlands',
			href: conferenceListUrl({ ...EMPTY_CONFERENCE_QUERY, country: 'NL' }),
			isActive: false,
			count: 12
		},
		{
			label: 'Switzerland',
			href: conferenceListUrl({ ...EMPTY_CONFERENCE_QUERY, country: 'CH' }),
			isActive: false
		}
	];
</script>

<Group id="layout" title="Layout">
	<Example name="PageHeader" props="title, subtitle, eyebrow, children (the actions)">
		<PageHeader
			eyebrow="Riverside MUN 2027"
			title="Applications"
			subtitle="342 people have applied so far."
		>
			<Button label="Export CSV" variant="secondary" size="sm" type="button" />
		</PageHeader>
	</Example>

	<Example name="Section" props="title, icon, description, viewAllHref">
		<Section
			title="Upcoming"
			icon={CalendarDays}
			description="The next three days."
			viewAllHref={styleguideUrl()}
		>
			<p>Whatever the section holds goes in here.</p>
		</Section>
	</Example>

	<Example name="Section" props="title only">
		<Section title="Tasks">
			<p>With no viewAllHref there is no "View all" link.</p>
		</Section>
	</Example>

	<Example name="Card" props="padding normal">
		<Card>
			<p>A plain card. Nothing happens when you press it.</p>
		</Card>
	</Example>

	<Example name="Card" props="href, padding tight">
		<Card href={conferenceListUrl()} padding="tight">
			<p>A card with an address is a link, and lifts on hover.</p>
		</Card>
	</Example>

	<Example name="Sidebar" props="groups (the first without a heading), title">
		<Sidebar groups={sidebarGroups} title="Manage" />
	</Example>

	<Example name="Tabs" props="tabs, one active, two with a count">
		<Tabs {tabs} />
	</Example>

	<Example name="EmptyState" props="icon, title, description, actionLabel, actionHref">
		<EmptyState
			icon={FileText}
			title="No applications yet"
			description="They appear here as soon as somebody applies."
			actionLabel="Open applications"
			actionHref={styleguideUrl()}
		/>
	</Example>

	<Example name="Stat" props="label, value, hint">
		<div class="grid gap-4 sm:grid-cols-3">
			<Stat label="Applications" value={342} hint="12 new today" />
			<Stat label="Seats filled" value="118 of 165" />
			<Stat label="Paid" value="7,670 of 9,100" hint="In euros" />
		</div>
	</Example>

	<Example name="AuthCard" props="title, subtitle, children · the box the log-in pages sit in">
		<AuthCard title="Welcome back." subtitle="Log in to apply, organise and take part.">
			<p>The form goes here.</p>
		</AuthCard>
	</Example>

	<Example name="DangerZone" props="children">
		<DangerZone>
			<p>Unpublishing takes the conference out of the public directory.</p>
			<Button label="Unpublish" variant="danger" type="button" />
		</DangerZone>
	</Example>
</Group>
