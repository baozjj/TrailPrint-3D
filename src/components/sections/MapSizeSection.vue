<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import type { BaseShape } from '@shared/types'
import { useConfigStore } from '@/stores/config'
import { useUiStore } from '@/stores/ui'
import AccordionSection from '@/components/ui/AccordionSection.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import NumberField from '@/components/ui/NumberField.vue'

const configStore = useConfigStore()
const ui = useUiStore()
const { config } = storeToRefs(configStore)
const { openSections } = storeToRefs(ui)

const shapeOptions: { value: BaseShape; label: string }[] = [
  { value: 'circle', label: '圆形' },
  { value: 'rectangle', label: '矩形' },
  { value: 'polygon', label: '多边形' }
]

const isCircle = computed(() => config.value.mapCrop.shape === 'circle')
const isRectangle = computed(() => config.value.mapCrop.shape === 'rectangle')
const isPolygon = computed(() => config.value.mapCrop.shape === 'polygon')
</script>

<template>
  <AccordionSection
    title="1. 地图与尺寸"
    :open="openSections.map"
    @toggle="ui.toggleSection('map')"
  >
    <div class="field-group">
      <span class="field-group__label">形状</span>
      <SegmentedControl v-model="config.mapCrop.shape" :options="shapeOptions" />
    </div>

    <p class="field-hint">地图遮罩大小固定；下方 mm 尺寸仅用于生成 STL 模型。</p>

    <div class="row">
      <NumberField
        v-if="isCircle"
        v-model="config.mapCrop.radiusMm"
        label="打印半径"
        suffix="mm"
        :min="10"
        :max="500"
      />
      <template v-if="isRectangle">
        <NumberField
          v-model="config.mapCrop.lengthMm"
          label="打印长度"
          suffix="mm"
          :min="10"
          :max="500"
        />
        <NumberField
          v-model="config.mapCrop.widthMm"
          label="打印宽度"
          suffix="mm"
          :min="10"
          :max="500"
        />
      </template>
      <template v-if="isPolygon">
        <NumberField
          v-model="config.mapCrop.polygonSides"
          label="边数"
          :min="3"
          :max="8"
          :step="1"
        />
        <NumberField
          v-model="config.mapCrop.polygonSideLengthMm"
          label="打印边长"
          suffix="mm"
          :min="10"
          :max="300"
        />
      </template>
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

.field-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--tp-text-secondary);
}

.row {
  display: flex;
  gap: 12px;
}
</style>
