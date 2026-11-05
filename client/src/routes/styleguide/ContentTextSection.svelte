<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import FaqList from '$lib/components/FaqList.svelte';
	import FeatureBand from '$lib/components/FeatureBand.svelte';
	import KeyValueList from '$lib/components/KeyValueList.svelte';
	import LegalPage from '$lib/components/LegalPage.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import ParagraphText from '$lib/components/ParagraphText.svelte';
	import Timeline from '$lib/components/Timeline.svelte';
	import {
		SAMPLE_EVENTS,
		SAMPLE_FACTS,
		SAMPLE_FAQS,
		SAMPLE_LEGAL_SECTIONS,
		SAMPLE_MESSAGES,
		SAMPLE_PARAGRAPHS
	} from '$lib/styleguide-samples';
	import { styleguideUrl } from '$lib/urls';
	import Example from './Example.svelte';
	import ScheduleExamples from './ScheduleExamples.svelte';
</script>

<div class="grid min-w-0 gap-4">
	<h3 class="font-display text-h2 text-brand-900">Text, facts and notices</h3>

	<Example name="KeyValueList" props="items">
		<KeyValueList items={SAMPLE_FACTS} />
	</Example>

	<Example name="Timeline" props="items with time, title, subtitle, location">
		<Timeline items={SAMPLE_EVENTS} />
	</Example>

	<ScheduleExamples />

	<Example name="Notice" props="tone, title, children · all four tones">
		<div class="grid gap-3">
			{#each SAMPLE_MESSAGES as message (message.tone)}
				<Notice tone={message.tone} title={message.title}>{message.text}</Notice>
			{/each}
		</div>
	</Example>

	<Example name="Notice" props="tone, children only, no title">
		<Notice tone="info">A notice can be one line with no heading at all.</Notice>
	</Example>

	<Example name="ParagraphText" props="text with a blank line in it">
		<ParagraphText text={SAMPLE_PARAGRAPHS} />
	</Example>

	<Example name="FaqList" props="items with question and answer">
		<FaqList items={SAMPLE_FAQS} />
	</Example>

	<Example name="FeatureBand" props="eyebrow, title, description, children">
		<FeatureBand
			eyebrow="For organisers"
			title="Run the whole conference in one place"
			description="Applications, allocation, fees and the committee room, without a single spreadsheet."
		>
			<Button label="See how it works" variant="primary" href={styleguideUrl()} />
		</FeatureBand>
	</Example>

	<Example name="FeatureBand" props="isReversed, imagePath">
		<FeatureBand
			eyebrow="For delegates"
			title="Everything you need on your phone"
			description="Your committee, your seat, the schedule and your position paper."
			imagePath="marketing/sample/delegates.jpg"
			isReversed={true}
		/>
	</Example>

	<!-- The whole of `/terms` and `/privacy`, drawn from two made-up sections. -->
	<Example name="LegalPage" props="title, lastUpdated, sections">
		<LegalPage
			title="Privacy policy"
			lastUpdated="15 September 2026"
			sections={SAMPLE_LEGAL_SECTIONS}
		/>
	</Example>
</div>
