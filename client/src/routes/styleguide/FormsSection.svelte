<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import FormActions from '$lib/components/FormActions.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import type { SampleErrors } from './+page.server';
	import Example from './Example.svelte';
	import FormsButtonsSection from './FormsButtonsSection.svelte';
	import FormsFieldsSection from './FormsFieldsSection.svelte';
	import Group from './Group.svelte';

	type Props = {
		/** What the dummy action sent back, or `null` before the button was pressed. */
		errors: SampleErrors | null;
	};

	let { errors }: Props = $props();
</script>

<Group id="forms" title="Forms">
	<Notice tone="info" title="Press the button to see every error state">
		The fields below sit in a real form that posts to an action which always fails, so each one
		comes back with a message under it. Nothing is saved, and it works with JavaScript switched off.
	</Notice>

	<!--
		A plain `<form method="post">` with no `action` attribute posts to the
		`default` action in `+page.server.ts`. There is deliberately no
		`use:enhance`: the browser does the whole round trip itself, which is how
		we know the fields work with no JavaScript at all.

		`novalidate` switches off the browser's own checks, which only this form
		wants. A required field that is deliberately left empty below would
		otherwise stop the submission before it left the page, and then none of
		the server's error states could be seen. A real form keeps the checks.
	-->
	<form method="post" novalidate class="grid min-w-0 gap-4">
		<FormsFieldsSection {errors} />

		<Example name="FormActions" props="children · right-aligned, sticky at the bottom on phones">
			<FormActions>
				<Button label="Clear" variant="ghost" type="button" />
				<Button label="Show every error" variant="primary" />
			</FormActions>
		</Example>
	</form>

	<FormsButtonsSection />
</Group>
