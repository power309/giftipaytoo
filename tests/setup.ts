import { config } from 'dotenv';
config({ path: '.env' });

// `server-only` throws when imported outside a React Server Component build.
// Tests import server modules directly, so stub it out.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
