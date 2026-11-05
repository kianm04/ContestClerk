<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Button from '$lib/components/Button.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import SortableItem from '$lib/components/SortableItem.svelte';
	import { TOPIC_DROP_HINT_ID } from '$lib/committees';
	import { moveItem, reorderHint } from '$lib/drag-order';
	import { fieldErrorId } from '$lib/form-fields';
	import { createSortableList, type SortableDrop } from '$lib/sortable-list.svelte';
	import TopicRow from './TopicRow.svelte';

	type Props = {
		/** One row per topic, in the order the organiser put them. May be empty. */
		topics: string[];
		/** What is wrong with the list as a whole, if anything. */
		error?: string | null;
		/** True while the form these buttons sit in is sending, so they can say so. */
		isBusy: boolean;
	};

	let { topics, error = null, isBusy }: Props = $props();

	/** The one name every row is sent under, so the server reads them as a list. */
	const TOPIC_FIELD_NAME = 'topics[]';

	/** The longest a topic may be, so one row stays one line on a projector. */
	const TOPIC_MAX_LENGTH = 200;

	/*
		A committee with no topics yet still needs somewhere to type the first one,
		so an empty list is drawn as a single empty row. `$derived` works this out
		again every time the server hands back a different list.

		Each row carries a key of its own so that a dragged row keeps its input,
		and whatever was typed into it, when it moves. A drop assigns the rows a
		new order, which a `$derived` allows until the server hands back a list
		again. Nothing is saved until the form is: the inputs are sent in the
		order they are drawn.
	*/
	let rows = $derived(
		(topics.length === 0 ? [''] : topics).map((text, index) => ({ key: `topic-${index}`, text }))
	);

	function handleDrop(drop: SortableDrop) {
		rows = moveItem(rows, drop.fromIndex, drop.toIndex);
	}

	// Follows the drag handles and works out where every row is drawn (`$lib/sortable-list.svelte.ts`).
	const sortable = createSortableList({ onDrop: handleDrop });
</script>

<!--
	`<fieldset>` with a `<legend>` is how HTML groups fields that answer one
	question, so a screen reader reads "Topics" before each row. The section
	around it already shows "Topics" as its heading, so the legend is only for
	a screen reader.

	Both buttons below are ordinary submit buttons inside the form that wraps
	this editor, which is what makes the list work with JavaScript switched off:
	pressing one posts the whole form to `?/addTopic` or `?/removeTopic`, which
	save nothing and hand the page straight back with one row more or one row
	fewer.

	`skipsValidation` puts `formnovalidate` on both of them. The form's Name
	field is `required`, and without it a browser would refuse to post at all
	while the name was still empty, so laying the topic rows out first on a
	brand-new committee would do nothing at all.

	Which row a "Remove" button means travels in that action's own query string
	rather than in a hidden field, the way `../details/+page.server.ts` sends
	`?/removeImage&kind=banner`. It has to: these buttons sit inside the page's
	one big form, and a second `<form>` around one of them would be a form
	inside a form, which HTML does not allow.

	The rows are written out here rather than with `TextField`, which every other
	field on this page uses. `TextField` builds its id from the field's name, and
	every row here is sent under the same name, so all of them would share one id
	and clicking "Topic 2" would put the cursor in row 1. The classes come from
	`$lib/form-fields.ts`, which exists so that a control written by hand still
	looks exactly like the shared ones.
-->
<fieldset aria-describedby={error ? fieldErrorId('topics') : undefined}>
	<legend class="sr-only">Topics</legend>

	<!-- `sr-only` hides these from the screen but not from a screen reader.
		`aria-live` makes a screen reader read each new message out as soon as it appears. -->
	<p id={TOPIC_DROP_HINT_ID} class="sr-only">{reorderHint('topic')}</p>
	<p class="sr-only" aria-live="assertive">{sortable.announcement}</p>

	<div class="flex flex-col gap-3">
		<!-- `data-sortable-list` tells the dragging helper which rows belong to this
			list. The `(row.key)` key lets a dragged row keep its own input. -->
		<ul class="flex flex-col gap-2" data-sortable-list>
			{#each rows as row, index (row.key)}
				<SortableItem {sortable} id={row.key} {index}>
					<TopicRow
						rowKey={row.key}
						text={row.text}
						{index}
						fieldName={TOPIC_FIELD_NAME}
						maxLength={TOPIC_MAX_LENGTH}
						{sortable}
						{isBusy}
					/>
				</SortableItem>
			{/each}
		</ul>

		<div>
			<Button
				label="Add topic"
				variant="secondary"
				size="dense-sm"
				icon={Plus}
				formaction="?/addTopic"
				skipsValidation
				isLoading={isBusy}
			/>
		</div>
	</div>

	<FieldError id={fieldErrorId('topics')} message={error} />
</fieldset>
