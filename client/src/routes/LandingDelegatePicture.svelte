<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { SAMPLE_MY_APPLICATIONS } from '$lib/landing';
	import LandingStatusBadge from './LandingStatusBadge.svelte';
</script>

<!--
	A drawn list of a delegate's own applications, as they see them: each
	conference's name in the serif, where things stand under it, and a status
	chip. It is a shadcn `Card` in the example's manner, named for screen
	readers as a figure, because it is a picture of the product rather than the
	product. Applications have no id, so the `(application.conference)` key
	tells Svelte which row is which.
-->
<Card.Root
	role="figure"
	aria-labelledby="landing-delegate-caption"
	class="gap-0 overflow-hidden rounded-2xl py-0 shadow-card ring-0"
>
	<p id="landing-delegate-caption" class="sr-only">
		An example of a delegate's applications: three conferences, one accepted, one still being
		reviewed and one waitlisted.
	</p>

	<div class="flex items-baseline justify-between gap-4 border-b border-neutral-100 px-5 py-3.5">
		<p class="text-small font-medium text-ink-900">My applications</p>
		<p class="text-caption text-ink-600 tabular-nums">
			{SAMPLE_MY_APPLICATIONS.length} this season
		</p>
	</div>

	<ul class="divide-y divide-neutral-100 px-5">
		{#each SAMPLE_MY_APPLICATIONS as application (application.conference)}
			<li class="flex items-center justify-between gap-4 py-4">
				<div class="min-w-0">
					<p class="truncate font-display text-h3 text-ink-900">{application.conference}</p>
					<p class="mt-0.5 text-caption text-ink-600">{application.detail}</p>
				</div>
				<LandingStatusBadge status={application.status} />
			</li>
		{/each}
	</ul>
</Card.Root>
