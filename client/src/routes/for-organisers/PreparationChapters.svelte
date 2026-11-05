<script lang="ts">
	import {
		ALLOCATION_WORDS,
		APPLICATIONS_ROWS,
		APPLICATIONS_WORDS,
		BEFORE_ROWS,
		BEFORE_WORDS,
		FEES_ROWS,
		FEES_WORDS,
		SETUP_ROWS,
		SETUP_WORDS
	} from '$lib/for-organisers';
	import AllocationFacts from './AllocationFacts.svelte';
	import AnnouncementPicture from './AnnouncementPicture.svelte';
	import ApplicationsPicture from './ApplicationsPicture.svelte';
	import InvoicesPicture from './InvoicesPicture.svelte';
	import LaunchPicture from './LaunchPicture.svelte';
	import OrganiserCentredSection from './OrganiserCentredSection.svelte';
	import OrganiserFeature from './OrganiserFeature.svelte';
	import SchoolSteps from './SchoolSteps.svelte';
	import SeatGridPicture from './SeatGridPicture.svelte';
</script>

<!--
	The chapters of the months before a conference, in the order they happen:
	setting it up, applications, allocation and schools, fees, and what everyone
	is told before the first session. Sections alternate their picture's side,
	and each gives its two halves the design's own proportions.
-->
<OrganiserFeature
	id="setup"
	words={SETUP_WORDS}
	rows={SETUP_ROWS}
	wordsClass="flex-[1_1_24rem]"
	pictureClass="flex-[1_1_24rem]"
	gapClass="gap-x-16 gap-y-10"
>
	<LaunchPicture />
</OrganiserFeature>

<OrganiserFeature
	id="applications"
	words={APPLICATIONS_WORDS}
	rows={APPLICATIONS_ROWS}
	isReversed
	wordsClass="flex-[1_1_22rem]"
	pictureClass="flex-[2.8_1_26rem]"
	gapClass="gap-x-14 gap-y-10"
>
	<ApplicationsPicture />
</OrganiserFeature>

<OrganiserCentredSection id="allocation" words={ALLOCATION_WORDS}>
	<SeatGridPicture />
	<AllocationFacts />
	<SchoolSteps />
</OrganiserCentredSection>

<OrganiserFeature
	id="fees"
	words={FEES_WORDS}
	rows={FEES_ROWS}
	wordsClass="flex-[1_1_22rem]"
	pictureClass="flex-[2.6_1_26rem]"
	gapClass="gap-x-14 gap-y-10"
>
	<InvoicesPicture />
</OrganiserFeature>

<OrganiserFeature
	id="before"
	words={BEFORE_WORDS}
	rows={BEFORE_ROWS}
	isReversed
	wordsClass="flex-[1_1_22rem]"
	pictureClass="flex-[1.2_1_26rem]"
	gapClass="gap-x-14 gap-y-10"
>
	<AnnouncementPicture />
</OrganiserFeature>
