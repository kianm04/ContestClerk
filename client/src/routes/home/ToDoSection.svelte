<script lang="ts">
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import type { HomeTask } from '$lib/tasks';
	import TaskRow from './TaskRow.svelte';

	type Props = {
		/**
		 * What the reader still has to do, overdue and soonest first, without the
		 * task the hero took as its next step (`remainingTasks` in
		 * `$lib/home-hero.ts`). The page leaves the section out when it is empty,
		 * and the list is never cut short: a task the reader cannot see is one
		 * they will not do.
		 */
		tasks: HomeTask[];
		/** The moment the page was drawn, which turns each deadline into "In 5 days". */
		now: Date;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { tasks, now }: Props = $props();
</script>

<!--
	"To do" (`docs/home.md` section 3.4): a ruled list of `TaskRow`s under the
	section's black rule. No title link, because a task is something to finish,
	not somewhere to go; the way to each is the verb on its own row.
-->
<ManageSection title="To do">
	<ul>
		<!-- The `(task.id)` key lets Svelte reuse list items instead of rebuilding them. -->
		{#each tasks as task (task.id)}
			<TaskRow {task} {now} />
		{/each}
	</ul>
</ManageSection>
