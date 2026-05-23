<script setup lang="ts">
defineProps<{
  modelValue: number
  label?: string
  suffix?: string
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

function onInput(e: Event): void {
  const raw = (e.target as HTMLInputElement).value
  const n = parseFloat(raw)
  if (!Number.isNaN(n)) emit('update:modelValue', n)
}
</script>

<template>
  <label class="field" :class="{ 'field--disabled': disabled }">
    <span v-if="label" class="field__label">{{ label }}</span>
    <span class="field__input-wrap">
      <input
        type="number"
        class="field__input"
        :value="modelValue"
        :min="min"
        :max="max"
        :step="step ?? 0.1"
        :disabled="disabled"
        @input="onInput"
      />
      <span v-if="suffix" class="field__suffix">{{ suffix }}</span>
    </span>
  </label>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.field--disabled {
  opacity: 0.45;
}

.field__label {
  font-size: 12px;
  color: var(--tp-text-secondary);
}

.field__input-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 12px;
  background: var(--tp-bg-input);
  border-radius: var(--tp-radius-control);
}

.field__input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 15px;
  font-weight: 500;
  color: var(--tp-text-primary);
  outline: none;
  min-width: 0;
}

.field__input:focus {
  outline: none;
}

.field__suffix {
  font-size: 13px;
  color: var(--tp-text-secondary);
  margin-left: 8px;
  flex-shrink: 0;
}
</style>
