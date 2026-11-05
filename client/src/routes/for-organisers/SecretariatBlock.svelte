<script lang="ts">
	import DayDashboard from './DayDashboard.svelte';
</script>

<!--
	Under the committee room: what the secretariat sees of every room at once,
	a short heading and sentence beside the drawn conference-day dashboard.
	Like the sections, the two halves wrap: side by side from about a laptop's
	width, the dashboard under the words below it.
-->
<div class="mx-auto mt-18 flex max-w-[58rem] flex-wrap items-center gap-x-16 gap-y-8">
	<div class="min-w-0 flex-[1_1_20rem]">
		<h3
			class="font-display text-h2 font-semibold text-balance text-ink-900 [font-variation-settings:'opsz'_14]"
		>
			And the secretariat sees every room.
		</h3>
		<p class="mt-2.5 text-body text-ink-600">
			On a conference day the dashboard shows which committees are in session, how many delegates
			answered the roll call, and who did not.
		</p>
	</div>

	<div class="min-w-0 flex-[1.15_1_22rem]">
		<DayDashboard />
	</div>
</div>
