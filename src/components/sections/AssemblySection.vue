<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigStore } from '@/stores/config'
import { useUiStore } from '@/stores/ui'
import {
  resolveCircleMagnetCount,
  resolveFootprintShape,
  resolvePolygonMagnetCount,
} from '@shared/utils/magnet-hole-layout'
import AccordionSection from '@/components/ui/AccordionSection.vue'
import IosToggle from '@/components/ui/IosToggle.vue'
import NumberField from '@/components/ui/NumberField.vue'
import CheckboxField from '@/components/ui/CheckboxField.vue'

const configStore = useConfigStore()
const ui = useUiStore()
const { config } = storeToRefs(configStore)
const { openSections } = storeToRefs(ui)

const magnetHoleCountHint = computed(() => {
  const { mapCrop } = config.value
  const { magnet } = config.value.assembly
  const shape = resolveFootprintShape(mapCrop)
  if (shape === 'circle') {
    const n = resolveCircleMagnetCount(magnet)
    return `圆形底座将均匀分布 ${n} 个磁铁孔。`
  }
  if (shape === 'polygon') {
    const n = resolvePolygonMagnetCount(mapCrop.polygonSides)
    return `正 ${n} 边形底座将在各顶点方向各打 1 孔（共 ${n} 个）。`
  }
  return '矩形底座在四角各打 1 孔（共 4 个）。'
})

const showCircleMagnetCount = computed(
  () =>
    config.value.assembly.magnet.enabled &&
    resolveFootprintShape(config.value.mapCrop) === 'circle',
)
</script>

<template>
  <AccordionSection
    title="5. 装配与磁铁"
    badge="高级"
    :open="openSections.assembly"
    @toggle="ui.toggleSection('assembly')"
  >
    <div class="row">
      <NumberField
        v-model="config.assembly.trailToleranceMm"
        label="轨迹槽公差"
        suffix="mm"
        :min="0"
        :max="1"
        :step="0.01"
      />
      <NumberField
        v-model="config.assembly.trayToleranceMm"
        label="底座槽公差"
        suffix="mm"
        :min="0"
        :max="1"
        :step="0.01"
      />
    </div>

    <div class="toggle-row">
      <span>启用免胶水磁吸装配</span>
      <IosToggle v-model="config.assembly.magnet.enabled" />
    </div>

    <template v-if="config.assembly.magnet.enabled">
      <p class="hint">
        请勾选下方孔位类型，否则不会生成磁铁孔。拼接孔会打在主模型底面与托盘凹槽底面。
      </p>
      <div class="row">
        <NumberField
          v-model="config.assembly.magnet.diameterMm"
          label="磁铁直径"
          suffix="mm"
          :min="2"
          :max="20"
          :step="0.5"
        />
        <NumberField
          v-model="config.assembly.magnet.thicknessMm"
          label="磁铁厚度"
          suffix="mm"
          :min="1"
          :max="10"
          :step="0.5"
        />
      </div>
      <NumberField
        v-if="showCircleMagnetCount"
        v-model="config.assembly.magnet.circleCount"
        label="圆形磁铁孔数量"
        suffix="个"
        :min="2"
        :max="12"
        :step="1"
      />
      <p class="hint">{{ magnetHoleCountHint }}</p>
      <CheckboxField
        v-model="config.assembly.magnet.fridgeMagnetHole"
        label="底面展示孔（如冰箱贴）"
      />
      <CheckboxField
        v-model="config.assembly.magnet.snapFitHole"
        label="模型拼接定位孔"
      />
    </template>
  </AccordionSection>
</template>

<style scoped>
.row {
  display: flex;
  gap: 12px;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
}

.hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--color-text-secondary, #888);
}
</style>
