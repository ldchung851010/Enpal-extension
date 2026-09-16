export function makeFakeFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (queue.length === 0) throw new Error('fake fetch exhausted');
    return queue.shift();
  };
  return { fetchImpl, calls };
}
