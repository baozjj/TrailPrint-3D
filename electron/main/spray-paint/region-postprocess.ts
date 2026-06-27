export function smoothRegionsMajority(
  regions: Uint8Array,
  cols: number,
  rows: number,
): void {
  const out = new Uint8Array(regions.length);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const counts = new Map<number, number>();
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = row + dr;
          const c = col + dc;
          if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
          const id = regions[r * cols + c]!;
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
      let bestId = regions[row * cols + col]!;
      let bestCount = 0;
      for (const [id, count] of counts) {
        if (count > bestCount) {
          bestCount = count;
          bestId = id;
        }
      }
      out[row * cols + col] = bestId;
    }
  }
  regions.set(out);
}

export function mergeSmallIslands(
  regions: Uint8Array,
  cols: number,
  rows: number,
  minFraction = 0.005,
): void {
  const total = cols * rows;
  const minCells = Math.max(4, Math.floor(total * minFraction));
  const visited = new Uint8Array(total);

  for (let start = 0; start < total; start++) {
    if (visited[start]) continue;
    const regionId = regions[start]!;
    const stack = [start];
    const component: number[] = [];
    visited[start] = 1;

    while (stack.length > 0) {
      const idx = stack.pop()!;
      component.push(idx);
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const neighbors = [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
      ];
      for (const [nr, nc] of neighbors) {
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const ni = nr * cols + nc;
        if (visited[ni] || regions[ni] !== regionId) continue;
        visited[ni] = 1;
        stack.push(ni);
      }
    }

    if (component.length >= minCells) continue;

    const borderCounts = new Map<number, number>();
    for (const idx of component) {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const neighbors = [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
      ];
      for (const [nr, nc] of neighbors) {
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const ni = nr * cols + nc;
        const nid = regions[ni]!;
        if (nid !== regionId) {
          borderCounts.set(nid, (borderCounts.get(nid) ?? 0) + 1);
        }
      }
    }

    let mergeTo = regionId;
    let mergeCount = 0;
    for (const [id, count] of borderCounts) {
      if (count > mergeCount) {
        mergeCount = count;
        mergeTo = id;
      }
    }

    for (const idx of component) {
      regions[idx] = mergeTo;
    }
  }
}

export function postprocessRegions(
  regions: Uint8Array,
  cols: number,
  rows: number,
): void {
  smoothRegionsMajority(regions, cols, rows);
  mergeSmallIslands(regions, cols, rows);
  smoothRegionsMajority(regions, cols, rows);
}
