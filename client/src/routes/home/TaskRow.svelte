<script lang="ts">
	import ActionRow from '$lib/components/manage/ActionRow.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import { dueWord } from '$lib/home-rows';
	import type { HomeTask } from '$lib/tasks';

	type Props = {
		/** One thing the reader still has to do, worded by `deriveTasks` in `$lib/tasks.ts`. */
		task: HomeTask;
		/**
		 * The moment the page was drawn, which turns the deadline into "Tomorrow" or
		 * "In 5 days". It is passed in rather than read from the clock here, so the
		 * server and the browser draw the same row.
		 */
		now: Date;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { task, now }: Props = $props();

	/*
		"Overdue", "In 5 days" or "By 25 Jul 2027" with the colour of its dot, or
		`null` for a task that has no deadline and so says nothing about when. The
		deadline is a day in the conference's own timezone, never the reader's,
		which is why the zone travels with it. `$derived` works it out again
		whenever the task or `now` changes.
	*/
	const due = $derived(task.deadline === null ? null : dueWord(task.deadline, now));
</script>

<!--
	One row of "To do": what needs doing, with the due word and the verb that
	does it at the right. A task has no tick box and nothing to press but its
	verb: it disappears by itself the moment its condition stops being true. The
	verb is a link rather than a button because the page's one button is in the
	hero. `?? undefined` turns "no second line" from the `null` the task carries
	into the `undefined` `ActionRow` expects.

	A grey due word is drawn without its dot: a grey dot would only repeat the
	word, while a red or amber one says what the word alone does not.

	On a phone `ActionRow` moves this whole slot onto its own line under the
	text, right-aligned, so the word and the verb sit side by side there too.
-->
<ActionRow title={task.title} detail={task.detail ?? undefined}>
	<span class="flex items-center gap-4">
		{#if due !== null && due.hasDot}
			<StatusDot text={due.text} tone={due.tone} />
		{:else if due !== null}
			<span class="text-small whitespace-nowrap text-foreground">{due.text}</span>
		{/if}

		<!-- Every rule gives a task somewhere to go; a verb with nowhere to lead is left out. -->
		{#if task.href}
			<a
				href={task.href}
				class="inline-flex min-h-11 items-center text-dense font-medium text-link hover:underline"
			>
				{task.actionLabel}
			</a>
		{/if}
	</span>
</ActionRow>
