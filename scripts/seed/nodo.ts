/**
 * CLI de la demo de NODO: `pnpm seed:nodo --confirmar` (local) o
 * `node seed-nodo.mjs --confirmar` dentro del contenedor.
 *
 * BORRA los contactos, conversaciones, catálogo, conocimiento y etapas de la
 * organización antes de cargar NODO. Respáldala primero.
 */
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { PG_CONNECTION_OPTIONS } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { seedNodo } from "@/server/seed/nodo";

function loadEnvVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const env = readFileSync(".env", "utf8");
    const line = env.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim();
  } catch {
    return undefined;
  }
}

if (!process.argv.includes("--confirmar")) {
  console.error(
    "[seed:nodo] Esto BORRA los datos de la organización. Respalda y vuelve a correr con --confirmar."
  );
  process.exit(1);
}

const url = loadEnvVar("DATABASE_URL");
if (!url) {
  console.error("[seed:nodo] DATABASE_URL no está definida");
  process.exit(1);
}

const sql = postgres(url, { max: 1, ...PG_CONNECTION_OPTIONS });
const db = drizzle(sql, { schema });

const org = (await db.select().from(schema.organization).limit(1))[0];
if (!org) {
  console.error("[seed:nodo] No hay organización: regístrate primero en la app.");
  await sql.end();
  process.exit(1);
}

const r = await seedNodo(db, org.id);
console.log(`[seed:nodo] NODO cargado: ${r.clientes} clientes, ${r.contenedores} contenedores.`);
await sql.end();
process.exit(0);
