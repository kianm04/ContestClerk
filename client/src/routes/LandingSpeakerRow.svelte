<script lang="ts">
	import Flag from '$lib/components/Flag.svelte';
	import { countryName } from '$lib/countries';

	type Props = {
		/** A two-letter ISO country code, such as `KE`. */
		countryCode: string;
		/** The country's place on the list, counted from the one speaking next. */
		position: number;
	};

	let { countryCode, position }: Props = $props();

	// `$derived` looks the name up again if the code changes.
	const name = $derived(countryName(countryCode));
</script>

<!--
	One country waiting on the speakers' list of the drawn committee room: its
	place, its flag and its name. 44px tall, like every row on the site.
-->
<li class="flex min-h-11 items-center gap-3 py-2 text-small text-ink-900">
	<span class="w-4 text-caption text-ink-600 tabular-nums">{position}</span>
	<Flag {countryCode} size="sm" />
	<span>{name}</span>
</li>
