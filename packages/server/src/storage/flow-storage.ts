import fs from 'fs';
import path from 'path';
import os from 'os';

export interface FlowMeta {
  id: string;
  name: string;
  commandCount: number;
  createdAt: number;
  updatedAt: number;
}

const FLOWS_DIR = path.join(os.homedir(), '.manualflow', 'flows');
const META_FILE = path.join(FLOWS_DIR, 'meta.json');

function ensureDir(): void {
  if (!fs.existsSync(FLOWS_DIR)) {
    fs.mkdirSync(FLOWS_DIR, { recursive: true });
  }
}

function readMeta(): FlowMeta[] {
  ensureDir();
  if (!fs.existsSync(META_FILE)) return [];
  return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
}

function writeMeta(meta: FlowMeta[]): void {
  ensureDir();
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function makeId(name: string): string {
  const slug = slugify(name) || 'flow';
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slug}-${suffix}`;
}

function countCommands(yaml: string): number {
  return (yaml.match(/^- /gm) || []).length;
}

export class FlowStorage {
  list(): FlowMeta[] {
    return readMeta().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): { meta: FlowMeta; yaml: string } | null {
    const meta = readMeta().find(m => m.id === id);
    if (!meta) return null;
    const yamlPath = path.join(FLOWS_DIR, `${id}.yaml`);
    if (!fs.existsSync(yamlPath)) return null;
    return { meta, yaml: fs.readFileSync(yamlPath, 'utf-8') };
  }

  save(name: string, yaml: string): FlowMeta {
    const id = makeId(name);
    const now = Date.now();
    const meta: FlowMeta = {
      id,
      name,
      commandCount: countCommands(yaml),
      createdAt: now,
      updatedAt: now,
    };

    ensureDir();
    fs.writeFileSync(path.join(FLOWS_DIR, `${id}.yaml`), yaml);

    const all = readMeta();
    all.push(meta);
    writeMeta(all);

    return meta;
  }

  update(id: string, patch: { name?: string; yaml?: string }): FlowMeta | null {
    const all = readMeta();
    const idx = all.findIndex(m => m.id === id);
    if (idx === -1) return null;

    if (patch.name) all[idx].name = patch.name;
    if (patch.yaml) {
      all[idx].commandCount = countCommands(patch.yaml);
      fs.writeFileSync(path.join(FLOWS_DIR, `${id}.yaml`), patch.yaml);
    }
    all[idx].updatedAt = Date.now();
    writeMeta(all);

    return all[idx];
  }

  delete(id: string): boolean {
    const all = readMeta();
    const filtered = all.filter(m => m.id !== id);
    if (filtered.length === all.length) return false;
    writeMeta(filtered);

    const yamlPath = path.join(FLOWS_DIR, `${id}.yaml`);
    if (fs.existsSync(yamlPath)) fs.unlinkSync(yamlPath);
    return true;
  }

  duplicate(id: string, newName: string): FlowMeta | null {
    const flow = this.get(id);
    if (!flow) return null;
    return this.save(newName, flow.yaml);
  }

  /** Get absolute path to YAML file (for maestro test) */
  getYamlPath(id: string): string | null {
    const p = path.join(FLOWS_DIR, `${id}.yaml`);
    return fs.existsSync(p) ? p : null;
  }
}
