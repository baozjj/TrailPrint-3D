<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useConfigStore } from '@/stores/config'
import { useUiStore } from '@/stores/ui'
import AccordionSection from '@/components/ui/AccordionSection.vue'
import IosToggle from '@/components/ui/IosToggle.vue'
import NumberField from '@/components/ui/NumberField.vue'
import CheckboxField from '@/components/ui/CheckboxField.vue'

const configStore = useConfigStore()
const ui = useUiStore()
const { config } = storeToRefs(configStore)
const { openSections } = storeToRefs(ui)
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
</style>
