<script setup lang="ts">
defineProps<{ modelValue: boolean; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <button
    type="button"
    class="toggle"
    :class="{ 'toggle--on': modelValue, 'toggle--disabled': disabled }"
    :disabled="disabled"
    role="switch"
    :aria-checked="modelValue"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span class="toggle__thumb" />
  </button>
</template>

<style scoped>
.toggle {
  width: 44px;
  height: 26px;
  border-radius: 13px;
  background: #e5e5ea;
  position: relative;
  transition: background 0.2s;
  flex-shrink: 0;
}

.toggle--on {
  background: var(--tp-success);
}

.toggle--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toggle__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s;
}

.toggle--on .toggle__thumb {
  transform: translateX(18px);
}
</style>
