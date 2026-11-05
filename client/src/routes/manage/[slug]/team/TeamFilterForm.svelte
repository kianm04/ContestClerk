<script lang="ts">
	import { onMount } from 'svelte';
	import FormSelect, { type FormSelectOption } from '$lib/components/FormSelect.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { fieldId } from '$lib/form-fields';
	import { ALL_TEAM_FILTER, type TeamFilter, type TeamRole } from '$lib/team';

	type Props = {
		/** Every role of the conference, in its order. */
		roles: TeamRole[];
		/** The role the address asked for, or `all`. */
		filter: TeamFilter;
		/** How many people the list shows, such as "11 people". */
		shownCount: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { roles, filter, shownCount }: Props = $props();

	// "Everyone", then each role of the conference, in its order.
	const options: FormSelectOption[] = $derived([
		{ value: ALL_TEAM_FILTER, label: 'Everyone' },
		...roles.map((role) => ({ value: role.id, label: role.name }))
	]);

	// Until JavaScript runs, a button sends the form; after, a pick does.
	let isEnhanced = $state(false);
	onMount(() => {
		isEnhanced = true;
	});

	/** Sends the form as soon as a role is picked, as the "Show" button would. */
	function handleChange(event: Event & { currentTarget: HTMLFormElement }) {
		event.currentTarget.requestSubmit();
	}
</script>

<!--
	The filter row above the list: a GET form, so the role picked lands in the
	address as `?role=<its id>` and `load` filters by it, and the back button
	and a shared link both keep it. `FormSelect` announces each pick as a
	`change` event, which reaches this form and sends it.
-->
<form method="get" class="flex items-end gap-3 py-4" onchange={handleChange}>
	<div class="w-full sm:w-60">
		<Label for={fieldId('role')} class="mb-1.5">Role</Label>
		<FormSelect id={fieldId('role')} name="role" value={filter} {options} />
	</div>

	{#if !isEnhanced}
		<Button type="submit" variant="outline" size="lg" class="max-lg:h-11">Show</Button>
	{/if}

	<span class="pb-2.5 text-small text-muted-foreground">{shownCount}</span>
</form>
