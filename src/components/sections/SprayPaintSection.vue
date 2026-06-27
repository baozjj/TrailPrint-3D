<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useConfigStore } from "@/stores/config";
import { useUiStore } from "@/stores/ui";
import AccordionSection from "@/components/ui/AccordionSection.vue";
import IosToggle from "@/components/ui/IosToggle.vue";
import NumberField from "@/components/ui/NumberField.vue";

const configStore = useConfigStore();
const ui = useUiStore();
const { config } = storeToRefs(configStore);
const { openSections } = storeToRefs(ui);
</script>

<template>
  <AccordionSection
    title="6. 喷漆分色"
    badge="高级"
    :open="openSections.sprayPaint"
    @toggle="ui.toggleSection('sprayPaint')"
  >
    <p class="hint">
      启用后导出 ZIP 将额外包含遮挡罩 STL 与
      <code>spray_paint_manifest.json</code>。在 3D 预览中可先做规则分色与套合检查。
    </p>

    <div class="toggle-row">
      <span>启用喷漆分色</span>
      <IosToggle v-model="config.sprayPaint.enabled" />
    </div>

    <template v-if="config.sprayPaint.enabled">
      <p class="hint">以下参数影响遮挡罩几何与导出结果。</p>
      <div class="row">
        <NumberField
          v-model="config.sprayPaint.maskShellThicknessMm"
          label="罩体厚度"
          suffix="mm"
          :min="0.4"
          :max="3"
          :step="0.1"
        />
        <NumberField
          v-model="config.sprayPaint.maskFitToleranceMm"
          label="套合间隙"
          suffix="mm"
          :min="0"
          :max="1"
          :step="0.05"
        />
      </div>
      <NumberField
        v-model="config.sprayPaint.bleedMarginMm"
        label="边界过渡宽度"
        suffix="mm"
        :min="0"
        :max="2"
        :step="0.1"
      />
    </template>
  </AccordionSection>
</template>

<style scoped>
.hint {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--tp-text-secondary);
}

.hint code {
  font-size: 11px;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--tp-text-primary);
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 10px;
}
</style>
