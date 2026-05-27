import { buildServer } from './app';

const port = Number.parseInt(process.env.PORT ?? '8787', 10);
const host = process.env.HOST ?? '0.0.0.0';
const dbPath = process.env.V3L0CITY_SERVER_DB ?? 'server/data/v3l0city.sqlite';

const main = async () => {
  const { app } = await buildServer({ dbPath, logger: true });
  await app.listen({ port, host });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
