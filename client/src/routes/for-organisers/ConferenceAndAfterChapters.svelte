<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { AFTERWARDS_ROWS, AFTERWARDS_WORDS, DAYS_WORDS } from '$lib/for-organisers';
	import DaysRowList from './DaysRowList.svelte';
	import NewEdition from './NewEdition.svelte';
	import OrganiserCentredSection from './OrganiserCentredSection.svelte';
	import OrganiserFeature from './OrganiserFeature.svelte';
	import QuickSessionCard from './QuickSessionCard.svelte';
	import RoomScreens from './RoomScreens.svelte';
	import SecretariatBlock from './SecretariatBlock.svelte';

	type Props = {
		/** Straight to a new quick session when signed in, through sign up first for a visitor. */
		quickSessionHref: ResolvedPathname;
	};

	let { quickSessionHref }: Props = $props();
</script>

<!--
	The chapters of the conference days and after them: the committee room on
	every screen, what the secretariat sees, the quick session for a club, and
	closing the conference to start the next edition from it.
-->
<OrganiserCentredSection id="days" words={DAYS_WORDS}>
	<RoomScreens />
	<DaysRowList />
	<SecretariatBlock />
	<QuickSessionCard {quickSessionHref} />
</OrganiserCentredSection>

<OrganiserFeature
	id="afterwards"
	words={AFTERWARDS_WORDS}
	rows={AFTERWARDS_ROWS}
	wordsClass="flex-[1.15_1_24rem]"
	pictureClass="flex-[1_1_22rem]"
	gapClass="gap-x-16 gap-y-10"
>
	<NewEdition />
</OrganiserFeature>
