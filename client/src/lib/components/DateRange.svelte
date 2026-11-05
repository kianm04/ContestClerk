<script lang="ts">
	import { formatDateRange } from '$lib/dates';

	type Props = {
		/** `YYYY-MM-DD`. */
		startDate: string;
		endDate: string;
		/**
		 * An IANA zone name such as `Europe/Amsterdam`. The dates themselves are
		 * the same day everywhere, so this only adds the zone after them, for a
		 * page that has to say which clock its times are on.
		 */
		timezone?: string;
	};

	let { startDate, endDate, timezone }: Props = $props();

	// `$derived` formats the dates again whenever either of them changes.
	const dates = $derived(formatDateRange(startDate, endDate));
</script>

<span class="whitespace-nowrap">{dates}</span>{#if timezone}<span class="text-small text-ink-600">
		· {timezone}</span
	>{/if}
