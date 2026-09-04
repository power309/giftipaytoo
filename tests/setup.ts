import { config } from 'dotenv';

config({ path: '.env' });

// Tests import server modules directly, outside a Next.js build.
if (!process.env.NODE_ENV) {
  Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', configurable: true });
}
