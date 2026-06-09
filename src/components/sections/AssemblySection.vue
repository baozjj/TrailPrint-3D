<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigStore } from '@/stores/config'
import { useUiStore } from '@/stores/ui'
import { trayMagnetHoleCount } from '@shared/utils/magnet-hole-layout'
import { computeTrayFootprint } from '@shared/utils/tray-footprint'
import AccordionSection from '@/components/ui/AccordionSection.vue'
import IosToggle from '@/components/ui/IosToggle.vue'
import NumberField from '@/components/ui/NumberField.vue'

const configStore = useConfigStore()
const ui = useUiStore()
const { config } = storeToRefs(configStore)
const { openSections } = storeToRefs(ui)

const trayFootprint = computed(() => computeTrayFootprint(config.value))

const magnetHoleCountHint = computed(() => {
  const footprint = trayFootprint.value
  const n = trayMagnetHoleCount(config.value, footprint)
  if (footprint.shape === 'circle') {
    return `圆形托盘底面将均匀分布 ${n} 个磁铁孔。`
  }
  if (footprint.shape === 'polygon') {
    return `正 ${footprint.outer.length} 边形托盘底面将在各顶点各打 1 孔（共 ${n} 个）。`
  }
  return '矩形托盘底面在四角各打 1 孔（共 4 个）。'
})

const showCircleMagnetCount = computed(
  () =>
    config.value.assembly.magnet.enabled &&
    trayFootprint.value.shape === 'circle',
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
      <span>底部磁铁孔</span>
      <IosToggle v-model="config.assembly.magnet.enabled" />
    </div>

    <template v-if="config.assembly.magnet.enabled">
      <p class="hint">
        开启后在托盘底面生成正六边形磁铁孔（内切圆直径与磁铁直径一致），圆磁铁易放入，六角空隙便于取出。
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
          :min="0.5"
          :max="10"
          :step="0.5"
        />
      </div>
      <NumberField
        v-if="showCircleMagnetCount"
        v-model="config.assembly.magnet.circleCount"
        label="磁铁孔数"
        :min="2"
        :max="12"
        :step="1"
      />
      <p class="hint">{{ magnetHoleCountHint }}</p>
    </template>
  </AccordionSection>
</template>

<style scoped>
.row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.row > * {
  flex: 1;
  min-width: 120px;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.hint {
  font-size: 12px;
  color: var(--tp-text-secondary);
  margin: 0;
}
</style>
