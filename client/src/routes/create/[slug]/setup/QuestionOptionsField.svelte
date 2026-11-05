<script lang="ts">
	import List from '@lucide/svelte/icons/list';
	import FieldError from '$lib/components/FieldError.svelte';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { fieldErrorId } from '$lib/form-fields';

	type Props = {
		/** One option per line, as the textarea holds them. */
		options: string;
		/** Only a "Pick one" or "Pick several" question has options. */
		hasOptions: boolean;
		error?: string;
	};

	// `$bindable()` lets the dialog write `bind:options`, which the preview follows.
	let { options = $bindable(), hasOptions, error }: Props = $props();
</script>

<!-- The board's Options row: a 70 pixel grey box when the type has none, a box to type them in when it has. -->
{#if hasOptions}
	<div class="mt-7">
		<Label for="options" class="block fs-14 lh-20 font-semibold text-creation-ink-900">
			Options <span class="font-normal text-creation-ink-225">(one per line)</span>
		</Label>
		<Textarea
			id="options"
			name="options"
			placeholder="Options"
			class="mt-2 field-sizing-fixed h-17.5 min-h-0 resize-y rounded-md border-creation-input-border bg-white px-3.5 py-2"
			aria-describedby={error ? fieldErrorId('options') : undefined}
			bind:value={options}
		/>
		<FieldError id={fieldErrorId('options')} message={error} />
	</div>
{:else}
	<!-- The options typed so far are kept, so switching the type back does not lose them. -->
	<input type="hidden" name="options" value={options} />
	<!-- Not a label: there is no field here for it to name. -->
	<div class="mt-7">
		<p class="fs-14 lh-20 font-semibold text-creation-ink-900">
			Options <span class="font-normal text-creation-ink-225">(not available)</span>
		</p>
		<div
			class="mt-2 flex h-17.5 items-center gap-4.5 rounded-md bg-creation-field px-5 text-creation-ink-200 max-lg:h-auto max-lg:py-3"
		>
			<List class="size-5.5 shrink-0" aria-hidden="true" />
			<p class="fs-14 lh-20">
				Options are only available for “Pick one” and “Pick several” questions.
			</p>
		</div>
	</div>
{/if}
