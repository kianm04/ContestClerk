<script lang="ts">
	import { APPLICATIONS_TABLE_COLUMNS, type ApplicationRow } from '$lib/organiser-seats';
	import ApplicationsPictureTickBox from './ApplicationsPictureTickBox.svelte';

	type Props = {
		application: ApplicationRow;
		/** The row above this one, or `undefined` for the first row. */
		previous: ApplicationRow | undefined;
	};

	let { application, previous }: Props = $props();

	/* The rule above the row, as the board draws it: none on the first row or
	   where a ticked row's pale blue already makes the edge, a white line
	   between two ticked rows, and a hairline everywhere else.
	   `$derived` works these out again whenever the props change. */
	const ruleClass = $derived.by(() => {
		if (!previous || (previous.isTicked && !application.isTicked)) return '';
		if (previous.isTicked) return 'border-t border-surface';
		return 'border-t border-neutral-100';
	});
	const nameClass = $derived(application.isTicked ? 'text-brand-900' : '');
	// A ticked row is pale blue, so its preference chip turns white to stay visible.
	const chipClass = $derived(application.isTicked ? 'bg-surface' : 'bg-brand-50');
</script>

<!--
	One application in the drawn table. On a phone the institution moves under
	the name and the two middle columns are hidden (`md:block`), as the board
	draws it.
-->
<div
	class="grid min-h-12 items-center gap-x-3 py-1.5 pr-5 {APPLICATIONS_TABLE_COLUMNS} {ruleClass}"
	class:bg-brand-100={application.isTicked}
>
	<ApplicationsPictureTickBox isTicked={application.isTicked} />
	<span class="flex min-w-0 flex-col">
		<span class="font-medium {nameClass}">{application.name}</span>
		<span class="text-caption text-ink-600 md:hidden">{application.institution}</span>
	</span>
	<span class="hidden whitespace-nowrap text-ink-600 md:block">{application.institution}</span>
	<span class="hidden md:block">
		<span
			class="inline-block rounded-lg px-2 py-0.5 text-caption font-medium whitespace-nowrap text-brand-700 {chipClass}"
		>
			{application.firstPreference}
		</span>
	</span>
	<span>
		<span
			class="inline-block rounded-full bg-warning-100 px-2.5 py-0.5 text-caption font-medium whitespace-nowrap text-warning-700"
		>
			Under review
		</span>
	</span>
</div>
