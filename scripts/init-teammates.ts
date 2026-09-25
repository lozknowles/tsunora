import path from 'node:path';
import {PersistentTeammateStore, seedPersistentTeammates} from '../src/control/teammates.js';

const file = path.resolve(process.env.AGENT_CONTROL_STATE_DIR || '.agent-control', 'teammates.json');
const profiles = seedPersistentTeammates(new PersistentTeammateStore(file));
process.stdout.write(`${JSON.stringify({status: 'INITIALIZED', file, profiles: profiles.map(value => ({id: value.id, name: value.name, role: value.role, coordinator: Boolean(value.coordinator)}))})}\n`);
