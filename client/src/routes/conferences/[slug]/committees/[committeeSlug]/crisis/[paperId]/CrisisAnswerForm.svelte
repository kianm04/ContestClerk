<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import FieldError from '$lib/components/FieldError.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { CRISIS_ANSWER_MAX_LENGTH, type AnswerChoice } from '$lib/crisis-papers';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** "Carry out" and "Refuse", or "Publish" and "Refuse"; the first is the primary. */
		choices: AnswerChoice[];
		/** What was typed and refused, sent back by the action, with why. */
		typed: { answer: string; error: string | null } | null;
		/** The crisis staff's list, where "Back" goes. */
		backHref: ResolvedPathname;
	};

	let { choices, typed, backHref }: Props = $props();

	const FIELD_ID = 'crisis-answer';
	const ERROR_ID = 'crisis-answer-error';

	// Sent in the background; without JavaScript the same form posts and the page comes back.
	const inPlace = createInPlaceForm();
</script>

<!--
	The crisis staff's answer. Each button sends its own `outcome`, so one
	form and one text area serve both, with or without JavaScript. The answer
	may be left empty (decision 10): a backroom that answers on paper still
	keeps the record of what happened.
-->
<section aria-label="Answer">
	<h2 class="border-b border-foreground pb-2 font-display text-h2 text-foreground">Answer</h2>

	<form
		method="post"
		action="?/answer"
		use:enhance={inPlace.submit}
		class="flex max-w-[42rem] flex-col gap-2 pt-4"
	>
		<Label for={FIELD_ID}>What happens</Label>
		<Textarea
			id={FIELD_ID}
			name="answer"
			rows={5}
			maxlength={CRISIS_ANSWER_MAX_LENGTH}
			value={typed?.answer ?? ''}
			aria-describedby={typed?.error ? ERROR_ID : undefined}
			aria-invalid={typed?.error ? true : undefined}
		/>
		<FieldError id={ERROR_ID} message={typed?.error} />
		<div class="flex flex-wrap gap-3 pt-2">
			<!-- The `(choice.outcome)` key tells the two buttons apart. -->
			{#each choices as choice, index (choice.outcome)}
				<Button
					type="submit"
					name="outcome"
					value={choice.outcome}
					variant={index === 0 ? 'default' : 'outline'}
					size="lg"
					class="max-lg:h-11"
					disabled={inPlace.isBusy}
				>
					{choice.label}
				</Button>
			{/each}
			<Button href={backHref} variant="ghost" size="lg" class="max-lg:h-11">Back</Button>
		</div>
	</form>
</section>
