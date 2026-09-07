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
  /**
   * Wikidata-ID des Ortes. Die von v004 ergaenzten Emittenten tragen einen
   * Ortsnamen ohne ID — fuer die laesst sich keine Quelle nennen.
   */
  id?: string;
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

/**
 * Eine Partei aus dem Marktdatensatz v004. Anders als der Boersen-Snapshot
 * fuehrt sie den Ort im Klartext mit und sagt selbst, aus welchem
 * Wikidata-Eintrag die Koordinate stammt — auch dann, wenn die Partei
 * (`fermacell`, `surventis`) gar keine eigene Wikidata-Entitaet hat.
 */
interface MarketEntity extends AcquisitionEntity {
  place: string;
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
  // Der Marktdatensatz v004 kennt 10.207 Unternehmen statt 9.868 und fuehrt zu
  // jeder Deal-Partei einen belegten Standort — auch fuer die, die im
  // Boersen-Snapshot fehlen.
  const market = JSON.parse(readFileSync(`${SITE}/market-data.json`, 'utf8')) as {
    entities: Record<string, MarketEntity>;
    companies: SnapshotCompany[];
  };

  const byId = new Map<string, GeoPoint>();
  const rememberCompany = (company: SnapshotCompany): void => {
    // Ohne Wikidata-ID des Ortes gibt es keine zitierbare Quelle — dann lieber
    // keine Koordinate als eine ohne Herkunft (Regel 14).
    const location = company.location;
    if (location === null || location === undefined || location.id === undefined) return;
    if (byId.has(company.id)) return;
    byId.set(company.id, {
      latitude: location.lat,
      longitude: location.lon,
      accuracy: location.accuracy,
      source_url: wikidataUrl(location.id),
    });
  };

  for (const company of snapshot.companies) rememberCompany(company);
  // Die Parteien des Marktdatensatzes stehen vor dessen uebrigen Unternehmen:
  // nur sie nennen ihre Koordinatenquelle selbst.
  for (const entity of Object.values(market.entities)) {
    if (!byId.has(entity.id)) {
      byId.set(entity.id, {
        latitude: entity.lat,
        longitude: entity.lon,
        accuracy: entity.accuracy,
        source_url: entity.coordinateSourceUrl,
      });
    }
  }
  for (const company of market.companies) rememberCompany(company);
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
  // Die Parteien des Marktdatensatzes zuerst: sie nennen den Ort im Klartext
  // und ihre eigene Koordinatenquelle. Nur Ortsmittelpunkte — ein
  // Firmengebaeude ist kein Stadtmittelpunkt.
  for (const entity of Object.values(market.entities)) {
    if (entity.accuracy !== 'locality') continue;
    const key = entity.place.toLocaleLowerCase('de-DE');
    if (!byCityName.has(key)) {
      byCityName.set(key, {
        latitude: entity.lat,
        longitude: entity.lon,
        accuracy: 'locality',
        source_url: entity.coordinateSourceUrl,
      });
    }
  }
  for (const company of [...snapshot.companies, ...market.companies]) {
    for (const location of company.locations ?? []) {
      // Nur Ortsmittelpunkte: ein Firmengebaeude ist kein Stadtmittelpunkt.
      if (location.accuracy !== 'locality') continue;
      if (location.id === undefined) continue;
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
