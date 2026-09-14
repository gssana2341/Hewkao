import { DEFAULT_RADIUS } from './constants.js';

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
  userLatLng: null, // [lat, lng], always set from geolocation before the app opens
  spinning: false,
  selected: null,
  selectedMethod: 'self',
  recentPickIds: [], // newest first; the next spin skips these when it can
  tempDisliked: new Set(),
  tempRadius: DEFAULT_RADIUS,
  tempOpenNowOnly: false,
  // Navigation Mode
  navigating: false,
  navRoute: null,       // current OSRM route object
  navDestination: null,  // restaurant being navigated to
  navWatchId: null,      // geolocation watchPosition id
};
