function isNonEmptyString(value, maxLength = 100) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

function isValidFiscalYear(value) {
  return isNonEmptyString(value, 20);
}

function isValidPlanVersion(value) {
  return typeof value === 'string' && /^v\d+$/.test(value);
}

function isValidJobNumber(value) {
  return isNonEmptyString(value, 100);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNullOrUndefined(value) {
  return value === null || value === undefined;
}

module.exports = {
  isNonEmptyString,
  isValidFiscalYear,
  isValidPlanVersion,
  isValidJobNumber,
  isPlainObject,
  isNullOrUndefined
};
