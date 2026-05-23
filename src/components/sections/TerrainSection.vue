<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { TerrainSmoothing } from '@shared/types'
import { useConfigStore } from '@/stores/config'
import { useUiStore } from '@/stores/ui'
import AccordionSection from '@/components/ui/AccordionSection.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import NumberField from '@/components/ui/NumberField.vue'
import RangeSlider from '@/components/ui/RangeSlider.vue'

const configStore = useConfigStore()
const ui = useUiStore()
const { config } = storeToRefs(configStore)
const { openSections } = storeToRefs(ui)

const smoothingOptions: { value: TerrainSmoothing; label: string }[] = [
  { value: 'raw', label: '原始' },
  { value: 'light', label: '轻度' },
  { value: 'medium', label: '中度' },
  { value: 'heavy', label: '高度' }
]
</script>

<template>
  <AccordionSection
    title="2. 地形塑造"
    :open="openSections.terrain"
    @toggle="ui.toggleSection('terrain')"
  >
    <NumberField
      v-model="config.terrain.baseSolidThicknessMm"
      label="模型基础厚度"
      suffix="mm"
      :min="0.5"
      :max="20"
      :step="0.5"
    />
    <RangeSlider
      v-model="config.terrain.zExaggeration"
      label="Z轴高程夸张"
      :min="1"
      :max="5"
      :step="0.1"
      :format="(v) => `${v.toFixed(1)}x`"
    />
    <div class="field-group">
      <span class="field-group__label">地形平滑度</span>
      <SegmentedControl v-model="config.terrain.smoothing" :options="smoothingOptions" />
    </div>
  </AccordionSection>
</template>

<style scoped>
.field-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-group__label {
  font-size: 12px;
  color: var(--tp-text-secondary);
}
</style>
