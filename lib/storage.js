// Storage abstraction -- uses localStorage in browser, can swap for DB later
const storage = {
  async get(key) {
    if (typeof window === "undefined") return null;
    try {
      const val = localStorage.getItem(key);
      return val ? { key, value: val } : null;
    } catch {
      return null;
    }
  },
  async set(key, value) {
    if (typeof window === "undefined") return null;
    try {
      localStorage.setItem(key, value);
      return { key, value };
    } catch {
      return null;
    }
  },
  async delete(key) {
    if (typeof window === "undefined") return null;
    try {
      localStorage.removeItem(key);
      return { key, deleted: true };
    } catch {
      return null;
    }
  },
};

export default storage;
