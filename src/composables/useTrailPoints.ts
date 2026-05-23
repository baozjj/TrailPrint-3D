import { computed } from 'vue'
import type { GpxPoint } from '@shared/types'
import { simplifyGpxTrack } from '@shared/utils/gpx-simplify'
import { useConfigStore } from '@/stores/config'

/**
 * 轨迹点管道（任务-04）：gpxSimplify 开启时返回降噪/简化后的点列。
 */
export function useTrailPoints() {
  const configStore = useConfigStore()

  const effectivePoints = computed((): GpxPoint[] => {
    const { gpx, trail } = configStore.config
    if (!gpx.imported || gpx.points.length === 0) return []
    const raw = gpx.rawPoints.length > 0 ? gpx.rawPoints : gpx.points
    if (trail.gpxSimplify) {
      return simplifyGpxTrack(raw)
    }
    return gpx.points.length > 0 ? gpx.points : raw
  })

  return { effectivePoints }
}
