<script lang="ts">
	type Props = {
		/** The id that the field's `aria-describedby` points at. */
		id: string;
		/** What is wrong, or nothing when all is well. */
		message?: string | null;
	};

	let { id, message = null }: Props = $props();
</script>

{#if message}
	<p {id} class="mt-1 text-small text-danger-700">{message}</p>
{/if}
