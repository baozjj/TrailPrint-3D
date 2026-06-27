import type { TerrainMeshPayload } from "@shared/types/terrain";
import { analyzeMesh } from "@shared/utils/mesh-manifold";

/**
 * 喷漆遮挡罩允许多块独立壳体（如同一颜色上下分离），
 * 不要求单一连通水密体；仅拒绝空网格，其余拓扑问题降级为 warnings。
 */
export function validateMaskMesh(
  mesh: TerrainMeshPayload,
  fileName: string,
): string[] {
  const warnings: string[] = [];
  const a = analyzeMesh(mesh);

  if (a.triangles < 4) {
    throw new Error(
      `${fileName} 三角面过少（${a.triangles}），该颜色分区可能无遮挡区域`,
    );
  }

  if (a.boundaryEdges > 0) {
    warnings.push(
      `${fileName} 含 ${a.boundaryEdges} 条开放边，切片前请目视检查`,
    );
  }

  if (a.nonManifoldEdges > 0) {
    warnings.push(
      `${fileName} 含 ${a.nonManifoldEdges} 条非流形边（同色多块独立区域属正常，一般可打印）`,
    );
  }

  if (a.degenerateTriangles > 0) {
    warnings.push(
      `${fileName} 含 ${a.degenerateTriangles} 个退化三角面，已忽略`,
    );
  }

  return warnings;
}
