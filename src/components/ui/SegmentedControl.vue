<script setup lang="ts" generic="T extends string">
defineProps<{
  modelValue: T
  options: { value: T; label: string }[]
  darkActive?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
</script>

<template>
  <div class="segmented" role="group">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="segmented__item"
      :class="{
        'segmented__item--active': modelValue === opt.value,
        'segmented__item--dark': darkActive && modelValue === opt.value
      }"
      @click="emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--tp-bg-segment);
  border-radius: var(--tp-radius-control);
  height: 36px;
}

.segmented__item {
  flex: 1;
  min-width: 0;
  border-radius: 8px;
  font-size: 12px;
  color: var(--tp-text-secondary);
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}

.segmented__item--active {
  background: #fff;
  color: var(--tp-text-primary);
  font-weight: 600;
  box-shadow: var(--tp-shadow-segment);
}

.segmented__item--dark.segmented__item--active {
  background: var(--tp-cta);
  color: #fff;
}
</style>
