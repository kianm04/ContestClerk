<script lang="ts">
	import Flag from './Flag.svelte';

	type Props = {
		/** The seat's name, such as "Canada" or "Press". */
		name: string;
		/** The seat's two-letter country code, or `null` for a seat that is not a country. */
		countryCode: string | null;
	};

	let { name, countryCode }: Props = $props();
</script>

<!--
	A seat's name with its flag in front, for a line of running text such as
	"HRC · Canada". The mockups put a flag wherever a country is named.

	The name already says the country, so a screen reader skips the flag rather
	than reading the name twice. `inline-flex` keeps the flag and the name on one
	line. The name sits on the same baseline as the text around it
	(`items-baseline`), and the flag is centred on it (`self-center`).
-->
<span class="inline-flex items-baseline gap-1.5">
	{#if countryCode}
		<span class="inline-flex self-center" aria-hidden="true"><Flag {countryCode} /></span>
	{/if}
	{name}
</span>
