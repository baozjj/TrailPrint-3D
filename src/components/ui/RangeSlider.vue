<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: number
  min?: number
  max?: number
  step?: number
  label?: string
  format?: (v: number) => string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const min = computed(() => props.min ?? 1)
const max = computed(() => props.max ?? 5)
const display = computed(() =>
  props.format ? props.format(props.modelValue) : `${props.modelValue}x`
)

function onInput(e: Event): void {
  emit('update:modelValue', parseFloat((e.target as HTMLInputElement).value))
}
</script>

<template>
  <div class="slider">
    <div class="slider__header">
      <span v-if="label" class="slider__label">{{ label }}</span>
      <span class="slider__value">{{ display }}</span>
    </div>
    <input
      type="range"
      class="slider__input"
      :value="modelValue"
      :min="min"
      :max="max"
      :step="step ?? 0.1"
      @input="onInput"
    />
  </div>
</template>

<style scoped>
.slider {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.slider__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.slider__label {
  font-size: 12px;
  color: var(--tp-text-secondary);
}

.slider__value {
  font-size: 13px;
  font-weight: 600;
  color: var(--tp-text-accent);
}

.slider__input {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: #e5e5ea;
  outline: none;
}

.slider__input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  border: 0.5px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  cursor: pointer;
}

.slider__input::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  border: 0.5px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  cursor: pointer;
}
</style>
