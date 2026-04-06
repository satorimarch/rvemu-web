#!/usr/bin/env node
import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

const TEST_PROGRAMS_DIR = "public/test-programs";
const MANIFEST_FILE = join(TEST_PROGRAMS_DIR, "manifest.json");
const BUILTIN_PROGRAMS_CONFIG_FILE = "scripts/builtin-programs.config.json";

function parseCsvList(value) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function readBuiltinProgramsConfig() {
  try {
    const raw = await readFile(BUILTIN_PROGRAMS_CONFIG_FILE, "utf8");
    const json = JSON.parse(raw);
    const include = Array.isArray(json.include) ? json.include.map(String) : [];
    const exclude = Array.isArray(json.exclude) ? json.exclude.map(String) : [];
    return { include, exclude };
  } catch {
    return { include: [], exclude: [] };
  }
}

async function generateManifest() {
  try {
    // Ensure directory exists
    await mkdir(TEST_PROGRAMS_DIR, { recursive: true });

    // Read ELF files
    const files = await readdir(TEST_PROGRAMS_DIR);
    const elfFiles = files.filter(f => f.endsWith(".elf")).sort();
    
    const config = await readBuiltinProgramsConfig();
    const includeEnv = parseCsvList(process.env.BUILTIN_PROGRAMS_INCLUDE);
    const excludeEnv = parseCsvList(process.env.BUILTIN_PROGRAMS_EXCLUDE);

    const includeSet = new Set([...config.include, ...includeEnv]);
    const excludeSet = new Set([...config.exclude, ...excludeEnv]);

    const programs = elfFiles
      .map((file) => ({
        id: file.replace(".elf", ""),
        file
      }))
      .filter((program) => {
        if (includeSet.size > 0 && !includeSet.has(program.id)) {
          return false;
        }
        if (excludeSet.has(program.id)) {
          return false;
        }
        return true;
      });
    
    const manifest = { programs };
    await writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
    
    console.log(`Generated manifest with ${programs.length} programs:`);
    programs.forEach(p => console.log(`  - ${p.id}`));

    if (excludeSet.size > 0) {
      console.log(`Excluded programs: ${Array.from(excludeSet).sort().join(", ")}`);
    }
  } catch (error) {
    // If directory doesn't exist or other error, create empty manifest
    console.log("No test programs found, creating empty manifest");
    await mkdir(TEST_PROGRAMS_DIR, { recursive: true });
    const manifest = { programs: [] };
    await writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  }
}

generateManifest().catch(error => {
  console.error("Error generating manifest:", error);
  process.exit(1);
});
