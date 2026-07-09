/// <reference path="../../worker-configuration.d.ts" />
import type { H3Event } from 'h3'

// nitro-cloudflare-dev types `context.cloudflare.env` as PlatformProxy["env"] (unknown) since it
// isn't parameterized with our Env — cast through the generated global Env from worker-configuration.d.ts.
export function getDb(event: H3Event): D1Database {
  return (event.context.cloudflare.env as unknown as Env).DB
}

export function getLabsBucket(event: H3Event): R2Bucket {
  return (event.context.cloudflare.env as unknown as Env).LABS_BUCKET
}

// R2 objects are private; every source key is served through the authenticated proxy route.
export function toPdfUrl(key: string): string {
  return `/api/labs/pdf/${encodeURIComponent(key)}`
}

export function parseJournalRow(row: Record<string, unknown>) {
  return {
    date: row.date as string,
    day: (row.day as number | null) ?? null,
    weight_lbs: (row.weight_lbs as number | null) ?? null,
    bp_systolic: (row.bp_systolic as number | null) ?? null,
    bp_diastolic: (row.bp_diastolic as number | null) ?? null,
    rhr: (row.rhr as number | null) ?? null,
    hrv: (row.hrv as number | null) ?? null,
    peptides: JSON.parse((row.peptides as string) || '[]'),
    reconstitutions: JSON.parse((row.reconstitutions as string) || '[]'),
    food: JSON.parse((row.food as string) || '{}'),
    workout: (row.workout as string | null) ?? '',
    notes: (row.notes as string | null) ?? ''
  }
}

export function parseLabsRow(row: Record<string, unknown>) {
  return {
    date: row.date as string,
    fasting: !!row.fasting,
    sources: (JSON.parse((row.sources as string) || '[]') as string[]).map(toPdfUrl),
    markers: JSON.parse((row.markers as string) || '{}')
  }
}

export function parseDexaRow(row: Record<string, unknown>) {
  return {
    date: row.date as string,
    weight_lbs: row.weight_lbs as number,
    sources: (JSON.parse((row.sources as string) || '[]') as string[]).map(toPdfUrl),
    total: JSON.parse(row.total as string),
    regions: JSON.parse(row.regions as string),
    vat: row.vat ? JSON.parse(row.vat as string) : undefined,
    ag_ratio: (row.ag_ratio as number | null) ?? undefined,
    bone_density: row.bone_density ? JSON.parse(row.bone_density as string) : undefined,
    symmetry: row.symmetry ? JSON.parse(row.symmetry as string) : undefined
  }
}
