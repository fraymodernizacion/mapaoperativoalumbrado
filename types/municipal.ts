export type TechnologyGroup =
  | 'led'
  | 'sodio'
  | 'bajo_consumo'
  | 'gabinete'
  | 'otros';

export type CoordinateStatus = 'ok' | 'invalid' | 'missing';

export interface LightingFieldChange {
  before: string | number | null;
  after: string | number | null;
}

export interface LightingChangeHistoryEntry {
  timestamp: string;
  changes: {
    technology?: LightingFieldChange;
    powerW?: LightingFieldChange;
    encendido?: LightingFieldChange;
  };
}

export interface LightingRecord {
  recordId: string;
  source?: 'excel' | 'manual';
  createdAt?: string;
  updatedAt?: string;
  point: string;
  position: string;
  technology: string;
  technologyGroup: TechnologyGroup;
  powerW: number | null;
  encendido: string;
  observations: string;
  quantity: number;
  supply: string;
  address: string;
  locality: string;
  lat: number | null;
  lng: number | null;
  coordinateStatus: CoordinateStatus;
  isLuminaire: boolean;
  isLed: boolean;
  powerTotalW: number;
  sectorKey: string;
  sectorLabel: string;
  qualityFlags: string[];
  history: LightingChangeHistoryEntry[];
}

export interface MeterRecord {
  user: string;
  holder: string;
  serviceHolder: string;
  address: string;
  consumptionType: string;
  userType: string;
  connectionType: string;
  meter: string;
  pointGeo: string;
  lat: number | null;
  lng: number | null;
  coordinateStatus: CoordinateStatus;
  qualityFlags: string[];
  nearbyLightingCount: number;
  nearbyLightingPoints: string[];
}

export interface SectorSummary {
  key: string;
  label: string;
  count: number;
  ledCount: number;
  ledPercentage: number;
  powerTotalW: number;
}

export interface LocalitySummary {
  name: string;
  count: number;
  ledCount: number;
  ledPercentage: number;
  powerTotalW: number;
}

export interface LightingDataset {
  updatedAt: string;
  records: LightingRecord[];
  sectors: SectorSummary[];
  localities: LocalitySummary[];
  options: {
    localities: string[];
    technologies: string[];
    encendidos: string[];
    sectors: string[];
    powerValues: string[];
  };
  metrics: {
    totalPoints: number;
    comparablePoints: number;
    totalLuminaries: number;
    ledPoints: number;
    ledLuminaries: number;
    totalPowerW: number;
    ledPowerW: number;
    nonLedPowerW: number;
    ledSharePoints: number;
    ledShareLuminaries: number;
    ledSharePower: number;
    noCoordinate: number;
    noPower: number;
    noLocality: number;
    noSupply: number;
    duplicates: number;
  };
}

export interface MeterDataset {
  updatedAt: string;
  records: MeterRecord[];
  metrics: {
    totalMeters: number;
    georeferencedMeters: number;
    noCoordinate: number;
    linkedMeters: number;
    orphanMeters: number;
  };
  options: {
    consumptionTypes: string[];
    userTypes: string[];
    connectionTypes: string[];
    holders: string[];
  };
}

export interface DashboardDataset {
  updatedAt: string;
  lighting: LightingDataset;
  meters: MeterDataset;
}
