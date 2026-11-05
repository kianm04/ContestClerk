<script lang="ts">
	import Reveal from '$lib/components/Reveal.svelte';
	import { ACCESS_WORDS } from '$lib/for-organisers';
	import LandingHeading from '../LandingHeading.svelte';
	import AccessList from './AccessList.svelte';
	import TeamCard from './TeamCard.svelte';
</script>

<!--
	Who sees what. It is shaped like the other chapters, words on the left and
	a drawn picture on the right, but under its title is the list of roles
	rather than rows with icons, so it lays itself out instead of using
	`OrganiserFeature`.
-->
<section
	id="access"
	aria-labelledby="access-title"
	class="mx-auto w-full max-w-[68.75rem] px-4 py-[clamp(3.5rem,6.4vw,5rem)]"
>
	<div class="flex flex-wrap items-center gap-x-16 gap-y-10">
		<Reveal class="min-w-0 flex-[1.2_1_24rem]">
			<LandingHeading headingId="access-title" words={ACCESS_WORDS} />

			<div class="mt-7">
				<AccessList />
			</div>
		</Reveal>

		<Reveal delay={120} class="min-w-0 flex-[1_1_22rem]">
			<TeamCard />
		</Reveal>
	</div>
</section>
