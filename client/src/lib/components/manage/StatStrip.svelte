<script lang="ts">
	import Flag from '$lib/components/Flag.svelte';

	/** One figure in the strip. */
	export type StripStat = {
		/** The figure itself, already formatted, such as "9", "4 of 11" or "£135.00". */
		value: string;
		/** What it counts, such as "Applications". */
		label: string;
		/** A darker few words after the label, such as "4 to review". */
		note?: string;
		/**
		 * A two-letter country code whose flag is drawn before the value. The home
		 * page's hero shows a delegate's seat as one of its figures, "Morocco" over
		 * "UNHRC", and the mockups put a flag wherever a country is named. A seat
		 * that is not a country, such as "Press", leaves it out.
		 */
		flagCountryCode?: string;
	};

	type Props = {
		stats: StripStat[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { stats }: Props = $props();

	// On a phone the figures sit two to a row, so an odd number leaves the last
	// one alone on its row at half width, where a long label such as "Next:
	// Closing ceremony · Main hall" wraps over three lines. That figure takes
	// the whole row instead. `$derived` works this out again when `stats` change.
	const lastFigureTakesItsRow = $derived(stats.length % 2 === 1);
</script>

<!--
	The row of figures along the top of a management dashboard, between two
	thin lines. Each figure takes an equal share of the width; on a phone they
	sit two to a row instead, with a little less room above and below each,
	since two rows of figures would otherwise push the home page's one button
	off a phone's first screen. A thin line separates one figure from the next;
	`first:` takes it, and the extra space, off the first, and on a phone
	(`max-sm:`) `odd:` takes it off the first figure of every row.
-->
<ul class="grid grid-cols-2 border-y border-border sm:flex">
	<!--
		The key in brackets tells Svelte which list item is which when the list
		changes. It is the figure's place, not its label, because two figures can
		share a label: a delegate on a conference day reads "In session" and
		"Morocco" both over "UNHRC", and a duplicate key is an error.
	-->
	{#each stats as stat, position (position)}
		<li
			class="flex-[1_1_10rem] border-l border-border py-4 pr-5 pl-5 first:border-l-0 first:pl-1 max-sm:py-3 max-sm:odd:border-l-0 max-sm:odd:pl-1 {lastFigureTakesItsRow &&
			position === stats.length - 1
				? 'max-sm:col-span-2'
				: ''}"
		>
			<!--
				The 40 by 30 flag is shorter than the value's 2rem line, so centring it
				in the row leaves the value's line box, and with it the baseline its
				tabular figures sit on, exactly where a figure without a flag has them.
				The value already names the country, so a screen reader skips the flag.
				`flex-wrap` is for a phone, where a cell is too narrow for the flag and
				a name like "Morocco" side by side: the name then drops under the flag
				instead of running out of the cell.
			-->
			<p class="flex flex-wrap items-center gap-2 text-stat text-foreground tabular-nums">
				{#if stat.flagCountryCode}
					<span class="inline-flex shrink-0" aria-hidden="true">
						<Flag countryCode={stat.flagCountryCode} size="md" />
					</span>
				{/if}
				<span>{stat.value}</span>
			</p>
			<p class="text-small text-muted-foreground">
				{stat.label}
				{#if stat.note}
					· <span class="text-foreground">{stat.note}</span>
				{/if}
			</p>
		</li>
	{/each}
</ul>
