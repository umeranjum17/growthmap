// The date a run records for what it read: today, or the day `--as-of` pins
// before any fetch. One function so every source dates its records the same.

let pinned = null;

export const setAsOf = (date) => {
  pinned = date;
};

export const today = () => pinned ?? new Date().toISOString().slice(0, 10);
