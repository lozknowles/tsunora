const request = JSON.parse(await new Promise((resolve) => {
  let value = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { value += chunk; });
  process.stdin.on('end', () => resolve(value));
}));

const started = Date.now();
const rows = [];
for (const item of request.items) {
  const before = Date.now();
  const response = await fetch(request.endpoint, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      model: request.model,
      messages: [
        {role: 'system', content: 'Classify the request for Agent Control. Return JSON only with exactly one lane: LANE_REVIEW, LANE_OPERATE, LANE_VERIFY, or LANE_RESEARCH.'},
        {role: 'user', content: item.input},
      ],
      temperature: 0,
      max_tokens: 14,
      response_format: {type: 'json_object'},
    }),
  });
  if (!response.ok) throw new Error(`provider_request_failed:${response.status}`);
  const body = await response.json();
  const text = body.choices?.[0]?.message?.content ?? '';
  let output;
  try { output = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); }
  catch { output = {invalidOutput: text.slice(0, 160)}; }
  rows.push({
    id: item.id,
    output,
    inputTokens: body.usage?.prompt_tokens ?? null,
    outputTokens: body.usage?.completion_tokens ?? null,
    elapsedMs: Date.now() - before,
  });
}

process.stdout.write(JSON.stringify({mode: 'sequential-resident-provider', elapsedMs: Date.now() - started, rows}));
