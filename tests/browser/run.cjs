const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const file of ['review-fixes.cjs', 'forecast-builder.cjs', 'work-done.cjs']) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}
