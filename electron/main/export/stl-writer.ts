import { writeFile } from "fs/promises";
import type { TerrainMeshPayload } from "@shared/types/terrain";

const HEADER_BYTES = 80;
const TRIANGLE_RECORD_BYTES = 50;

/**
 * 将索引三角网格写出为二进制 STL（单位 mm，小端 float32）。
 */
export async function writeBinaryStl(
  filePath: string,
  mesh: TerrainMeshPayload,
  solidName = "mesh",
): Promise<void> {
  const triangleCount = mesh.indices.length / 3;
  if (triangleCount < 1 || mesh.indices.length % 3 !== 0) {
    throw new Error("网格无有效三角面，无法导出 STL");
  }

  const buffer = Buffer.alloc(HEADER_BYTES + 4 + triangleCount * TRIANGLE_RECORD_BYTES);
  const header = Buffer.alloc(HEADER_BYTES, 0);
  header.write(`TrailPrint ${solidName}`.slice(0, 79), 0, "ascii");
  header.copy(buffer, 0);

  buffer.writeUInt32LE(triangleCount, HEADER_BYTES);

  const pos = mesh.positions;
  let offset = HEADER_BYTES + 4;

  for (let t = 0; t < triangleCount; t++) {
    const i0 = mesh.indices[t * 3]!;
    const i1 = mesh.indices[t * 3 + 1]!;
    const i2 = mesh.indices[t * 3 + 2]!;

    const ax = pos[i0 * 3]!;
    const ay = pos[i0 * 3 + 1]!;
    const az = pos[i0 * 3 + 2]!;
    const bx = pos[i1 * 3]!;
    const by = pos[i1 * 3 + 1]!;
    const bz = pos[i1 * 3 + 2]!;
    const cx = pos[i2 * 3]!;
    const cy = pos[i2 * 3 + 1]!;
    const cz = pos[i2 * 3 + 2]!;

    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nlen = Math.hypot(nx, ny, nz) || 1;
    nx /= nlen;
    ny /= nlen;
    nz /= nlen;

    buffer.writeFloatLE(nx, offset);
    buffer.writeFloatLE(ny, offset + 4);
    buffer.writeFloatLE(nz, offset + 8);
    offset += 12;

    buffer.writeFloatLE(ax, offset);
    buffer.writeFloatLE(ay, offset + 4);
    buffer.writeFloatLE(az, offset + 8);
    offset += 12;
    buffer.writeFloatLE(bx, offset);
    buffer.writeFloatLE(by, offset + 4);
    buffer.writeFloatLE(bz, offset + 8);
    offset += 12;
    buffer.writeFloatLE(cx, offset);
    buffer.writeFloatLE(cy, offset + 4);
    buffer.writeFloatLE(cz, offset + 8);
    offset += 12;

    buffer.writeUInt16LE(0, offset);
    offset += 2;
  }

  await writeFile(filePath, buffer);
}
