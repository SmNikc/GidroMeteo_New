import { mkdir, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import * as http from 'http';
import * as https from 'https';

export interface DownloadConfig {
  urls: string[];
  outputDir?: string;
}

export async function downloadImages(config: DownloadConfig): Promise<void> {
  const outputDir = config.outputDir || 'images';
  await mkdir(outputDir, { recursive: true });

  await Promise.all(
    config.urls.map((url) => {
      const lib = url.startsWith('https') ? https : http;
      return new Promise<void>((resolve, reject) => {
        lib
          .get(url, (res) => {
            if (res.statusCode !== 200) {
              reject(
                new Error(`Failed to download ${url}: ${res.statusCode}`)
              );
              res.resume();
              return;
            }

            const chunks: Buffer[] = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', async () => {
              try {
                const filePath = join(outputDir, basename(url));
                await writeFile(filePath, Buffer.concat(chunks));
                resolve();
              } catch (e) {
                reject(e);
              }
            });
          })
          .on('error', reject);
      });
    })
  );
}