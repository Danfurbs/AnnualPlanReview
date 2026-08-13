#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required for the source database}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required for a disposable verification database}"

if [[ "$DATABASE_URL" == "$RESTORE_DATABASE_URL" ]]; then
  echo "Refusing to restore over the source database." >&2
  exit 1
fi

backup_file="${BACKUP_FILE:-annual-plan-review-$(date -u +%Y%m%dT%H%M%SZ).dump}"
pg_dump --format=custom --no-owner --no-acl --file="$backup_file" "$DATABASE_URL"
pg_restore --list "$backup_file" >/dev/null

# The target must be a disposable, empty verification database supplied by the
# operator. --exit-on-error makes a partial restore fail the check.
pg_restore --exit-on-error --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" "$backup_file"

source_report="$(mktemp)"
restore_report="$(mktemp)"
trap 'rm -f "$source_report" "$restore_report"' EXIT

DATABASE_URL="$DATABASE_URL" node "$(dirname "$0")/reconcile-production-pg.js" >"$source_report"
DATABASE_URL="$RESTORE_DATABASE_URL" node "$(dirname "$0")/reconcile-production-pg.js" >"$restore_report"

# generatedAt differs; compare every data section instead.
node - "$source_report" "$restore_report" <<'NODE'
const fs = require('fs');
const [sourcePath, restorePath] = process.argv.slice(2);
const normalize = path => {
  const report = JSON.parse(fs.readFileSync(path, 'utf8'));
  delete report.generatedAt;
  return report;
};
const source = normalize(sourcePath);
const restored = normalize(restorePath);
if (JSON.stringify(source) !== JSON.stringify(restored)) {
  console.error('Backup restore reconciliation differs from the source database.');
  process.exit(1);
}
console.log('Backup created, restored, and reconciled successfully.');
NODE

echo "Verified backup: $backup_file"
