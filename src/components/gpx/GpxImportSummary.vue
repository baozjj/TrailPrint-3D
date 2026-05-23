<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigStore } from '@/stores/config'

const { config } = storeToRefs(useConfigStore())
const gpx = computed(() => config.value.gpx)
</script>

<template>
  <div v-if="gpx.lastImportError" class="gpx-summary gpx-summary--error">
    {{ gpx.lastImportError }}
  </div>
  <div v-else-if="gpx.imported" class="gpx-summary">
    <p class="gpx-summary__title">{{ gpx.trackName || gpx.fileName || '已导入轨迹' }}</p>
    <p class="gpx-summary__meta">
      {{ gpx.pointCount }} 个点 · 约 {{ gpx.distanceKm.toFixed(2) }} km
    </p>
    <p v-if="gpx.bounds" class="gpx-summary__bounds">
      范围 {{ gpx.bounds.minLat.toFixed(4) }}°–{{ gpx.bounds.maxLat.toFixed(4) }}°，
      {{ gpx.bounds.minLon.toFixed(4) }}°–{{ gpx.bounds.maxLon.toFixed(4) }}°
    </p>
  </div>
</template>

<style scoped>
.gpx-summary {
  margin: 0 20px 8px;
  padding: 10px 12px;
  background: var(--tp-bg-input);
  border-radius: var(--tp-radius-control);
  font-size: 12px;
}

.gpx-summary--error {
  margin: 0 20px 8px;
  padding: 10px 12px;
  background: #fff0f0;
  border-radius: var(--tp-radius-control);
  font-size: 12px;
  color: #ff3b30;
  line-height: 1.4;
}

.gpx-summary__title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--tp-text-primary);
}

.gpx-summary__meta {
  margin: 0;
  color: var(--tp-text-secondary);
}

.gpx-summary__bounds {
  margin: 4px 0 0;
  color: var(--tp-text-secondary);
  font-size: 11px;
}
</style>
