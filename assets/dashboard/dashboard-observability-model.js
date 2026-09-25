(() => {
  'use strict';
  globalThis.AgentControlObservabilityModel = Object.freeze({
    boundNode(requested, nodes) {
      const ids=[...new Set(nodes.map(n=>n.id))];
      return requested&&ids.includes(requested)?requested:ids.length===1?ids[0]:null;
    },
    outputRate(call) {
      const output=call.accounting?call.accounting.usage?.outputTokens:call.outputTokens;
      return Number.isFinite(output)&&output>=0&&Number.isFinite(call.elapsedMs)&&call.elapsedMs>0?output/(call.elapsedMs/1000):null;
    },
  });
})();
