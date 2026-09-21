// core/i18n.js — localization. All user-facing strings live in data/strings.en.js
// and data/strings.it.js. Gameplay code never hardcodes text; it calls t(key).
import { STRINGS_EN } from '../data/strings.en.js';
import { STRINGS_IT } from '../data/strings.it.js';

const PACKS = { en: STRINGS_EN, it: STRINGS_IT };

export class I18n {
  constructor(lang = 'en') { this.lang = PACKS[lang] ? lang : 'en'; }
  setLanguage(lang) { if (PACKS[lang]) this.lang = lang; }
  get language() { return this.lang; }
  get languages() { return Object.keys(PACKS); }

  t(key, vars) {
    const pack = PACKS[this.lang];
    let s = (pack && pack[key] !== undefined) ? pack[key]
          : (STRINGS_EN[key] !== undefined ? STRINGS_EN[key] : '⟦' + key + '⟧');
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
    return s;
  }

  // pick from a localized array (e.g. lore paragraphs), en fallback
  ta(key) {
    const pack = PACKS[this.lang];
    const v = (pack && pack[key] !== undefined) ? pack[key] : STRINGS_EN[key];
    return Array.isArray(v) ? v : (v !== undefined ? [v] : ['⟦' + key + '⟧']);
  }
}

export const it = new I18n('en'); // singleton; main.js sets language from settings
