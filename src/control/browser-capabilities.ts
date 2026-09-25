export const browserCapability = {
  headless: 'browser.headless', interactive: 'browser.interactive', authenticated: 'browser.authenticated', javascript: 'browser.javascript',
  download: 'browser.download', screenshot: 'browser.screenshot', chatGptWeb: 'chatgpt.web', chatGptPlan: 'chatgpt.plan', chatGptAndroid: 'chatgpt.android', androidUi: 'android.ui',
} as const;

export type BrowserRouteState = 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE' | 'AUTH_REQUIRED' | 'DEVICE_OFFLINE';
export interface BrowserRoute {
  id: string; nodeId: string; capabilities: string[]; state: BrowserRouteState; engine: string; transport: string; authenticated: boolean;
  expectedLatencyMs?: number; expectedCost?: number; load?: number; locality?: 'local' | 'remote'; reason: string;
}
export interface BrowserRouteRequest {capability: string; explicitRouteId?: string; authenticated?: boolean; localOnly?: boolean; maximumCost?: number; maximumLatencyMs?: number;}
export interface BrowserRouteDecision {selected: BrowserRoute; considered: Array<{routeId: string; eligible: boolean; reasons: string[]}>; reason: string;}

export function selectBrowserRoute(request: BrowserRouteRequest, routes: BrowserRoute[]): BrowserRouteDecision {
  const exact = request.explicitRouteId ? routes.find(route => route.id === request.explicitRouteId) : undefined;
  if (request.explicitRouteId && !exact) throw new Error(`browser_route_missing:${request.explicitRouteId}`);
  const pool = exact ? [exact] : routes;
  const considered = pool.map(route => {
    const reasons: string[] = [];
    if (route.state !== 'AVAILABLE') reasons.push(`state:${route.state}`);
    if (!route.capabilities.includes(request.capability)) reasons.push(`capability_missing:${request.capability}`);
    if (request.authenticated && !route.authenticated) reasons.push('authentication_required');
    if (request.localOnly && route.locality !== 'local') reasons.push('locality_required');
    if (request.maximumCost !== undefined && (route.expectedCost ?? Number.POSITIVE_INFINITY) > request.maximumCost) reasons.push('cost_limit');
    if (request.maximumLatencyMs !== undefined && (route.expectedLatencyMs ?? Number.POSITIVE_INFINITY) > request.maximumLatencyMs) reasons.push('latency_limit');
    return {routeId: route.id, eligible: reasons.length === 0, reasons: reasons.length ? reasons : ['qualified_and_available']};
  });
  const eligible = pool.filter(route => considered.find(item => item.routeId === route.id)?.eligible)
    .sort((a, b) => (a.expectedCost ?? 0) - (b.expectedCost ?? 0) || (a.expectedLatencyMs ?? 0) - (b.expectedLatencyMs ?? 0) || (a.load ?? 0) - (b.load ?? 0) || a.id.localeCompare(b.id));
  if (!eligible[0]) throw new Error(`${request.explicitRouteId ? 'explicit_browser_route_unavailable' : 'no_browser_route'}:${considered.flatMap(item => item.reasons).join('|')}`);
  return {selected: eligible[0], considered, reason: request.explicitRouteId ? `operator explicitly requested ${request.explicitRouteId}; substitution prohibited` : `minimum sufficient healthy route for ${request.capability}`};
}

export function pixelChatGptState(input: {online: boolean; authorisedTransport: boolean; uiAutomation: boolean; authenticatedSession: boolean}): BrowserRouteState {
  if (!input.online) return 'DEVICE_OFFLINE';
  if (!input.authorisedTransport || !input.uiAutomation) return 'UNAVAILABLE';
  if (!input.authenticatedSession) return 'AUTH_REQUIRED';
  return 'AVAILABLE';
}
