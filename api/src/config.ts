import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://bloominder:change-me@localhost:5432/bloominder',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
};
