import { downloadImages } from '../src/imagery/imagery';
import { fetchCurrents } from '../src/copernicus/copernicus';
import * as fs from 'fs/promises';
import * as http from 'http';
import * as path from 'path';
import * as os from 'os';

describe('downloadImages', () => {
  test('downloads a file from a URL', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('image-data');
    });
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const port = (server.address() as any).port;
    const url = `http://localhost:${port}/image.txt`;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'img-'));
    await downloadImages({ urls: [url], outputDir: tmpDir });
    const content = await fs.readFile(path.join(tmpDir, 'image.txt'), 'utf-8');
    expect(content).toBe('image-data');
    server.close();
  });
});

describe('fetchCurrents', () => {
  test('fetches JSON data from a URL', async () => {
    const data = { currents: 'ok' };
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    });
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const port = (server.address() as any).port;
    const url = `http://localhost:${port}/currents`;
    const result = await fetchCurrents({ url });
    expect(result).toEqual(data);
    server.close();
  });
});
