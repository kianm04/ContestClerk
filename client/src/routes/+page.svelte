<script lang="ts">
	import PageMeta from '$lib/components/shell/PageMeta.svelte';
	import {
		DELEGATE_LINK,
		DELEGATE_ROWS,
		DELEGATE_WORDS,
		ORGANISER_LINK,
		ORGANISER_ROWS,
		ORGANISER_WORDS,
		ROOM_ROWS,
		ROOM_WORDS
	} from '$lib/landing';
	import type { PageProps } from './$types';
	import LandingCallToAction from './LandingCallToAction.svelte';
	import LandingConferences from './LandingConferences.svelte';
	import LandingDelegatePicture from './LandingDelegatePicture.svelte';
	import LandingFeature from './LandingFeature.svelte';
	import LandingHero from './LandingHero.svelte';
	import LandingJourney from './LandingJourney.svelte';
	import LandingOrganiserPicture from './LandingOrganiserPicture.svelte';
	import LandingQuestions from './LandingQuestions.svelte';
	import LandingRoomPicture from './LandingRoomPicture.svelte';
	import LandingSchools from './LandingSchools.svelte';
	import LandingShowcase from './LandingShowcase.svelte';

	// `data` is whatever `load` in `+page.server.ts` returned: whose view of the
	// example to show, the conferences taking applications and the moment they
	// were read, and the address of the picture a shared link shows. `load`
	// runs again whenever the address changes, so pressing the switch over the
	// example (`/?view=organiser`) hands this page a new `showcaseView`.
	let { data }: PageProps = $props();
</script>

<!--
	`PageMeta` writes the `<title>` and the sharing tags, and adds "· MUNMeet"
	itself, so the tab reads "Run your Model UN in one place · MUNMeet".
-->
<PageMeta
	title="Run your Model UN in one place"
	description="Applications, seats, fees, schedule and the live committee room. For organisers, delegates and schools."
	imageUrl={data.shareImageUrl}
/>

<!--
	The page, top to bottom: the hero and the example of the product owner's
	mockup (Trello RBz46aTQ), then the sections that carry the mockup's manner
	down the page, in the order a visitor wants them, and the mockup's closing
	call. This file only composes them; the words are in `$lib/landing.ts` and
	`$lib/landing-showcase.ts`, and each section lays its own out. The hero and
	the example settle into place as the page loads; every section under them
	rises into view as the reader scrolls to it (`Reveal`), and the drawn
	committee room runs its clock.

	`-mt-16` pulls the page 4rem up, the height of the top bar, so the hero's
	pictures run up behind the bar. The page is `mist`, a blue so faint it is
	nearly white, because the mockup draws it so.

	`LandingFeature` takes its picture as its content, between the opening and
	closing tags, which Svelte hands it as `children`.
-->
<div class="-mt-16 flex flex-col bg-mist">
	<LandingHero />

	<LandingShowcase view={data.showcaseView} />

	<LandingFeature id="room" words={ROOM_WORDS} rows={ROOM_ROWS}>
		<LandingRoomPicture />
	</LandingFeature>

	<LandingJourney />

	<LandingFeature
		id="delegates"
		words={DELEGATE_WORDS}
		rows={DELEGATE_ROWS}
		link={DELEGATE_LINK}
		isReversed
	>
		<LandingDelegatePicture />
	</LandingFeature>

	<LandingFeature
		id="organisers"
		words={ORGANISER_WORDS}
		rows={ORGANISER_ROWS}
		link={ORGANISER_LINK}
	>
		<LandingOrganiserPicture />
	</LandingFeature>

	<LandingSchools />

	<LandingConferences conferences={data.conferences} now={data.now} />

	<LandingQuestions />

	<LandingCallToAction />
</div>
