const toCamelCase = (value = '') => {
  return String(value)
    .replace(/-([a-z])/g, (_, char) => char.toUpperCase())
    .replace(/[\s_]/g, '');
};

const parseBoolean = (value) => {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const normalizeFlag = (token) => {
  if (typeof token !== 'string' || !token.startsWith('--')) {
    return null;
  }

  if (token.startsWith('--no-')) {
    return {
      key: toCamelCase(token.slice(5)),
      value: false,
      isNegated: true,
    };
  }

  const withoutPrefix = token.slice(2);
  const assignIndex = withoutPrefix.indexOf('=');
  if (assignIndex >= 0) {
    return {
      key: toCamelCase(withoutPrefix.slice(0, assignIndex)),
      value: withoutPrefix.slice(assignIndex + 1),
      isNegated: false,
    };
  }

  return {
    key: toCamelCase(withoutPrefix),
    value: true,
    isNegated: false,
  };
};

const parseArgs = (argv = []) => {
  const result = { _: [], flags: {} };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    const flag = normalizeFlag(token);
    if (!flag) {
      result._.push(token);
      continue;
    }

    const { key, value, isNegated } = flag;
    if (!isNegated && value === true) {
      const next = argv[index + 1];
      if (next && !String(next).startsWith('-')) {
        result.flags[key] = next;
        index += 1;
      } else {
        result.flags[key] = true;
      }
    } else {
      result.flags[key] = value;
    }
  }

  result.flags.boolean = {
    ...result.flags.boolean,
    ...Object.keys(result.flags).reduce((acc, key) => {
      const val = result.flags[key];
      if (val === false) {
        acc[key] = false;
      } else if (typeof val === 'string') {
        acc[key] = parseBoolean(val);
      } else {
        acc[key] = Boolean(val);
      }
      return acc;
    }, {}),
  };

  return result;
};

module.exports = {
  parseArgs,
  parseBoolean,
};
