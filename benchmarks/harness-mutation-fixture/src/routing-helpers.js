export function rankEligibleWorkers(workers, requiredCapabilities) {
  return workers
    .filter(worker => worker.online && requiredCapabilities.every(capability => worker.capabilities.includes(capability)))
    .sort((left, right) => left.activeJobs - right.activeJobs || left.id.localeCompare(right.id));
}
