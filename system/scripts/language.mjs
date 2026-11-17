/** Match Foundry client language; DAWN currently supplies Russian and English. */
export function systemLanguage(foundryLanguage) {
  return typeof foundryLanguage === 'string' && foundryLanguage.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}
