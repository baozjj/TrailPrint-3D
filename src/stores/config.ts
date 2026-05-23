import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createDefaultConfig, type AppConfig } from '@shared/types'

export const useConfigStore = defineStore('config', () => {
  const config = ref<AppConfig>(createDefaultConfig())

  function resetConfig(): void {
    config.value = createDefaultConfig()
  }

  function patchConfig(partial: Partial<AppConfig>): void {
    config.value = { ...config.value, ...partial }
  }

  /** 供主进程读取的快照（后续任务通过 IPC 传递） */
  function toSnapshot(): AppConfig {
    return JSON.parse(JSON.stringify(config.value)) as AppConfig
  }

  return { config, resetConfig, patchConfig, toSnapshot }
})
