<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Button from '$lib/components/Button.svelte';
	import SearchInput from '$lib/components/SearchInput.svelte';
	import { SAMPLE_BUTTONS } from '$lib/styleguide-samples';
	import { styleguideUrl } from '$lib/urls';
	import Example from './Example.svelte';
</script>

<!--
	These sit outside the sample form above on purpose. A `Button` submits by
	default, and a row of demonstration buttons should not post anything.
-->
<div class="grid min-w-0 gap-4">
	<h3 class="font-display text-h2 text-brand-900">Buttons and search</h3>

	<Example name="Button" props="variant primary / secondary / ghost / danger, size md">
		<div class="flex flex-wrap items-center gap-3">
			{#each SAMPLE_BUTTONS as button (button.variant)}
				<Button label={button.label} variant={button.variant} type="button" />
			{/each}
		</div>
	</Example>

	<Example name="Button" props="the same four, size sm · it keeps the 44px height">
		<div class="flex flex-wrap items-center gap-3">
			{#each SAMPLE_BUTTONS as button (button.variant)}
				<Button label={button.label} variant={button.variant} size="sm" type="button" />
			{/each}
		</div>
	</Example>

	<Example name="Button" props="icon">
		<div class="flex flex-wrap items-center gap-3">
			<Button label="Next step" variant="primary" icon={ArrowRight} type="button" />
			<Button label="Next step" variant="secondary" size="sm" icon={ArrowRight} type="button" />
		</div>
	</Example>

	<Example
		name="Button"
		props="isLoading · the spinner replaces the icon and the press does nothing"
	>
		<div class="flex flex-wrap items-center gap-3">
			<Button label="Saving" variant="primary" isLoading={true} type="button" />
			<Button label="Saving" variant="secondary" size="sm" isLoading={true} type="button" />
		</div>
	</Example>

	<Example name="Button" props="isDisabled">
		<div class="flex flex-wrap items-center gap-3">
			<Button label="Submit application" variant="primary" isDisabled={true} type="button" />
			<Button label="Withdraw" variant="danger" isDisabled={true} type="button" />
		</div>
	</Example>

	<Example name="Button" props="href · an <a> styled as a button, and the same one disabled">
		<div class="flex flex-wrap items-center gap-3">
			<Button label="Back to the styleguide" variant="secondary" href={styleguideUrl()} />
			<Button
				label="Not available yet"
				variant="secondary"
				href={styleguideUrl()}
				isDisabled={true}
			/>
		</div>
	</Example>

	<Example name="SearchInput" props="name, value, placeholder · the label is for screen readers">
		<!--
			The `name` also becomes the input's id, so no two boxes on one page may
			share one. The data group below has the `q` this would naturally be
			called.
		-->
		<SearchInput name="conferenceSearch" value="" placeholder="Search conferences" />
	</Example>

	<Example name="SearchInput" props="value, label">
		<SearchInput
			name="applicantSearch"
			value="Osei"
			placeholder="Search applicants"
			label="Search applicants"
		/>
	</Example>
</div>
