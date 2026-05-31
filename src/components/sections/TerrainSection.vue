<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import type { TerrainMeshQuality, TerrainSmoothing } from '@shared/types'
import {
  CUSTOM_MESH_GRID_MAX,
  CUSTOM_MESH_GRID_MIN,
  demSampleCount,
  meshQualitySummary,
  normalizeMeshQualityCustom
} from '@shared/utils/terrain-mesh-quality'
import { OPEN_TOPO_DEM_OPTIONS, openTopoDemTooltipText } from '@shared/types/dem'
import { useConfigStore } from '@/stores/config'
import { useUiStore } from '@/stores/ui'
import AccordionSection from '@/components/ui/AccordionSection.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import NumberField from '@/components/ui/NumberField.vue'
import RangeSlider from '@/components/ui/RangeSlider.vue'
import InfoTooltip from '@/components/ui/InfoTooltip.vue'

const demTooltipText = openTopoDemTooltipText()

const configStore = useConfigStore()
const ui = useUiStore()
const { config } = storeToRefs(configStore)
const { openSections } = storeToRefs(ui)

const meshQualityOptions: { value: TerrainMeshQuality; label: string }[] = [
  { value: 'standard', label: '标准' },
  { value: 'high', label: '高精' },
  { value: 'ultra', label: '超高' },
  { value: 'extreme', label: '极致' },
  { value: 'studio', label: '制版' },
  { value: 'custom', label: '自定义' }
]

const meshQualityParams = computed(() => ({
  meshQuality: config.value.terrain.meshQuality,
  meshQualityCustom: config.value.terrain.meshQualityCustom
}))

const isCustomMeshQuality = computed(
  () => config.value.terrain.meshQuality === 'custom'
)

const customMaxGrid = computed({
  get: () => config.value.terrain.meshQualityCustom.maxGrid,
  set: (v: number) => {
    config.value.terrain.meshQualityCustom = normalizeMeshQualityCustom({
      maxGrid: v
    })
  }
})

const meshQualityHint = computed(() =>
  meshQualitySummary(config.value.mapCrop, meshQualityParams.value)
)

const meshQualityPerfHint = computed(() => {
  const n = demSampleCount(config.value.mapCrop, meshQualityParams.value)
  const q = config.value.terrain.meshQuality
  const sampleLabel =
    n >= 1_000_000
      ? `约 ${(n / 1e6).toFixed(1)}M`
      : `约 ${Math.round(n / 1000)}k`
  if (q === 'custom') {
    const heavy =
      n >= 800_000
        ? '；需约 8GB+ 可用内存（应用已自动放宽堆上限）'
        : ''
    return `${sampleLabel} 高程采样${heavy}。修改上限后需重新生成地形；DEM 建议 COP30。`
  }
  if (q === 'studio' && n >= 800_000) {
    return `${sampleLabel} 高程采样；STL 可能很大，建议 16GB+ 内存。DEM 用 COP30，平滑用「原始」。`
  }
  if (q === 'extreme') {
    return `${sampleLabel} 采样；生成较慢。建议 DEM 用 COP30 (30m)，平滑用「原始/轻度」。`
  }
  return '更高档位生成与导出更慢；源 DEM 分辨率（如 COP30 30m）决定地形细节上限。'
})

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
      <label class="field-group__label" for="mesh-quality">网格精度</label>
      <select
        id="mesh-quality"
        v-model="config.terrain.meshQuality"
        class="text-input"
      >
        <option
          v-for="opt in meshQualityOptions"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </option>
      </select>
      <NumberField
        v-if="isCustomMeshQuality"
        v-model="customMaxGrid"
        label="DEM 网格单边上限"
        :min="CUSTOM_MESH_GRID_MIN"
        :max="CUSTOM_MESH_GRID_MAX"
        :step="32"
        suffix="格"
      />
      <p class="field-hint">{{ meshQualityHint }}</p>
      <p class="field-hint">{{ meshQualityPerfHint }}</p>
    </div>
    <div class="field-group">
      <span class="field-group__label">地形平滑度</span>
      <SegmentedControl v-model="config.terrain.smoothing" :options="smoothingOptions" />
    </div>

    <div class="field-group">
      <div class="field-group__label-row">
        <label class="field-group__label" for="dem-dataset">DEM 数据源（OpenTopography）</label>
        <InfoTooltip
          aria-label="DEM 数据源说明"
          :content="demTooltipText"
        />
      </div>
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

.field-group__label-row {
  display: flex;
  align-items: center;
  gap: 6px;
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
