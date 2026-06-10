import 'reflect-metadata';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'unit-jwt-secret-at-least-8-chars';
process.env.FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:4200';
process.env.BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3000';
