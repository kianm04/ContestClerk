<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import Database from '@lucide/svelte/icons/database';
	import FileText from '@lucide/svelte/icons/file-text';
	import Users from '@lucide/svelte/icons/users-round';
	import StatusChip, { type CreationStatus } from '$lib/components/creation/StatusChip.svelte';

	type Props = {
		statuses: {
			publicPage: CreationStatus;
			committees: CreationStatus;
			applications: CreationStatus;
			fees: CreationStatus;
		};
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { statuses }: Props = $props();

	// `$derived` builds the four rows again whenever the statuses change.
	// Each links to its card on this page, by the card's `id`.
	const rows = $derived([
		{
			icon: FileText,
			href: '#public-page',
			title: 'Public page',
			line: 'Basic details, branding and contact.',
			status: statuses.publicPage
		},
		{
			icon: Users,
			href: '#committees',
			title: 'Committees',
			line: 'Import or add committees.',
			status: statuses.committees
		},
		{
			icon: ClipboardList,
			href: '#applications',
			title: 'Applications',
			line: 'Application form and settings.',
			status: statuses.applications
		},
		{
			icon: Database,
			href: '#fees',
			title: 'Fees',
			line: 'Set delegate fees and payment details.',
			status: statuses.fees
		}
	]);
</script>

<!--
	How far each part of Setup is, as drawn: a serif title and its line, then
	one 60 design pixel row per part inside a hairline box, with its icon, its
	state and an arrow. Each row is a link that jumps to its panel on this
	page; the arrow is drawn 13 pixels into the gap before it, as on the board.
-->
<section aria-labelledby="setup-progress-title">
	<h3
		id="setup-progress-title"
		class="mt-4 font-display fs-20 lh-26 font-bold text-creation-ink-950"
	>
		Setup progress
	</h3>
	<p class="fs-14 lh-20 text-creation-ink-350">Complete these steps to prepare for launch.</p>
	<ul class="mt-2 overflow-hidden rounded-md border border-creation-rule">
		<!-- Keyed by the link, which is different for every row. -->
		{#each rows as row (row.href)}
			<li class="border-b border-creation-rule last:border-b-0">
				<!-- eslint-disable svelte/no-navigation-without-resolve -- a jump to a panel on this same page, not another route -->
				<a
					href={row.href}
					class="flex h-15 items-center gap-6 pr-1.25 pl-3.75 transition-colors duration-150 hover:bg-creation-selected max-lg:min-h-12 max-lg:gap-3"
				>
					<row.icon class="size-5.5 shrink-0 text-creation-blue" aria-hidden="true" />
					<span class="flex min-w-0 flex-1 flex-col">
						<span class="truncate fs-15 lh-20 font-semibold text-creation-ink-950">{row.title}</span
						>
						<span class="truncate fs-12 lh-16 text-creation-ink-275">{row.line}</span>
					</span>
					<StatusChip status={row.status} class="px-3.25" />
					<ChevronRight
						class="-ml-3.25 size-5 shrink-0 text-creation-blue max-lg:ml-0"
						aria-hidden="true"
					/>
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</li>
		{/each}
	</ul>
</section>
