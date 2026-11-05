<script lang="ts">
	import Link from '@lucide/svelte/icons/link';
	import Mail from '@lucide/svelte/icons/mail';
	import type { BasicsErrors } from '$lib/creation-basics';
	import InstagramIcon from './InstagramIcon.svelte';
	import LinkField from './LinkField.svelte';

	type Props = {
		contactEmail: string;
		websiteUrl: string;
		instagramUrl: string;
		errors: BasicsErrors;
	};

	// `$bindable()` lets the page write `bind:contactEmail={...}` and so on.
	let {
		contactEmail = $bindable(),
		websiteUrl = $bindable(),
		instagramUrl = $bindable(),
		errors
	}: Props = $props();
</script>

<!--
	The three ways to reach the conference, as the design draws them: a 135
	pixel column of labels, the fields beside them, 8 pixels between rows.
	"Website" has a link icon before it, and "Instagram" is set in by that
	icon's width so its word lines up with "Website".
-->
<div class="grid min-w-0 grid-cols-[--spacing(33.75)_minmax(0,1fr)] items-center gap-y-2">
	<LinkField
		field="contactEmail"
		label="Contact email"
		icon={Mail}
		type="email"
		autocomplete="email"
		placeholder="Email address"
		error={errors.contactEmail}
		bind:value={contactEmail}
	/>
	<LinkField
		field="websiteUrl"
		label="Website"
		icon={Link}
		labelIcon={Link}
		inputmode="url"
		placeholder="Web address"
		error={errors.websiteUrl}
		bind:value={websiteUrl}
	/>
	<LinkField
		field="instagramUrl"
		label="Instagram"
		icon={InstagramIcon}
		labelClass="pl-10.5"
		placeholder="@account or web address"
		error={errors.instagramUrl}
		bind:value={instagramUrl}
	/>
</div>
