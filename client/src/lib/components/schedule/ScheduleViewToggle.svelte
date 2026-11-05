<script lang="ts">
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import List from '@lucide/svelte/icons/list';
	import type { ResolvedPathname } from '$app/types';

	type Props = {
		/** The same page as a calendar. */
		calendarHref: ResolvedPathname;
		/** The same page as a list, `?view=list`. */
		listHref: ResolvedPathname;
		isList: boolean;
	};

	let { calendarHref, listHref, isList }: Props = $props();

	// Both ways of seeing the programme, so the markup below is written once.
	const views = $derived([
		{ label: 'Calendar', href: calendarHref, icon: CalendarDays, isCurrent: !isList },
		{ label: 'List', href: listHref, icon: List, isCurrent: isList }
	]);
</script>

<!--
	Calendar or list, as two links in one box: the view in the address
	(`?view=list`), so each works without JavaScript and can be shared. The
	chosen one is filled with the pale blue of a picked option. On a phone the
	words are read out but not shown, leaving just the two icons.
-->
<nav
	aria-label="View"
	class="flex h-11 gap-0.5 rounded-control border border-border p-[3px] md:h-10"
>
	{#each views as view (view.label)}
		<a
			href={view.href}
			aria-current={view.isCurrent ? 'page' : undefined}
			class="flex items-center gap-1.5 rounded-md px-3 text-dense transition-colors duration-150 {view.isCurrent
				? 'bg-brand-100 font-medium text-brand-900'
				: 'text-ink-600 hover:bg-neutral-100'}"
		>
			<view.icon size={16} aria-hidden="true" />
			<span class="max-md:sr-only">{view.label}</span>
		</a>
	{/each}
</nav>
