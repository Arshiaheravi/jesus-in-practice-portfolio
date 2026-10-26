import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import { createDatabase } from "../src/database.ts";
import { ContentRepository } from "../src/content-repository.ts";
import {
  ContentError,
  editionManifestSchema,
  rightsDecisionSchema,
} from "../src/content-contracts.ts";
import { MAX_CORPUS_BYTES, validateCorpus, inventoryCounts } from "../src/content-corpus.ts";

export async function readBoundedFile(path, maximum) {
  if (!path) throw new ContentError("FILE_REQUIRED", "Supply the required local file path.");
  const handle = await open(resolve(path), "r");
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size < 1 || stats.size > maximum)
      throw new ContentError(
        "FILE_SIZE",
        "The input must be a nonempty regular file within the size limit.",
      );
    const buffer = Buffer.alloc(Math.min(stats.size + 1, maximum + 1));
    let used = 0;
    while (used < buffer.length) {
      const { bytesRead } = await handle.read(buffer, used, buffer.length - used, null);
      if (!bytesRead) break;
      used += bytesRead;
    }
    if (used > maximum || used > stats.size)
      throw new ContentError(
        "FILE_SIZE",
        "The input changed size or exceeded its limit while reading.",
      );
    return buffer.subarray(0, used);
  } finally {
    await handle.close();
  }
}
async function jsonFile(path, maximum = 262144) {
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(await readBoundedFile(path, maximum)),
    );
  } catch (error) {
    if (error instanceof ContentError) throw error;
    throw new ContentError("FILE_INVALID", "The file must contain readable UTF-8 JSON.");
  }
}
export async function runContentCommand(args, env = process.env) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      file: { type: "string" },
      manifest: { type: "string" },
      edition: { type: "string" },
      actor: { type: "string" },
      apply: { type: "boolean", default: false },
    },
  });
  const [command] = positionals;
  if (
    positionals.length !== 1 ||
    !["validate", "register", "rights", "import", "coverage"].includes(command)
  )
    throw new ContentError(
      "USAGE",
      "Use validate/register/rights/import/coverage. Mutations are dry runs unless --apply is supplied.",
    );
  let manifest, decision, bytes;
  if (command === "validate" || command === "import") {
    manifest = editionManifestSchema.parse(await jsonFile(values.manifest));
    bytes = await readBoundedFile(values.file, MAX_CORPUS_BYTES);
    validateCorpus(manifest, bytes);
    if (command === "validate")
      return {
        dryRun: true,
        validated: true,
        editionId: manifest.id,
        ...inventoryCounts(manifest),
        notice:
          "Inventory matches the supplied manifest; this does not establish rights or independently verify its verse counts.",
      };
  }
  if (command === "register") manifest = editionManifestSchema.parse(await jsonFile(values.file));
  if (command === "rights") decision = rightsDecisionSchema.parse(await jsonFile(values.file));
  const editionId = values.edition ?? manifest?.id;
  if (!editionId || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(editionId))
    throw new ContentError("EDITION_REQUIRED", "Supply a valid edition ID.");
  if (manifest && editionId !== manifest.id)
    throw new ContentError("EDITION_MISMATCH", "The requested edition differs from the manifest.");
  if (command !== "coverage" && !values.apply)
    return {
      dryRun: true,
      command,
      editionId,
      notice:
        "Validated local input only. No database, source rights or provider changes were made. Review the intended database, actor and approval before --apply.",
    };
  const actor = z.uuid().parse(values.actor);
  if (!env.DATABASE_URL)
    throw new ContentError(
      "DATABASE_REQUIRED",
      "Supply DATABASE_URL in the secure process environment.",
    );
  const database = createDatabase(env.DATABASE_URL, {
    max: 1,
    ssl: { rejectUnauthorized: true, ca: env.DATABASE_CA_CERT },
  });
  const repo = new ContentRepository(database, {
    rightsEnabled: env.CONTENT_RIGHTS_ENABLED === "true",
  });
  try {
    if (command === "register") {
      await repo.registerEdition(manifest, actor);
      return { applied: true, command, editionId };
    }
    if (command === "rights") {
      await repo.setEditionRights(editionId, decision, actor);
      return { applied: true, command, editionId, approved: decision.approved };
    }
    if (command === "import")
      return {
        applied: true,
        command,
        editionId,
        ...(await repo.importCorpus(editionId, bytes, actor)),
      };
    // Require the same current operator role as the editorial UI even for this CLI read.
    await repo.listEditions(actor, { limit: 1 });
    return repo.coverage(editionId);
  } finally {
    await database.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(await runContentCommand(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(
      error instanceof ContentError
        ? `${error.code}: ${error.message}`
        : "Content operation failed. Check the input, current operator role, configuration and migration state. Credentials, file contents and raw database errors are omitted.",
    );
    process.exitCode = 1;
  }
}
