<script lang="ts">
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import type { HeroNextStep } from '$lib/home-hero';

	type Props = {
		/** The task the hero took as the reader's next step, from `homeHero` in `$lib/home-hero.ts`. */
		step: HeroNextStep;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { step }: Props = $props();
</script>

<!--
	The "Next step" block of the hero panel (`docs/home.md` section 3.2, item
	5): a hairline, the heading, the task's title with its due word at the
	right, and the task's detail under it. None of it is a link; the button
	under it (`HeroActions`) is what does the task.

	The title, the due word and the detail are one wrapping row so that the
	due word can move: from `sm` (640px) up it sits at the right of the title,
	and on a phone, where the title and the detail each take the whole width,
	`max-sm:order-last` puts it under the detail, as the phone sketch draws it.

	The due word is a `StatusDot` only when its colour says something the word
	alone does not ("Overdue" in red, "In 5 days" in amber); a grey word such as
	"By 25 Jul 2027" is drawn plain, since a grey dot would only repeat it.
-->
<div class="mt-4 border-t border-border pt-3">
	<p class="text-small font-medium text-muted-foreground">Next step</p>

	<div class="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
		<p class="min-w-0 text-body font-medium text-foreground max-sm:basis-full sm:flex-1">
			{step.title}
		</p>

		{#if step.due}
			<span class="shrink-0 max-sm:order-last">
				{#if step.due.hasDot}
					<StatusDot text={step.due.text} tone={step.due.tone} />
				{:else}
					<span class="text-small text-foreground">{step.due.text}</span>
				{/if}
			</span>
		{/if}

		{#if step.detail}
			<!--
				`basis-full` is what puts the detail on a line of its own under the
				title. The 68-character limit sits on an inner span rather than on
				the `<p>`, because a max-width on a flex item also caps the width it
				asks for, which would let the detail share the title's line and
				squeeze the title into a narrow column.
			-->
			<p class="basis-full text-small text-muted-foreground">
				<span class="block max-w-[68ch]">{step.detail}</span>
			</p>
		{/if}
	</div>
</div>
