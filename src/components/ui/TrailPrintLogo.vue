<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number
    variant?: 'default' | 'dark'
  }>(),
  {
    size: 36,
    variant: 'default',
  },
)
</script>

<template>
  <svg
    class="trailprint-logo"
    :width="size"
    :height="size"
    viewBox="0 0 36 36"
    fill="none"
    aria-hidden="true"
  >
    <rect
      width="36"
      height="36"
      rx="10"
      :fill="variant === 'dark' ? '#1D1D1F' : '#F2F2F7'"
    />
    <path
      d="M5 25.5C12 24 24 24 31 25.5"
      :stroke="variant === 'dark' ? '#FFFFFF' : '#1D1D1F'"
      :stroke-opacity="variant === 'dark' ? 0.14 : 0.12"
      stroke-width="1.25"
      stroke-linecap="round"
    />
    <path
      d="M5 19.5C13 17.5 23 17.5 31 19"
      :stroke="variant === 'dark' ? '#FFFFFF' : '#1D1D1F'"
      :stroke-opacity="variant === 'dark' ? 0.2 : 0.18"
      stroke-width="1.25"
      stroke-linecap="round"
    />
    <path
      d="M5 13.5C14 12 22 12 31 13"
      :stroke="variant === 'dark' ? '#FFFFFF' : '#1D1D1F'"
      :stroke-opacity="variant === 'dark' ? 0.28 : 0.24"
      stroke-width="1.25"
      stroke-linecap="round"
    />
    <path
      d="M7 28.5C11 25 14 21 18 22.5C22 24 25 14 29.5 9.5"
      stroke="#007AFF"
      stroke-width="2.25"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle cx="29.5" cy="9.5" r="2" fill="#007AFF" />
  </svg>
</template>

<style scoped>
.trailprint-logo {
  display: block;
  flex-shrink: 0;
}
</style>
