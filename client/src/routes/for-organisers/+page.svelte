<script lang="ts">
	import PageMeta from '$lib/components/shell/PageMeta.svelte';
	import { REPLACES_WORDS } from '$lib/for-organisers';
	import { newQuickSessionUrl, registerUrl, startConferenceUrl } from '$lib/urls';
	import type { PageProps } from './$types';
	import AccessSection from './AccessSection.svelte';
	import ClosingBand from './ClosingBand.svelte';
	import ConferenceAndAfterChapters from './ConferenceAndAfterChapters.svelte';
	import Ledger from './Ledger.svelte';
	import OrganiserCentredSection from './OrganiserCentredSection.svelte';
	import OrganiserHero from './OrganiserHero.svelte';
	import OrganiserQuestions from './OrganiserQuestions.svelte';
	import PhoneCreateBar from './PhoneCreateBar.svelte';
	import PreparationChapters from './PreparationChapters.svelte';
	import PriceBlock from './PriceBlock.svelte';

	// `data` is whatever `load` in `+page.server.ts` returned: only whether the
	// reader is signed in, which decides where the page's links go.
	let { data }: PageProps = $props();

	// `$derived` works these out again whenever `data` changes, which happens
	// when `load` runs again, for instance after somebody signs in. A visitor
	// goes through sign up first and then on to the same place. `registerUrl`
	// takes the plain path, not `newQuickSessionUrl()`: on the server that
	// answers a relative address, which `registerUrl` would throw away.
	const createConferenceHref = $derived(startConferenceUrl(data.isSignedIn));
	const quickSessionHref = $derived(
		data.isSignedIn ? newQuickSessionUrl() : registerUrl('/quick/new')
	);
</script>

<!-- `PageMeta` writes the `<title>` and the sharing tags, and adds "· MUNMeet". -->
<PageMeta
	title="For organisers"
	description="One system for the secretariat and the chairs, from the first application to the final vote."
/>

<!--
	The page, after the design canvas built from
	`docs/for-organisers-handoff.md`: the hero, the ledger of the jobs it
	replaces, then one chapter for each moment of a conference's year, who sees
	what, the price, questions and a closing call. This file only composes
	them; the words are in `$lib/for-organisers.ts`, and each drawn picture
	keeps its sample data in `$lib/organiser-*.ts`.

	The ground is `mist`, a blue so faint it is nearly white, as on the landing
	page. A section that takes its picture between its tags receives it as
	`children`. Each chapter's id is where the ledger's links jump to.
-->
<div class="flex flex-col bg-mist">
	<OrganiserHero {createConferenceHref} {quickSessionHref} />

	<OrganiserCentredSection id="replaces" words={REPLACES_WORDS} isFirst>
		<Ledger />
	</OrganiserCentredSection>

	<PreparationChapters />

	<ConferenceAndAfterChapters {quickSessionHref} />

	<AccessSection />

	<section
		id="price"
		aria-labelledby="price-title"
		class="mx-auto w-full max-w-[68.75rem] px-4 py-[clamp(3.5rem,6.4vw,5rem)]"
	>
		<PriceBlock />
	</section>

	<section
		id="questions"
		aria-labelledby="questions-title"
		class="mx-auto w-full max-w-[68.75rem] px-4 pt-[clamp(3.5rem,6.4vw,5rem)] pb-[clamp(2.5rem,5vw,3.5rem)]"
	>
		<OrganiserQuestions />
	</section>

	<ClosingBand {createConferenceHref} {quickSessionHref} />

	<PhoneCreateBar {createConferenceHref} />
</div>
