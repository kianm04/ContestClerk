<script lang="ts">
	import Calendar from '@lucide/svelte/icons/calendar';
	import FileText from '@lucide/svelte/icons/file-text';
	import List from '@lucide/svelte/icons/list';
	import Users from '@lucide/svelte/icons/users-round';
	import type { ApplicationsSummary } from '$lib/creation-setup-status';

	type Props = { summary: ApplicationsSummary };

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { summary }: Props = $props();

	// `$derived` builds the six facts again whenever the summary changes.
	const facts = $derived([
		{ icon: Users, label: 'Application type', value: summary.applicantType },
		{ icon: List, label: 'Committee preferences', value: summary.preferences },
		{ icon: Calendar, label: 'Applications open', value: summary.opens },
		{ icon: Calendar, label: 'Applications close', value: summary.closes },
		{ icon: FileText, label: 'Motivation', value: summary.motivation },
		{ icon: List, label: 'Custom questions', value: summary.customQuestions }
	]);
</script>

<!--
	The six settings in one 72 design pixel strip split by hairlines, the
	columns sized for their 12 pixel labels on one line and their values in two
	lines where they can (184, 184, 166, 216 and 110, the last taking the rest;
	`--spacing(46)` is 46 steps of four). The strip is at least 72 tall and
	grows rather than clip a value that needs a third line. A value
	wraps inside its column, as the design breaks "Individual delegates /
	+ Delegations". On a phone the strip is two across.
-->
<dl
	class="grid grid-cols-2 lg:min-h-18 lg:grid-cols-[--spacing(46)_--spacing(46)_--spacing(41.5)_--spacing(54)_--spacing(27.5)_minmax(0,1fr)]"
>
	<!-- Keyed by the label, which is unique within the strip. -->
	{#each facts as fact (fact.label)}
		<div
			class="flex min-w-0 items-center gap-2 pr-1.5 pl-3 not-first:border-creation-rule max-lg:py-2 lg:py-1.5 lg:not-first:border-l"
		>
			<fact.icon class="size-5 shrink-0 text-creation-ink-650" aria-hidden="true" />
			<div class="min-w-0">
				<dt class="fs-12 lh-16 font-semibold text-creation-ink-950 lg:whitespace-nowrap">
					{fact.label}
				</dt>
				<dd class="mt-0.5 fs-14 lh-18 text-creation-ink-275">{fact.value}</dd>
			</div>
		</div>
	{/each}
</dl>
