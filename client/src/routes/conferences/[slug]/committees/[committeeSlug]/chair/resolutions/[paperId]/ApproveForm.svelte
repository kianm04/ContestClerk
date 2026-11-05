<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		approveButtonText,
		paperNumberText,
		parsePaperNumber,
		type PaperNumber
	} from '$lib/chair-resolutions';
	import type { PaperKind } from '$lib/committee-papers';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		kind: PaperKind;
		/** The number the database would give it, which the box starts with. */
		proposedNumber: PaperNumber;
	};

	let { kind, proposedNumber }: Props = $props();

	// What the box holds now. It starts from the proposed number once and then follows the typing.
	// svelte-ignore state_referenced_locally
	let numberText = $state(paperNumberText(proposedNumber));

	// The button names the number it will give, once the box holds one; the database checks it again.
	const buttonText = $derived(approveButtonText(kind, parsePaperNumber(numberText)));

	const inPlace = createInPlaceForm();
	const uid = $props.id();
</script>

<!--
	"Approve as Draft resolution 1.1", with the number it will take in a small
	box beside it, which the dais may change. A plain form, so it works
	without JavaScript; a number already taken comes back as the database's
	refusal.
-->
<form
	method="post"
	action="?/approve"
	use:enhance={inPlace.submit}
	class="flex flex-wrap items-center gap-3"
>
	<label for="{uid}-number" class="text-small text-muted-foreground">Number</label>
	<Input
		id="{uid}-number"
		name="number"
		bind:value={numberText}
		required
		inputmode="decimal"
		autocomplete="off"
		class="h-10 w-14 px-2.5 text-body tabular-nums max-lg:h-11 md:text-body"
	/>
	<Button type="submit" size="lg" class="h-10 max-lg:h-11" disabled={inPlace.isBusy}>
		{buttonText}
	</Button>
</form>
