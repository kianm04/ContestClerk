<script lang="ts">
	import { SESSION_NAME_MAX_LENGTH } from '$lib/chair-room';
	import { CONTROL_CLASSES, LABEL_CLASSES } from '$lib/form-fields';

	type Props = {
		/** The name the session gets unless a chair types another: "Session 2". */
		defaultName: string;
		/** The id of the start form the field is sent with (`StartSessionForm`). */
		formId: string;
	};

	let { defaultName, formId }: Props = $props();

	const FIELD_ID = 'session-name';
</script>

<!--
	"Rename this session": a `<details>` is shut until clicked, so a chair happy
	with the name never meets the field (P5), and it opens without JavaScript.
	The field is not inside the start form, so its `form` attribute names that
	form, and the browser sends it with the form all the same. Left empty, the
	session gets its default name.
-->
<details class="min-w-0">
	<summary
		class="inline-flex cursor-pointer list-none items-center text-small font-medium text-brand-700 hover:underline max-md:min-h-11 [&::-webkit-details-marker]:hidden"
	>
		Rename this session
	</summary>
	<div class="mt-2 w-64 max-w-full">
		<label for={FIELD_ID} class={LABEL_CLASSES}>Session name</label>
		<input
			id={FIELD_ID}
			name="name"
			form={formId}
			placeholder={defaultName}
			autocomplete="off"
			maxlength={SESSION_NAME_MAX_LENGTH}
			class={CONTROL_CLASSES}
		/>
	</div>
</details>
