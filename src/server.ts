import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();
const visitorCountFile = resolve(process.cwd(), 'visitor-count.json');

const readVisitorCount = async (): Promise<number> => {
  try {
    const data = await fs.readFile(visitorCountFile, 'utf8');
    const parsed = JSON.parse(data);
    return typeof parsed.count === 'number' && parsed.count >= 0 ? parsed.count : 0;
  } catch {
    return 0;
  }
};

const writeVisitorCount = async (count: number): Promise<void> => {
  await fs.writeFile(visitorCountFile, JSON.stringify({ count }, null, 2), 'utf8');
};

app.use(express.json());

app.get('/api/visitors', async (req, res) => {
  try {
    let count = await readVisitorCount();
    count += 1;
    await writeVisitorCount(count);

    return res.json({ visitors: count });
  } catch (error) {
    console.error('Visitor API error:', error);
    return res.status(500).json({ error: 'Unable to retrieve visitor count' });
  }
});

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/**', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use('/**', (req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
