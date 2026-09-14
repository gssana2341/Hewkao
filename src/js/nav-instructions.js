// Maps Google Routes API's `navigationInstruction.maneuver` enum to a
// direction-arrow icon. Unlike the OSRM version this replaced, the
// instruction *text* comes straight from Google already translated (the
// route is requested with languageCode: 'th' in routes-api.js) — so there's
// no Thai phrase table to maintain here, just the icon per maneuver.

const ARROW_STRAIGHT = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
const ARROW_LEFT = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>';
const ARROW_RIGHT = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>';
const ARROW_SLIGHT_LEFT = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 19L7 5"/><path d="M7 15V5h10"/></svg>';
const ARROW_SLIGHT_RIGHT = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 19l10-14"/><path d="M7 5h10v10"/></svg>';
const ARROW_SHARP_LEFT = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 5L7 15"/><path d="M17 15H7V5"/></svg>';
const ARROW_SHARP_RIGHT = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5l10 10"/><path d="M7 15h10V5"/></svg>';
const ARROW_UTURN = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21V9a5 5 0 0 1 10 0v1"/><path d="M15 6l4 4-4 4"/></svg>';
const ARROW_ROUNDABOUT = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="4"/><path d="M12 14v7"/><path d="M16 10h5"/></svg>';
const ICON_DEPART = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
const ICON_ARRIVE = '<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5c-1.4 0-2.5-1.1-2.5-2.5S10.6 6.5 12 6.5s2.5 1.1 2.5 2.5S13.4 11.5 12 11.5z"/></svg>';

// developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes#maneuver
const ICON_BY_MANEUVER = {
  TURN_LEFT: ARROW_LEFT,
  TURN_RIGHT: ARROW_RIGHT,
  TURN_SLIGHT_LEFT: ARROW_SLIGHT_LEFT,
  TURN_SLIGHT_RIGHT: ARROW_SLIGHT_RIGHT,
  TURN_SHARP_LEFT: ARROW_SHARP_LEFT,
  TURN_SHARP_RIGHT: ARROW_SHARP_RIGHT,
  UTURN_LEFT: ARROW_UTURN,
  UTURN_RIGHT: ARROW_UTURN,
  STRAIGHT: ARROW_STRAIGHT,
  NAME_CHANGE: ARROW_STRAIGHT,
  RAMP_LEFT: ARROW_SLIGHT_LEFT,
  RAMP_RIGHT: ARROW_SLIGHT_RIGHT,
  FORK_LEFT: ARROW_SLIGHT_LEFT,
  FORK_RIGHT: ARROW_SLIGHT_RIGHT,
  MERGE: ARROW_STRAIGHT,
  ROUNDABOUT_LEFT: ARROW_ROUNDABOUT,
  ROUNDABOUT_RIGHT: ARROW_ROUNDABOUT,
  DEPART: ICON_DEPART,
  ARRIVE: ICON_ARRIVE,
};

/**
 * @param {{maneuver:string, instructions:string}} step — one entry from
 *   computeRoute()'s `steps` array (routes-api.js).
 * @returns {{icon:string, text:string}}
 */
export function stepIcon(step) {
  return {
    icon: ICON_BY_MANEUVER[step.maneuver] || ARROW_STRAIGHT,
    text: step.instructions || 'ตรงไป',
  };
}
