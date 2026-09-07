/**
 * Kontrollierte Vokabulare.
 *
 * Jede Liste hier ist eine Filterachse in der Oberflaeche. Freitext waere
 * bequemer zu befuellen und unbrauchbar zum Filtern: "Chemie", "Chemieindustrie"
 * und "chemicals" sind drei Werte und eine Bedeutung.
 *
 * Erweitern ist erlaubt und billig — ein neuer Wert ist ein Eintrag plus ein
 * Label. Umbenennen ist teuer, weil es bestehende Datensaetze ungueltig macht.
 */

// ── Unternehmen ──────────────────────────────────────────────────────────────

/**
 * Was fuer ein Akteur der Knoten ist. Personen, Staaten und Stiftungen sind
 * ebenfalls Knoten im Eigentuemergraphen ("Bundesrepublik Deutschland" haelt
 * Anteile), deshalb hat der Graph genau einen Knotentyp mit diesem Feld statt
 * mehrerer Tabellen.
 */
export const ENTITY_TYPES = [
  'company',
  'person',
  'family_office',
  'foundation',
  'fund',
  'government',
  'unknown',
] as const;

/**
 * Woher eine Koordinate stammt. Uebernommen aus dem bestehenden Marktatlas:
 * die Genauigkeit eines Standorts ist eine eigene Aussage und darf nicht mit
 * der Belegqualitaet der Transaktion vermengt werden. `locality` heisst
 * Ortsmittelpunkt, `headquarters` heisst das Gebaeude selbst.
 */
export const COORDINATE_ACCURACIES = ['headquarters', 'locality', 'unknown'] as const;

export const COMPANY_STATUSES = [
  'active',
  'acquired',
  'merged',
  'insolvent',
  'liquidated',
  'dissolved',
  'unknown',
] as const;

export const INDUSTRIES = [
  'automotive',
  'chemicals',
  'pharma_healthcare',
  'industrial_manufacturing',
  'technology_software',
  'telecom_media',
  'energy_utilities',
  'mining_metals',
  'construction_real_estate',
  'consumer_retail',
  'food_beverage',
  'financial_services',
  'insurance',
  'transport_logistics',
  'business_services',
  'agriculture',
  'defense_aerospace',
  'other',
  'unknown',
] as const;

export const INDUSTRY_LABELS_DE: Readonly<Record<(typeof INDUSTRIES)[number], string>> = {
  automotive: 'Automobil & Zulieferer',
  chemicals: 'Chemie',
  pharma_healthcare: 'Pharma & Gesundheit',
  industrial_manufacturing: 'Maschinen- & Anlagenbau',
  technology_software: 'Technologie & Software',
  telecom_media: 'Telekommunikation & Medien',
  energy_utilities: 'Energie & Versorger',
  mining_metals: 'Bergbau & Metalle',
  construction_real_estate: 'Bau & Immobilien',
  consumer_retail: 'Konsum & Handel',
  food_beverage: 'Nahrungsmittel & Getraenke',
  financial_services: 'Finanzdienstleistungen',
  insurance: 'Versicherungen',
  transport_logistics: 'Transport & Logistik',
  business_services: 'Unternehmensdienstleistungen',
  agriculture: 'Landwirtschaft',
  defense_aerospace: 'Verteidigung & Luftfahrt',
  other: 'Sonstige',
  unknown: 'Unbekannt',
};

// ── Deals ────────────────────────────────────────────────────────────────────

/**
 * Der Status ist die wichtigste Unterscheidung des ganzen Systems. Ein Geruecht
 * darf nie aussehen wie ein Vollzug — weder in der Datenbank noch auf der Karte.
 * Die Reihenfolge ist der uebliche Lebenslauf eines Deals; `cancelled` kann von
 * jedem Punkt aus erreicht werden.
 */
export const DEAL_STATUSES = [
  'rumored',
  'sale_process',
  'announced',
  'signed',
  'regulatory_review',
  'completed',
  'cancelled',
] as const;

export const DEAL_STATUS_LABELS_DE: Readonly<Record<(typeof DEAL_STATUSES)[number], string>> = {
  rumored: 'Geruecht',
  sale_process: 'Verkaufsprozess',
  announced: 'Angekuendigt',
  signed: 'Unterzeichnet',
  regulatory_review: 'Kartellrechtliche Pruefung',
  completed: 'Vollzogen',
  cancelled: 'Abgebrochen',
};

/**
 * Statuswerte, bei denen noch nichts feststeht. Die Oberflaeche muss sie
 * visuell von den bestaetigten trennen (Doc `docs/research-rules.md`).
 */
