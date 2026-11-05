<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import PersonRow from '$lib/components/PersonRow.svelte';
	import SeatName from '$lib/components/SeatName.svelte';
	import { SAMPLE_BADGES, SAMPLE_PEOPLE, SAMPLE_SEATS } from '$lib/styleguide-samples';
	import Example from './Example.svelte';

	// Avatars and banners are given the path a file sits at inside the
	// `public-media` storage bucket. This is a made-up portrait that really is in
	// the bucket: every `pnpm db:reset` uploads the files under
	// `supabase/media/public-media/`. It shows the half of the component that
	// draws an `<img>`; the examples beside it, which are given no path at all,
	// show the initials it falls back to.
	const SAMPLE_AVATAR_PATH = 'avatars/sample/portrait.jpg';
</script>

<div class="grid min-w-0 gap-4">
	<h3 class="font-display text-h2 text-brand-900">People and status</h3>

	<Example name="Badge" props="tone, label · all five tones">
		<div class="flex flex-wrap items-center gap-2">
			{#each SAMPLE_BADGES as badge (badge.tone)}
				<Badge tone={badge.tone} label={badge.label} />
			{/each}
		</div>
	</Example>

	<Example name="Avatar" props="name, size sm / md / lg, no imagePath">
		<div class="flex flex-wrap items-end gap-4">
			<Avatar name="Amara Osei" size="sm" />
			<Avatar name="Bram de Vries" size="md" />
			<Avatar name="Sofia Marchetti" size="lg" />
		</div>
	</Example>

	<Example name="Avatar" props="name, size, imagePath">
		<Avatar name="Amara Osei" size="lg" imagePath={SAMPLE_AVATAR_PATH} />
	</Example>

	<Example name="Flag" props="countryCode, size sm (20×15)">
		<ul class="flex flex-wrap items-center gap-4">
			{#each SAMPLE_SEATS as seat (seat.id)}
				<li class="flex items-center gap-2 text-small">
					<Flag countryCode={seat.countryCode} size="sm" />
					{seat.name}
				</li>
			{/each}
		</ul>
	</Example>

	<Example name="Flag" props="countryCode, size md (40×30)">
		<ul class="flex flex-wrap items-center gap-4">
			{#each SAMPLE_SEATS as seat (seat.id)}
				<li class="flex items-center gap-2 text-small">
					<Flag countryCode={seat.countryCode} size="md" />
					{seat.name}
				</li>
			{/each}
		</ul>
	</Example>

	<Example name="SeatName" props="name, countryCode (null for a seat that is not a country)">
		<p class="text-small text-ink-600">
			HRC · <SeatName name="Canada" countryCode="CA" /> · <SeatName
				name="Press"
				countryCode={null}
			/>
		</p>
	</Example>

	<Example name="PersonRow" props="name, subtitle, children (the right side)">
		<ul class="grid gap-2">
			{#each SAMPLE_PEOPLE as person (person.id)}
				<li>
					<PersonRow name={person.name} subtitle={person.subtitle}>
						<Badge tone="brand" label="Confirmed" />
					</PersonRow>
				</li>
			{/each}
		</ul>
	</Example>
</div>
