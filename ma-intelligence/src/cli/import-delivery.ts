/**
 * Importiert eine recherchierte Lieferung in die gepruefte Datenbank.
 *
 *   pnpm import <lieferung.json> [--out <datenbank.json>]
 *
 * Koordinaten kommen ausschliesslich aus dem vorhandenen Marktatlas-Bestand:
 * ueber die Wikidata-ID des Unternehmens oder — wenn es dafuer keinen Eintrag
 * gibt — ueber einen belegten Ortsmittelpunkt derselben Stadt. Findet sich
 * beides nicht, bleibt der Standort leer. Es wird nie eine Koordinate erfunden.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { deliverySchema, importDelivery } from '../ingest/delivery.js';
import type { CoordinateLookup, GeoPoint } from '../ingest/delivery.js';
import { saveDatabase } from '../store/database.js';
import { checkIntegrity } from '../store/integrity.js';

const SITE = resolve(process.cwd(), 'site/dist/assets');
const DEFAULT_OUT = resolve(process.cwd(), 'data/intelligence/verified/deutschland-ma.json');

interface SnapshotLocation {
  name: string;
  id: string;
  lat: number;
  lon: number;
  accuracy: 'headquarters' | 'locality';
}

interface SnapshotCompany {
  id: string;
  name: string;
  location: SnapshotLocation;
  locations: SnapshotLocation[];
}

interface AcquisitionEntity {
  id: string;
  lat: number;
  lon: number;
  accuracy: 'headquarters' | 'locality';
  coordinateSourceUrl: string;
}

function wikidataUrl(id: string): string {
  return `https://www.wikidata.org/wiki/${id}`;
}

/**
 * Baut die Standortsuche aus den beiden Datensaetzen der bestehenden Website.
 * Beide sind quellenbelegt; die Herkunft jeder Koordinate wandert als
 * Wikidata-Link mit in den Datensatz.
 */
function buildLookup(): CoordinateLookup {
  const snapshot = JSON.parse(readFileSync(`${SITE}/companies.json`, 'utf8')) as {
    companies: SnapshotCompany[];
  };
  const acquisitions = JSON.parse(readFileSync(`${SITE}/acquisitions.json`, 'utf8')) as {
    entities: Record<string, AcquisitionEntity>;
  };

  const byId = new Map<string, GeoPoint>();
  for (const company of snapshot.companies) {
    byId.set(company.id, {
      latitude: company.location.lat,
      longitude: company.location.lon,
      accuracy: company.location.accuracy,
      source_url: wikidataUrl(company.location.id),
    });
  }
  // Der Uebernahme-Datensatz kennt Unternehmen, die im Boersen-Snapshot fehlen.
  for (const entity of Object.values(acquisitions.entities)) {
    if (!byId.has(entity.id)) {
      byId.set(entity.id, {
        latitude: entity.lat,
        longitude: entity.lon,
        accuracy: entity.accuracy,
        source_url: entity.coordinateSourceUrl,
      });
    }
  }

  const byCityName = new Map<string, GeoPoint>();
  for (const company of snapshot.companies) {
    for (const location of company.locations) {
      // Nur Ortsmittelpunkte: ein Firmengebaeude ist kein Stadtmittelpunkt.
      if (location.accuracy !== 'locality') continue;
      const key = location.name.toLocaleLowerCase('de-DE');
      if (!byCityName.has(key)) {
        byCityName.set(key, {
          latitude: location.lat,
          longitude: location.lon,
          accuracy: 'locality',
          source_url: wikidataUrl(location.id),
        });
      }
    }
  }

  return {
    byWikidata: (id) => byId.get(id) ?? null,
    byCity: (name) => byCityName.get(name.toLocaleLowerCase('de-DE')) ?? null,
  };
}

function main(argv: readonly string[]): number {
  const input = argv[0];
  if (input === undefined) {
    process.stderr.write('Verwendung: pnpm import <lieferung.json> [--out <datenbank.json>]\n');
    return 1;
  }
  const outIndex = argv.indexOf('--out');
  const out = outIndex === -1 ? DEFAULT_OUT : (argv[outIndex + 1] ?? DEFAULT_OUT);

  const parsed = deliverySchema.safeParse(JSON.parse(readFileSync(input, 'utf8')));
  if (!parsed.success) {
    process.stderr.write(
      `Lieferung ist ungueltig:\n  ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('\n  ')}\n`,
    );
    return 1;
  }

  // Der Zeitstempel kommt aus der Lieferung, nicht aus der Wanduhr: derselbe
  // Import zweimal ausgefuehrt muss dieselbe Datei ergeben, sonst rauscht jeder
  // Git-Diff.
  const { database, unresolved } = importDelivery(parsed.data, buildLookup(), parsed.data.prepared_at);

  saveDatabase(out, database);

  const issues = checkIntegrity(database);
  const withCoordinates = database.companies.filter((company) => company.latitude !== null).length;

  process.stdout.write(
    [
      `Importiert: ${database.companies.length} Unternehmen (${withCoordinates} mit Standort), ` +
        `${database.deals.length} Deals, ${database.sources.length} Quellen, ${database.claims.length} Belege`,
      `Geschrieben: ${out}`,
      '',
    ].join('\n'),
  );

  for (const note of unresolved) process.stdout.write(`  offen: ${note}\n`);
  for (const issue of issues) process.stdout.write(`  ${issue.severity}: ${issue.record} — ${issue.message}\n`);

  return 0;
}

process.exit(main(process.argv.slice(2)));