export const UNCONFIRMED_DEAL_STATUSES = ['rumored', 'sale_process'] as const;

/**
 * Die wirtschaftliche Form der Transaktion. Ob sie rechtlich als Share- oder
 * Asset-Deal umgesetzt wird, ist eine eigene Achse (`TRANSACTION_STRUCTURES`) —
 * ein Carve-out kann beides sein, und beides in einen Wert zu pressen erzwingt
 * spaeter eine Migration.
 */
export const DEAL_TYPES = [
  'acquisition',
  'majority_stake',
  'minority_stake',
  'merger',
  'carve_out',
  'joint_venture',
  'management_buyout',
  'insolvency_sale',
  'unknown',
] as const;

/**
 * Die rechtliche Umsetzung. `mixed` deckt Transaktionen, die Anteile und
 * Vermoegensgegenstaende zugleich uebertragen.
 */
export const TRANSACTION_STRUCTURES = ['share_deal', 'asset_deal', 'merger', 'mixed', 'unknown'] as const;

/**
 * Die Seite, auf der eine Partei am Deal steht. Das Ziel ist keine Rolle,
 * sondern ein eigenes Feld — es gibt genau eines.
 */
export const DEAL_PARTY_ROLES = ['buyer', 'seller'] as const;

// ── Eigentum ─────────────────────────────────────────────────────────────────

export const OWNERSHIP_RELATIONSHIP_TYPES = [
  'parent',
  'subsidiary',
  'shareholder',
  'private_equity_owner',
  'government_owner',
  'foundation_owner',
  'joint_venture',
  /** Beteiligung an einem Standort statt an einer Gesellschaft. */
  'asset_owner',
  'unknown',
] as const;

// ── Assets ───────────────────────────────────────────────────────────────────

export const ASSET_TYPES = [
  'mine',
  'deposit',
  'refinery',
  'smelter',
  'processing_plant',
  'recycling_facility',
  'factory',
  'warehouse',
  'port_terminal',
  'other',
] as const;

export const ASSET_OPERATIONAL_STATUSES = [
  'operating',
  'construction',
  'development',
  'exploration',
  'care_and_maintenance',
  'closed',
  'unknown',
] as const;

// ── Rohstoffe ────────────────────────────────────────────────────────────────

/**
 * Haupt- oder Nebenprodukt eines Standorts. Kupfer als Hauptprodukt und Gold
 * als Beiprodukt derselben Mine sind zwei Zeilen, nicht zwei Assets.
 */
export const COMMODITY_ROLES = ['primary', 'byproduct', 'unknown'] as const;

export const COMMODITY_CATEGORIES = [
  'base_metal',
  'precious_metal',
  'battery_metal',
  'rare_earth',
  'critical_mineral',
  'industrial_mineral',
  'energy',
  'other',
] as const;

// ── Quellen ──────────────────────────────────────────────────────────────────

/**
 * Der Quellentyp bestimmt die Ausgangszuverlaessigkeit im Confidence-System.
 * Ein Handelsregisterauszug ist keine Nachricht, und eine Nachricht ist kein
 * Beleg fuer sich selbst.
 */
export const SOURCE_TYPES = [
  'regulatory_filing',
  'court_register',
  'company_primary',
  'press_release',
  'news_article',
  'database',
  'analyst_report',
  'industry_report',
  'other',
] as const;

// ── Ereignisse ───────────────────────────────────────────────────────────────

export const EVENT_TYPES = [
  'deal_rumor',
  'deal_announced',
  'deal_signed',
  'deal_completed',
  'deal_cancelled',
  'regulatory_decision',
  'ownership_change',
  'production_start',
  'production_halt',
  'expansion',
  'closure',
  'insolvency',
  'management_change',
  'other',
] as const;

// ── Belegstatus ──────────────────────────────────────────────────────────────

/**
 * Woher eine Aussage stammt. `FACT` ist belegt, `INFERENCE` aus Belegtem
 * gefolgert, `ASSUMPTION` plausibel, aber unbelegt, `UNKNOWN` offen. Die
 * Produktionsdatenbank soll `FACT` enthalten; alles andere ist markiert und
 * bleibt es.
 */
export const EVIDENCE_STATUSES = ['FACT', 'INFERENCE', 'ASSUMPTION', 'UNKNOWN'] as const;

/**
 * Worauf sich ein `Claim` beziehen kann — der Datensatz, dessen Aussage eine
 * Quelle belegt.
 */
export const CLAIM_SUBJECT_TYPES = ['company', 'deal', 'ownership', 'asset', 'event'] as const;
