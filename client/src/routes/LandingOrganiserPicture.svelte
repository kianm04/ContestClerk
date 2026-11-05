<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import { SAMPLE_APPLICANTS } from '$lib/landing';
	import LandingStatusBadge from './LandingStatusBadge.svelte';
</script>

<!--
	A drawn applications table, as an organiser sees theirs: a pale blue header
	row, a hairline between rows, and a status chip in each. It is a shadcn
	`Card` in the example's manner, named for screen readers as a figure,
	because it is a picture of the product rather than the product.

	The committee column is left out on a phone, where four columns would not
	fit. Applicants have no id, so the `(applicant.name)` key tells Svelte
	which row is which.
-->
<Card.Root
	role="figure"
	aria-labelledby="landing-organiser-caption"
	class="gap-0 overflow-hidden rounded-2xl py-0 shadow-card ring-0"
>
	<p id="landing-organiser-caption" class="sr-only">
		An example of an organiser's applications table: five applicants, with who is accepted, pending
		and waitlisted.
	</p>

	<div class="flex items-center justify-between gap-4 border-b border-neutral-100 px-5 py-3.5">
		<p class="text-small font-medium text-ink-900">Applications</p>
		<div class="flex items-center gap-3">
			<p class="text-caption text-ink-600 tabular-nums">142 received</p>
			<Badge
				variant="secondary"
				class="h-auto rounded-full bg-warning-100 px-2.5 py-0.5 text-xs text-warning-700"
			>
				38 to review
			</Badge>
		</div>
	</div>

	<table class="w-full text-small">
		<thead class="bg-brand-50 text-caption font-medium text-ink-600">
			<tr>
				<th scope="col" class="px-5 py-2 text-left font-medium">Name</th>
				<th scope="col" class="px-3 py-2 text-left font-medium">Country</th>
				<th scope="col" class="hidden px-3 py-2 text-left font-medium sm:table-cell">Committee</th>
				<th scope="col" class="px-3 py-2 text-left font-medium">Status</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-neutral-100">
			{#each SAMPLE_APPLICANTS as applicant (applicant.name)}
				<tr class="h-12">
					<td class="px-5 py-2 font-medium text-ink-900">{applicant.name}</td>
					<td class="px-3 py-2 text-ink-600">{applicant.country}</td>
					<td class="hidden px-3 py-2 text-ink-600 sm:table-cell">{applicant.committee}</td>
					<td class="px-3 py-2"><LandingStatusBadge status={applicant.status} /></td>
				</tr>
			{/each}
		</tbody>
	</table>
</Card.Root>
