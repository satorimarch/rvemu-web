#!/usr/bin/env node
import { readdir, writeFile, mkdir } from "fs/promises";
import { join } from "path";

const TEST_PROGRAMS_DIR = "public/test-programs";
const MANIFEST_FILE = join(TEST_PROGRAMS_DIR, "manifest.json");

async function generateManifest() {
  try {
    // Ensure directory exists
    await mkdir(TEST_PROGRAMS_DIR, { recursive: true });

    // Read ELF files
    const files = await readdir(TEST_PROGRAMS_DIR);
    const elfFiles = files.filter(f => f.endsWith(".elf")).sort();
    
    const programs = elfFiles.map(file => ({
      id: file.replace(".elf", ""),
      file: file
    }));
    
    const manifest = { programs };
    await writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
    
    console.log(`Generated manifest with ${programs.length} programs:`);
    programs.forEach(p => console.log(`  - ${p.id}`));
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
