// Only device preferences are local. Accounts, roles and reviews are server-owned.
window.MedicalStorage = (() => {
  const read = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  for (const key of [
    "we_medical_current_user_v3",
    "we_medical_employees_custom_v3",
    "we_medical_ratings_v3",
  ]) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* Storage may be unavailable. */
    }
  }
  try {
    sessionStorage.removeItem("we_admin_auth_status");
  } catch {
    /* No session storage. */
  }
  return Object.freeze({
    getFavorites: () => {
      const value = read("medical_favorites_v4", []);
      return Array.isArray(value)
        ? value.filter((v) => typeof v === "string")
        : [];
    },
    toggleFavorite(id) {
      const list = this.getFavorites();
      const next = list.includes(id)
        ? list.filter((x) => x !== id)
        : [...list, id];
      if (!write("medical_favorites_v4", next))
        throw new Error("تعذر حفظ المفضلة على هذا الجهاز.");
      return next.includes(id);
    },
    getTheme: () =>
      read("medical_theme_v4", "light") === "dark" ? "dark" : "light",
    setTheme: (value) => write("medical_theme_v4", value),
  });
})();
