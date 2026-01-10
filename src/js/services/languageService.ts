interface TranslationRecord { [k: string]: string | TranslationRecord } // okay

class LanguageService {
  public currentLanguage: string;
  public translations: TranslationRecord;

  constructor() {
    this.currentLanguage = "en";
    this.translations = {};
  }

  async init() {
    this.currentLanguage = localStorage.getItem("language") || "en";
    await this.loadTranslations(this.currentLanguage);
  }

  async loadTranslations(lang) {
    try {
      const response = await fetch(`../translations/${lang}.json`);
      this.translations = await response.json();
      this.currentLanguage = lang;
      localStorage.setItem("language", lang);
      this.updateUI();
    } catch (error) {
      console.error(`Failed to load translations for ${lang}:`, error);
      // Fallback to English if translation fails
      if (lang !== "en") {
        await this.loadTranslations("en");
      }
    }
  }

  translate(key) {
    return this.getNestedTranslation(this.translations, key) || key;
  }

  getNestedTranslation(obj, path) {
    return path.split(".").reduce((prev, curr) => {
      return prev ? prev[curr] : null;
    }, obj);
  }

  updateUI() {
    // Update text content
    const elements = document.querySelectorAll("[data-i18n]");
    elements.forEach((element) => {
      const key = element.getAttribute("data-i18n");
      element.textContent = this.translate(key);
    });

    // Update placeholders
    const placeholderElements = document.querySelectorAll(
      "[data-i18n-placeholder]",
    );

    placeholderElements.forEach((element: HTMLInputElement) => {
      const key = element.getAttribute("data-i18n-placeholder");
      element.placeholder = this.translate(key);
    });
  }
}

export const languageService = new LanguageService();
