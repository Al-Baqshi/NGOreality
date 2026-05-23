const STORAGE_KEY = 'ngoreality-outreach-batches';

export type OutreachBatch = {
  id: string;
  name: string;
  organizationIds: string[];
  createdAt: string;
};

function readAll(): OutreachBatch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OutreachBatch[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(batches: OutreachBatch[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(batches));
}

export function listOutreachBatches(): OutreachBatch[] {
  return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveOutreachBatch(name: string, organizationIds: string[]): OutreachBatch {
  const batch: OutreachBatch = {
    id: crypto.randomUUID(),
    name: name.trim() || `Batch ${new Date().toLocaleString()}`,
    organizationIds: [...new Set(organizationIds)],
    createdAt: new Date().toISOString(),
  };
  writeAll([batch, ...readAll()]);
  return batch;
}

export function deleteOutreachBatch(id: string) {
  writeAll(readAll().filter((b) => b.id !== id));
}
