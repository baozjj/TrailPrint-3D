<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useConfigStore } from "@/stores/config";
import { useUiStore } from "@/stores/ui";
import { validateTrayFromAppConfig } from "@shared/utils/tray-validation";
import AccordionSection from "@/components/ui/AccordionSection.vue";
import NumberField from "@/components/ui/NumberField.vue";

const configStore = useConfigStore();
const ui = useUiStore();
const { config } = storeToRefs(configStore);
const { openSections } = storeToRefs(ui);

const trayError = computed(() => {
  const v = validateTrayFromAppConfig(config.value);
  return v.valid ? null : v.message;
});
</script>

<template>
  <AccordionSection
    title="4. 托盘底座"
    :open="openSections.tray"
    @toggle="ui.toggleSection('tray')"
  >
    <NumberField
      v-model="config.tray.totalThicknessMm"
      label="总厚度"
      suffix="mm"
      :min="1"
      :max="50"
      :step="0.5"
    />
    <NumberField
      v-model="config.tray.recessDepthMm"
      label="下陷深度"
      suffix="mm"
      :min="0"
      :max="49"
      :step="0.5"
    />
    <NumberField
      v-model="config.tray.rimWidthMm"
      label="边框宽度"
      suffix="mm"
      :min="1"
      :max="30"
      :step="0.5"
    />
    <p v-if="trayError" class="error">{{ trayError }}</p>
  </AccordionSection>
</template>

<style scoped>
.error {
  margin: 0;
  font-size: 12px;
  color: #ff3b30;
}
</style>
