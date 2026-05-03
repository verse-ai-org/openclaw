export const STAGES = /** @type {const} */ ({
  INTAKE: "intake",
  ROUTE_SELECTED: "route_selected",
  ROUTE_PLANNED: "route_planned",
  ROUTE_CONFIRMED: "route_confirmed",
  VALIDATED: "validated",
  PLAN_READY: "plan_ready",
  IN_TRIP: "in_trip",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
});

export const ARTIFACTS = /** @type {const} */ ({
  POI_CACHE: "poi-cache",
  POI_PREVIEW: "poi-preview",
  ROUTE_EVIDENCE: "route-evidence",
  ROUTE_PLAN: "route-plan",
  ROUTE_VALIDATION: "route-validation",
  PLAN_OVERVIEW: "plan-overview",
  PLAN_DETAILS: "plan-details",
  LIVE_RESULTS: "live-results",
  BOOKING_READY: "booking-ready",
});

export function isStage(value) {
  return Object.values(STAGES).includes(String(value));
}
