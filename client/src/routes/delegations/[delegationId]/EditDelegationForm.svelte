<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import {
		hasDelegationFormErrors,
		type DelegationFormErrors,
		type DelegationFormValues
	} from '$lib/delegations';
	/*
		The same form the register page draws. It lives next to that page because
		that is the route it was written for, and `05-pages/delegation/dashboard.md`
		says this card "reuses `DelegationForm` from `new.md` without the consent
		box", so it is imported from there rather than copied. Move it into
		`$lib/components/` if a third page ever needs it.
	*/
	import DelegationForm from '../../conferences/[slug]/delegations/new/DelegationForm.svelte';

	type Props = {
		/** What every box starts with: the saved delegation, or what was typed last. */
		values: DelegationFormValues;
		/** One message per box that needs fixing. Empty when nothing is wrong. */
		errors: DelegationFormErrors;
	};

	let { values, errors }: Props = $props();

	// A refused save comes back with messages in it, and a closed block would
	// hide them, so the block opens itself whenever there is something to fix.
	// `$derived` works it out again after every submit.
	const hasErrors = $derived(hasDelegationFormErrors(errors));
</script>

<Card>
	<!--
		`<details>` and `<summary>` are the browser's own collapsible block: it
		opens and closes with no JavaScript at all, and the keyboard reaches it
		because the browser makes the summary focusable. `dashboard.md` asks for
		this form to start collapsed, since a head opens it far less often than
		they read the cards above it.
	-->
	<details open={hasErrors}>
		<!-- The padding sits on the `<summary>` because that is the part a finger
			taps, and the design system asks for 44px of it. -->
		<summary class="flex min-h-11 cursor-pointer flex-col justify-center">
			<span class="font-display text-h3">Details</span>
			<!-- A closed card with a heading alone looked empty, so it says what opening it is for. -->
			<span class="text-small text-ink-600">
				The name, institution and seats you asked for. Open to change them.
			</span>
		</summary>

		<div class="mt-4">
			<DelegationForm
				{values}
				{errors}
				submitLabel="Save details"
				asksConsent={false}
				action="?/update"
			/>
		</div>
	</details>
</Card>
