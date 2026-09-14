import { FALLBACK_LATLNG, DEFAULT_RADIUS } from './constants.js';

// Shared mutable app state. Kept as one plain object (not individual module
// exports) because `let` bindings exported from ES modules can be imported
// but not reassigned from outside the owning module — mutating properties on
// a shared object sidesteps that without needing a class for what's really
// just a handful of cross-module variables.
export const state = {
  map: null,
  AdvancedMarkerElementCtor: null,
  userMarker: null,
  currentMapStyle: 'light', // 'light' | 'satellite' | 'dark'
  markersById: new Map(),
  restaurants: [],
  userLatLng: FALLBACK_LATLNG,
  spinning: false,
  selected: null,
  selectedMethod: 'self',
  tempDisliked: new Set(),
  tempRadius: DEFAULT_RADIUS,
  tempOpenNowOnly: false,
  routeLayer: null,
  navigating: false,
  watchId: null,
};
