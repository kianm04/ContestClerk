<script lang="ts">
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import PrintButton from './PrintButton.svelte';
	import RecordCopy from './RecordCopy.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned: the copy, in words.
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.name} · {data.committeeHeading} · {data.conferenceName} · MUNMeet</title>
</svelte:head>

<!--
	The record copy of a passed paper, as drawn for an A4 sheet. On screen the
	breadcrumb and "Print" sit around it; `print:hidden` (Tailwind's `print:`
	applies only when printing) leaves the paper alone on the sheet, and the
	global stylesheet sets the sheet's margins.
-->
<div class="print:hidden">
	<Breadcrumb
		links={[
			{ href: data.committeeHref, label: data.committeeHeading },
			{ href: data.paperHref, label: data.title }
		]}
	/>
</div>

<article aria-labelledby="record-name" class="mt-4 max-w-[42rem] print:mt-0 print:max-w-none">
	<div class="flex items-start justify-between gap-6">
		<h1 id="record-name" class="font-display text-h1-mobile sm:text-h1">{data.name}</h1>
		<PrintButton />
	</div>
	<RecordCopy
		title={data.title}
		adopted={data.adopted}
		facts={data.facts}
		opening={data.opening}
		bodyHtml={data.bodyHtml}
		amendments={data.amendments}
		printed={data.printed}
	/>
</article>
