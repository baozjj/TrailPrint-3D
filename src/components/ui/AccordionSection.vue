<script setup lang="ts">
defineProps<{
  title: string
  open: boolean
  badge?: string
}>()

const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <section class="accordion">
    <button type="button" class="accordion__head" @click="emit('toggle')">
      <span class="accordion__title">{{ title }}</span>
      <span v-if="badge" class="accordion__badge">{{ badge }}</span>
      <svg
        class="accordion__chevron"
        :class="{ 'accordion__chevron--open': open }"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
    <div v-show="open" class="accordion__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.accordion {
  background: var(--tp-bg-panel);
  border: 1px solid var(--tp-border);
  border-radius: var(--tp-radius-panel);
  overflow: hidden;
}

.accordion__head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 14px 16px;
  text-align: left;
}

.accordion__title {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: var(--tp-text-primary);
}

.accordion__badge {
  font-size: 11px;
  color: var(--tp-text-secondary);
  background: var(--tp-bg-input);
  padding: 4px 8px;
  border-radius: 6px;
}

.accordion__chevron {
  color: var(--tp-text-secondary);
  transform: rotate(-90deg);
  transition: transform 0.2s;
  flex-shrink: 0;
}

.accordion__chevron--open {
  transform: rotate(0deg);
}

.accordion__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0 16px 16px;
  min-width: 0;
}
</style>
