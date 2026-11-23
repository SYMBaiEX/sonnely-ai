export const usernamePattern = /^[a-z][a-z0-9_]{2,23}$/;
export const usernameHelp = "Use 3–24 letters, numbers, or underscores. Start with a letter.";
export const normalizeUsername = (value: string) => value.trim().toLowerCase();
