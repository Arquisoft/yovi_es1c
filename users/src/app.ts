import express from "express";
import cors from "cors";
import { initDB } from "./database/database.js";

const app = express();

// Disable X-Powered-By header to avoid disclosing framework version
app.disable("x-powered-by");

// Restrict CORS to known origins
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

export default app;

