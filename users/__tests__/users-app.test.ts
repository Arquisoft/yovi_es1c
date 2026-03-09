import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import request from 'supertest';
import app from '../src/app.js';

describe('app.ts integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `app-integration-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    process.env.DB_DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    delete process.env.DB_DATA_DIR;
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Windows may still have the file locked, ignore cleanup error
      }
    }
  });

  it('should initialize express app with cors and json middleware', async () => {
    expect(app).toBeDefined();
    expect(typeof app).toBe('function');
  });

  it('should apply cors headers on requests', async () => {
    const response = await request(app)
      .get('/')
      .set('Origin', 'http://localhost:5173');

    expect(response.headers['access-control-allow-origin']).toBeDefined();
  });

  it('should parse json bodies', async () => {
    const response = await request(app)
      .post('/')
      .send({ test: true })
      .set('Content-Type', 'application/json');

    expect(response.status).not.toBe(500);
  });
});