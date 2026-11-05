<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import CountrySelect from '$lib/components/CountrySelect.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { SEAT_KIND_OPTIONS } from '$lib/committee-editor';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before. A
	// saved seat empties the fields, the way a reload would leave them.
	const inPlaceForm = createInPlaceForm({ isResetAfterSave: true });
</script>

<!--
	One seat at a time, for a character, an observer, or a country the ready-made
	lists do not hold. It is its own `<form>` posting to its own action, so it
	sends none of the fields of the forms beside it. The boxes start empty and
	stay empty, because this form adds a seat rather than editing one.

	The country is optional: it is only there to give the row its flag, and
	`CountrySelect` is the dropdown every other country field in the app uses.

	The box is called `seatName` and not `name`, which is the obvious word for
	it, because the committee form further up this same page already has a field
	called `name`. `TextField` builds its id out of the field's name, so two
	boxes called `name` on one page would share one id, and the label written
	here would point at the committee's name box instead of this one. The topics
	list a few lines up had to dodge the same thing.
-->
<!-- The name takes what is left of the row, and `flex-wrap` stacks the boxes on a
	phone. `pt-6.5`, the height of a label, lines the button up with the boxes. -->
<form
	method="post"
	action="?/addSeat"
	class="flex flex-wrap items-start gap-x-2 gap-y-4"
	use:enhance={inPlaceForm.submit}
>
	<div class="min-w-0 flex-[1_1_12rem]">
		<TextField label="Seat name" name="seatName" value="" placeholder="Seat name" isDense />
	</div>

	<div class="min-w-0 flex-[1_1_9.5rem] sm:flex-none sm:basis-[9.5rem]">
		<SelectField label="Kind" name="kind" value="country" options={SEAT_KIND_OPTIONS} isDense />
	</div>

	<div class="min-w-0 flex-[1_1_12.5rem] sm:flex-none sm:basis-[12.5rem]">
		<CountrySelect name="countryCode" value="" isDense />
	</div>

	<div class="pt-6.5">
		<Button label="Add seat" variant="secondary" size="dense" isLoading={inPlaceForm.isBusy} />
	</div>
</form>
