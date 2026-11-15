import { SIGN_CLIPS } from '../avatar/signClips.js';
import { SIGN_LEXICON } from './signDictionary.js';
import { spellingDuration } from '../avatar/fingerspelling.js';

export const AVAILABLE_SIGNS = Object.keys(SIGN_CLIPS).filter(key => SIGN_LEXICON[key]?.asl);
export const MAX_INPUT_LENGTH = 500;
export const MAX_GLOSS_TOKENS = 100;
const eyebrows = ['neutral', 'raised', 'furrowed'];
const sentenceTypes = ['STATEMENT', 'WH_QUESTION', 'YES_NO_QUESTION'];
const numberNames = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
const bounded = (value, min, max, fallback = 0) => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(min, Math.min(max, value)) : fallback;

export const GLOSS_SCHEMA = {
  type: 'object',
  required: ['translation', 'sentenceType', 'tokens'],
  properties: {
    translation: { type: 'string', description: 'Faithful English translation of the entire input.' },
    sentenceType: { type: 'string', enum: sentenceTypes },
    tokens: {
      // Keep the provider grammar compact. Nested numeric/array bounds caused
      // Gemini to reject this schema with INVALID_ARGUMENT. Enforce them below.
      type: 'array', description: 'Between 1 and 100 gloss tokens.',
      items: {
        type: 'object', required: ['gloss', 'spelling', 'nmm'],
        properties: {
          gloss: { type: 'string', description: 'One ASL gloss, uppercase; compound signs use underscores.' },
          spelling: { type: 'string', description: 'English word or romanized proper name to fingerspell if no animation exists. Use words for numbers.' },
          nmm: {
            type: 'object', required: ['eyebrows', 'smile', 'headTilt', 'headNod', 'headShake', 'mouthOpen'],
            properties: {
              eyebrows: { type: 'string', enum: eyebrows },
              smile: { type: 'number', description: 'Intensity from 0 to 1.' },
              headTilt: { type: 'number', description: 'Angle from -0.25 to 0.25 radians.' },
              headNod: { type: 'number', description: 'Angle from -0.25 to 0.25 radians.' },
              headShake: { type: 'number', description: 'Angle from -0.25 to 0.25 radians.' },
              mouthOpen: { type: 'number', description: 'Intensity from 0 to 0.5.' }
            }
          }
        }
      }
    }
  }
};

export function normalizeNmm(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  return {
    eyebrows: eyebrows.includes(value.eyebrows) ? value.eyebrows : 'neutral',
    smile: bounded(value.smile, 0, 1),
    headTilt: bounded(value.headTilt, -.25, .25),
    headNod: bounded(value.headNod, -.25, .25),
    headShake: bounded(value.headShake, -.25, .25),
    mouthOpen: bounded(value.mouthOpen, 0, .5)
  };
}

// Treat the model response as data. It never selects arbitrary files, joints or code.
export function mapHybridGloss(data) {
  if (!data || typeof data.translation !== 'string' || !data.translation.trim()
    || data.translation.length > 3000 || !sentenceTypes.includes(data.sentenceType)
    || !Array.isArray(data.tokens) || !data.tokens.length || data.tokens.length > MAX_GLOSS_TOKENS) {
    throw new Error('INVALID_GLOSS');
  }
  let letterCount = 0;
  const tokens = data.tokens.map((item, index) => {
    if (!item || typeof item.gloss !== 'string' || !item.gloss.trim() || item.gloss.length > 80
      || typeof item.spelling !== 'string' || item.spelling.length > 80
      || !item.nmm || typeof item.nmm !== 'object' || Array.isArray(item.nmm)) throw new Error('INVALID_GLOSS');
    const gloss = item.gloss.trim().toUpperCase();
    const key = gloss.replace(/[ -]+/g, '_');
    const nmm = normalizeNmm(item.nmm);
    if (AVAILABLE_SIGNS.includes(key)) {
      const sign = SIGN_LEXICON[key].asl;
      return { id: `AI_${index}`, type: 'SIGN', clipKey: key, text: gloss, gloss: sign.gloss,
        duration: sign.duration || 1000, nmm, desc: sign.desc };
    }
    const spelling = (item.spelling.trim() || gloss).normalize('NFD').replace(/\p{M}/gu, '')
      .replace(/[đĐ]/g, 'D').toUpperCase().replace(/\d/g, digit => numberNames[Number(digit)]);
    // Reject unsupported scripts instead of silently dropping words or characters.
    if (/[^A-Z\s'-]/.test(spelling)) throw new Error('INVALID_SPELLING');
    const letters = spelling.replace(/[^A-Z]/g, '').split('');
    letterCount += letters.length;
    if (!letters.length || letters.length > 80 || letterCount > 600) throw new Error('INVALID_SPELLING');
    return { id: `AI_FS_${index}`, type: 'FINGERSPELL', clipKey: 'FINGERSPELL', text: gloss,
      gloss, letters, duration: spellingDuration(letters), nmm,
      desc: `Chưa có động tác ${gloss}. Đánh vần A–Z: ${letters.join('-')}` };
  });
  const fingerspelled = tokens.filter(token => token.type === 'FINGERSPELL').map(token => token.gloss);
  return { translation: data.translation.trim(), sentenceType: data.sentenceType, tokens,
    coverage: { signs: tokens.length - fingerspelled.length, fingerspelled } };
}
