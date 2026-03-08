import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cors from 'cors';
import { initDB } from '../src/database/database.js';

let app: express.Express;
let db: any;

describe('Express app', () => {
  beforeAll(async () => {
    db = await initDB();

    app = express();
    app.use(cors());
    app.use(express.json());

    // Middleware simulado para test
    app.use((req, res, next) => {
      (req as any).userId = '123';
      (req as any).username = 'testuser';
      next();
    });

    // Endpoint de prueba
    app.get('/test', (req, res) => {
      res.json({ userId: (req as any).userId, username: (req as any).username });
    });
  });

  afterAll(async () => {
    if (db) await db.close();
  });

  it('should respond with user info', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: '123', username: 'testuser' });
  });
});