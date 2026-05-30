<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import type { TerrainSmoothing } from '@shared/types'
import { OPEN_TOPO_DEM_OPTIONS } from '@shared/types/dem'
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

const demOptions = OPEN_TOPO_DEM_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label
}))

const demHint = computed(() => {
  const found = OPEN_TOPO_DEM_OPTIONS.find(
    (o) => o.value === config.value.terrain.demDataset
  )
  return found?.hint ?? ''
})
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

    <div class="field-group">
      <label class="field-group__label" for="dem-dataset">DEM 数据源（OpenTopography）</label>
      <select
        id="dem-dataset"
        v-model="config.terrain.demDataset"
        class="text-input"
      >
        <option v-for="opt in demOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
      <p v-if="demHint" class="field-hint">{{ demHint }}</p>
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

.text-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--tp-border, #d0d0d0);
  border-radius: 8px;
  font-size: 13px;
  background: var(--tp-bg-input, #fff);
  color: var(--tp-text-primary, #1a1a1a);
}

.field-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--tp-text-secondary);
}
</style>
