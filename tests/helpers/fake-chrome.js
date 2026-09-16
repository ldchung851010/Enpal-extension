export function makeFakeChrome(initialStorage = {}) {
  const data = { ...initialStorage };
  return {
    storage: {
      local: {
        async get(key) {
          if (key == null) return { ...data };
          if (typeof key === 'string') return { [key]: data[key] };
          if (Array.isArray(key)) {
            return Object.fromEntries(key.map((name) => [name, data[name]]));
          }
          return { ...data };
        },
        async set(values) {
          Object.assign(data, values);
        },
        async remove(key) {
          for (const name of Array.isArray(key) ? key : [key]) delete data[name];
        }
      }
    },
    __storage: data
  };
}
