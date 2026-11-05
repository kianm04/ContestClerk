<script lang="ts">
	import { SAMPLE_TEAM, SAMPLE_TEAM_INVITATION } from '$lib/organiser-close';
</script>

<!--
	A drawn team card: a conference's secretariat, one row per person with their
	initials, name, title and role, and an invitation still waiting at the
	foot. It is a picture of the product, so the card is hidden from screen
	readers and "Resend" is plain words; the sentence before it says what it
	shows instead.

	`divide-y` draws the hairline between rows. People have no id, so the
	`(member.name)` key in the `{#each}` tells Svelte which row is which.
-->
<p class="sr-only">
	An example of a conference's team: two organisers, two chairs and a volunteer, each with their
	title, and an invitation waiting to be accepted.
</p>

<div
	aria-hidden="true"
	class="overflow-hidden rounded-xl bg-surface text-small text-ink-900 shadow-card"
>
	<div class="border-b border-neutral-100 px-5 py-3.5 font-medium">Team</div>

	<div class="divide-y divide-neutral-100">
		{#each SAMPLE_TEAM as member (member.name)}
			<div class="flex min-h-13 items-center gap-3 px-5 py-2">
				<span
					class="flex size-8 flex-none items-center justify-center rounded-full bg-neutral-100 text-caption font-semibold"
				>
					{member.initials}
				</span>
				<span class="flex min-w-0 flex-1 flex-col">
					<span class="font-medium">{member.name}</span>
					<span class="text-caption text-ink-600">{member.title}</span>
				</span>
				<span class="flex-none text-caption text-ink-600">{member.role}</span>
			</div>
		{/each}

		<div
			class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 pt-3 pb-3.5 text-caption text-ink-600"
		>
			<span>{SAMPLE_TEAM_INVITATION}</span>
			<span class="font-medium text-brand-700">Resend</span>
		</div>
	</div>
</div>
