<script lang="ts">
	import ConferenceThumb from '$lib/components/ConferenceThumb.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import type { ConferenceRowData } from '$lib/home-rows';

	type Props = {
		/** The row's words and its door, worked out by `conferenceRows` in `$lib/home-rows.ts`. */
		row: ConferenceRowData;
		/**
		 * Whether the list keeps a thumbnail column. `conferenceRows` says so when
		 * any row drawn has a banner: a row without one then keeps an empty slot of
		 * the same size, so the names line up. When no row has a banner the column
		 * is left out altogether and the names start at the edge.
		 */
		hasThumb: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { row, hasThumb }: Props = $props();

	// The meta line's parts are joined with " · ": "UNHRC · Morocco · 25 – 27 Jul
	// 2027 · Amsterdam". On a seat's row the flag sits before the seat's name,
	// which `conferenceRows` puts second, so the line is cut there: the committee
	// before the flag, everything else after it. `$derived` works this out again
	// whenever the row changes.
	const metaAfterFlag = $derived(
		row.metaParts.slice(row.flagCountryCode === null ? 0 : 1).join(' · ')
	);
</script>

<!--
	One row of "Also coming up" on `/home`: the whole row is the reader's own
	door into the conference, with a hairline under it and a quiet fill under
	the pointer. It is an `<li>`, so the section puts these rows inside a `<ul>`.

	The status word sits at the right from `sm` (640px) up; on a phone it moves
	under the meta line, where it is not squeezed beside a long name.
-->
<li>
	<a
		href={row.href}
		class="flex min-h-[5rem] items-center gap-4 border-b border-border px-1 py-3 transition-colors duration-150 hover:bg-accent"
	>
		{#if hasThumb}
			<ConferenceThumb bannerPath={row.bannerPath} />
		{/if}

		<!-- `min-w-0` lets this column shrink, so a long name wraps instead of pushing the status word off the edge. -->
		<div class="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-4">
			<div class="min-w-0">
				<h3 class="font-display text-h3 text-foreground">{row.name}</h3>

				<!--
					The seat's name right after the flag already names the country, so
					a screen reader skips the picture.
				-->
				<p class="flex flex-wrap items-center gap-x-1 text-small text-muted-foreground">
					{#if row.flagCountryCode !== null}
						<span>{row.metaParts[0]} ·</span>
						<span class="inline-flex shrink-0" aria-hidden="true">
							<Flag countryCode={row.flagCountryCode} size="sm" />
						</span>
					{/if}
					<span>{metaAfterFlag}</span>
				</p>
			</div>

			<!-- A grey dot would only repeat a grey word, so a word without a dot is plain text. -->
			<div class="mt-1 shrink-0 sm:mt-0">
				{#if row.status.hasDot}
					<StatusDot text={row.status.text} tone={row.status.tone} />
				{:else}
					<span class="text-small text-foreground">{row.status.text}</span>
				{/if}
			</div>
		</div>
	</a>
</li>
