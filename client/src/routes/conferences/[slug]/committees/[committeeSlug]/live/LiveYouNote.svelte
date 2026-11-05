<script lang="ts">
	type Props = {
		/** "You have the floor", "You are 2nd · about 3 min" or "You voted yes". */
		text: string;
	};

	let { text }: Props = $props();
</script>

<!-- What the room means for the reader, in a pale blue box so it is found at a glance. -->
<p class="rounded-control bg-brand-50 px-3 py-2.5 font-medium text-brand-900">{text}</p>
