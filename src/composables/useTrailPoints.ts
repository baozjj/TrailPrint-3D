import { computed } from 'vue'
import type { GpxPoint } from '@shared/types'
import { useConfigStore } from '@/stores/config'

/**
 * 轨迹点读取管道：默认返回解析结果；任务-04 将在 gpxSimplify 开启时替换为优化轨迹。
 */
export function useTrailPoints() {
  const configStore = useConfigStore()

  const effectivePoints = computed((): GpxPoint[] => {
    const { gpx, trail } = configStore.config
    if (!gpx.imported || gpx.points.length === 0) return []
    if (trail.gpxSimplify) {
      // TODO 任务-04：对 rawPoints 做降噪/平滑后返回
      return gpx.rawPoints.length > 0 ? gpx.rawPoints : gpx.points
    }
    return gpx.points
  })

  return { effectivePoints }
}
