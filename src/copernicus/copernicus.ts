import * as http from 'http';
import * as https from 'https';

export interface CurrentsConfig {
  url: string;
}

export async function fetchCurrents(config: CurrentsConfig): Promise<any> {
  return new Promise((resolve, reject) => {
    const lib = config.url.startsWith('https') ? https : http;
    lib
      .get(config.url, (res) => {
        if (res.statusCode !== 200) {
          reject(
            new Error(`Failed to fetch currents: ${res.statusCode}`)
          );
          res.resume();
          return;
        }

        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}