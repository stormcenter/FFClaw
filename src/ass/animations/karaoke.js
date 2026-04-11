/**
 * 'karaoke' animation — word-by-word highlight.
 *
 * ASS tag: \k<centiseconds> per word.
 * Duration in ASS \k is in centiseconds (1/100 second).
 *
 * @module ass/animations/karaoke
 */

export const meta = {
  name: 'karaoke',
  description: '卡拉OK逐字高亮',
  params: {
    highlightColor: {
      type: 'string',
      default: '#ffff00',
      description: '高亮颜色（CSS hex）',
    },
  },
};

/**
 * Build the ASS text with \k tags for karaoke display.
 *
 * @param {Array<{w: string, ms: number}>} karaokeWords
 * @returns {string}  e.g. '{\k50}Hello{\k10} {\k60}World'
 */
export function buildKaraokeText(karaokeWords) {
  if (!karaokeWords || karaokeWords.length === 0) return '';

  return karaokeWords.map(({ w, ms }) => {
    const cs = Math.round(ms / 10); // centiseconds
    return `{\\k${cs}}${w}`;
  }).join('');
}

/**
 * Build a single Dialogue line with karaoke text.
 *
 * @param {object} clip
 * @param {object} ctx   AnimationContext
 * @returns {string}     Dialogue line text with karaoke tags (no leading 'Dialogue: …')
 */
export function buildKaraokeDialogue(clip, ctx) {
  const { karaokeWords = [] } = clip;
  if (karaokeWords.length === 0) {
    return clip.content ?? '';
  }
  return buildKaraokeText(karaokeWords);
}

/**
 * Karaoke animation function.
 * @param {object} _ctx
 * @returns {string}  '' (karaoke handled by buildKaraokeDialogue)
 */
export function karaoke(_ctx) {
  return '';
}
