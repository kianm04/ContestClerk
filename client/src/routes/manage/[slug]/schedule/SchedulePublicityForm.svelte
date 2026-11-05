<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import CheckboxField from '$lib/components/CheckboxField.svelte';
	import { createInstantForm, type InstantSubmitInput } from '$lib/instant-form.svelte';

	type Props = {
		/** Whether the programme's `everyone` events are on the public conference page now. */
		isSchedulePublic: boolean;
	};

	let { isSchedulePublic }: Props = $props();

	/*
		Whether the tick box will end up ticked or not is entirely in the form
		that is posted, so it shows at once instead of waiting for the server
		(`$lib/instant-form.svelte.ts`, T142). A ticked checkbox sends "on"; an
		unticked one sends nothing at all, the way `saveVisibility` in
		`+page.server.ts` reads it.
	*/
	const visibilityForm = createInstantForm<boolean>({
		describeFailure: () => 'The setting was not saved.'
	});

	function expectSchedulePublicity(input: InstantSubmitInput): boolean {
		return input.formData.get('showSchedulePublicly') === 'on';
	}

	const submitVisibilityPress = visibilityForm.submitExpecting(expectSchedulePublicity);

	// The newest press still on its way wins; nothing pending shows the saved setting.
	const shownIsPublic = $derived(visibilityForm.presses.at(-1)?.expected ?? isSchedulePublic);
</script>

<!--
	A form of its own at the foot of the page, so saving the tick box posts
	nothing else. A tick box cannot send a form by itself without JavaScript,
	so "Save" stays beside it.
-->
<form
	method="post"
	action="?/saveVisibility"
	class="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-4"
	use:enhance={submitVisibilityPress}
>
	<CheckboxField
		label="Show the programme on the public page"
		name="showSchedulePublicly"
		isChecked={shownIsPublic}
		help="Only events for everyone appear there. Staff, delegate and committee events never do."
	/>
	<Button label="Save" variant="secondary" size="dense-sm" type="submit" />
</form>
