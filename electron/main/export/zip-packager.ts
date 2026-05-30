import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { createRequire } from "node:module";
import { dirname } from "path";
import type archiver from "archiver";

const require = createRequire(import.meta.url);
const createArchiver = require("archiver") as typeof archiver;

export interface ZipEntry {
  /** ZIP 内文件名（含扩展名） */
  name: string;
  /** 磁盘上的源文件绝对路径 */
  filePath: string;
}

/**
 * 将多个文件打包为 ZIP（DEFLATE）。
 */
export async function packZip(
  outputPath: string,
  entries: ZipEntry[],
): Promise<void> {
  if (entries.length === 0) {
    throw new Error("ZIP 条目为空");
  }

  await mkdir(dirname(outputPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = createArchiver("zip", { zlib: { level: 6 } });

    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);
    for (const entry of entries) {
      archive.file(entry.filePath, { name: entry.name });
    }
    void archive.finalize();
  });
}
