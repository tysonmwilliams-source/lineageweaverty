/**
 * proseAnalysisService.js - Real-time Prose Analysis
 *
 * Analyzes writing for common craft issues based on principles from:
 * - Stephen King (On Writing): adverbs, passive voice
 * - Donald Maass (Emotional Craft): show vs tell, tension
 * - Ursula K. Le Guin (Steering the Craft): sentence variation, voice
 *
 * All analysis is done client-side for real-time feedback.
 */

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

/**
 * Common adverbs that often indicate weak verb + adverb combinations
 * Stephen King: "The road to hell is paved with adverbs"
 */
const WEAK_ADVERBS = [
  'very', 'really', 'quite', 'rather', 'somewhat', 'fairly', 'pretty',
  'extremely', 'incredibly', 'absolutely', 'totally', 'completely',
  'suddenly', 'quickly', 'slowly', 'quietly', 'loudly', 'softly',
  'angrily', 'sadly', 'happily', 'nervously', 'anxiously', 'carefully',
  'gently', 'roughly', 'tightly', 'loosely', 'deeply', 'highly',
  'greatly', 'largely', 'mostly', 'nearly', 'almost', 'just',
  'simply', 'merely', 'only', 'even', 'still', 'actually', 'basically',
  'literally', 'definitely', 'certainly', 'probably', 'possibly',
  'obviously', 'clearly', 'apparently', 'seemingly', 'supposedly'
];

/**
 * Filter words that distance reader from the experience
 * In close POV, these should often be removed
 */
const FILTER_WORDS = [
  'saw', 'see', 'sees', 'seen', 'seeing',
  'heard', 'hear', 'hears', 'hearing',
  'felt', 'feel', 'feels', 'feeling',
  'noticed', 'notice', 'notices', 'noticing',
  'realized', 'realize', 'realizes', 'realizing',
  'thought', 'think', 'thinks', 'thinking',
  'knew', 'know', 'knows', 'knowing',
  'watched', 'watch', 'watches', 'watching',
  'looked', 'look', 'looks', 'looking',
  'wondered', 'wonder', 'wonders', 'wondering',
  'seemed', 'seem', 'seems', 'seeming',
  'appeared', 'appear', 'appears', 'appearing',
  'decided', 'decide', 'decides', 'deciding',
  'remembered', 'remember', 'remembers', 'remembering'
];

// ============================================================================
// PRE-COMPILED PATTERNS
// ============================================================================
// These were built with `new RegExp(...)` inside nested per-sentence loops, so
// a single analysis pass compiled tens of thousands of regexes — and the whole
// pass ran synchronously on every keystroke. Compiling once at module load and
// scanning with one alternation removes both costs.
//
// NOTE: these carry the `g` flag, so `lastIndex` must be reset before each use.
// Every call site does so explicitly.

const escapeForRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ADVERB_REGEX = new RegExp(
  `\\b(?:${WEAK_ADVERBS.map(escapeForRegex).join('|')})\\b`,
  'gi'
);

const FILTER_WORD_REGEX = new RegExp(
  `\\b(he|she|they|i|we|\\w+)\\s+(${FILTER_WORDS.map(escapeForRegex).join('|')})\\s+(the|a|an|that|how|what)\\b`,
  'gi'
);

// Hoisted out of detectAdverbs' inner loop.
const WEAK_VERB_BEFORE_RE = /\b(walked|ran|said|looked|went|came|got|made|did|had)\s*$/i;
const WEAK_VERB_AFTER_RE = /^\w+\s+(walked|ran|said|looked|went|came|got|made|did|had)\b/i;

/**
 * "To be" verbs for passive voice detection
 */
const TO_BE_VERBS = [
  'is', 'are', 'am', 'was', 'were', 'be', 'been', 'being',
  'has been', 'have been', 'had been', 'will be', 'will have been',
  'is being', 'are being', 'was being', 'were being'
];

/**
 * Common past participles (for passive voice detection)
 */
const COMMON_PAST_PARTICIPLES = [
  'abandoned', 'accepted', 'accomplished', 'accused', 'achieved', 'acquired',
  'affected', 'allowed', 'amazed', 'announced', 'approached', 'approved',
  'arranged', 'arrested', 'asked', 'attacked', 'attempted', 'awarded',
  'beaten', 'believed', 'bitten', 'blamed', 'blessed', 'blocked', 'blown',
  'born', 'bought', 'broken', 'brought', 'built', 'buried', 'burned',
  'called', 'carried', 'caught', 'caused', 'changed', 'charged', 'chased',
  'chosen', 'claimed', 'cleaned', 'closed', 'collected', 'committed',
  'completed', 'concerned', 'confirmed', 'confused', 'connected', 'considered',
  'constructed', 'contained', 'continued', 'controlled', 'convinced', 'cooked',
  'copied', 'corrected', 'covered', 'created', 'criticized', 'crossed',
  'crushed', 'cut', 'damaged', 'decided', 'declared', 'defeated', 'defined',
  'delayed', 'delivered', 'denied', 'described', 'designed', 'destroyed',
  'determined', 'developed', 'directed', 'disappointed', 'discovered',
  'discussed', 'dismissed', 'displayed', 'distributed', 'divided', 'done',
  'dragged', 'drawn', 'dressed', 'driven', 'dropped', 'drowned', 'eaten',
  'educated', 'elected', 'embarrassed', 'employed', 'encouraged', 'ended',
  'engaged', 'enjoyed', 'entered', 'established', 'examined', 'excited',
  'excluded', 'executed', 'exercised', 'exhausted', 'expected', 'experienced',
  'explained', 'explored', 'exposed', 'expressed', 'extended', 'faced',
  'failed', 'fallen', 'fed', 'filed', 'filled', 'finished', 'fired', 'fixed',
  'flooded', 'followed', 'forced', 'forgotten', 'formed', 'fought', 'found',
  'founded', 'frightened', 'frozen', 'funded', 'gathered', 'given', 'gone',
  'granted', 'grown', 'guided', 'handled', 'happened', 'harmed', 'hated',
  'haunted', 'headed', 'heard', 'heated', 'held', 'helped', 'hidden', 'hired',
  'hit', 'honored', 'hoped', 'hosted', 'hurt', 'identified', 'ignored',
  'illustrated', 'imagined', 'impressed', 'improved', 'included', 'increased',
  'influenced', 'informed', 'inherited', 'injured', 'inspired', 'installed',
  'interested', 'interviewed', 'introduced', 'invaded', 'invented', 'invested',
  'investigated', 'invited', 'involved', 'isolated', 'joined', 'judged',
  'justified', 'kept', 'kicked', 'killed', 'kissed', 'knocked', 'known',
  'launched', 'learned', 'left', 'lifted', 'limited', 'linked', 'listed',
  'loaded', 'located', 'locked', 'lost', 'loved', 'made', 'maintained',
  'managed', 'marked', 'married', 'matched', 'measured', 'mentioned', 'met',
  'missed', 'mixed', 'modified', 'moved', 'murdered', 'named', 'needed',
  'neglected', 'negotiated', 'noted', 'noticed', 'obtained', 'occupied',
  'offered', 'opened', 'operated', 'opposed', 'ordered', 'organized', 'owned',
  'paid', 'painted', 'parked', 'passed', 'permitted', 'persuaded', 'picked',
  'placed', 'planned', 'played', 'pleased', 'pointed', 'poisoned', 'polished',
  'positioned', 'possessed', 'posted', 'poured', 'practiced', 'praised',
  'predicted', 'preferred', 'prepared', 'presented', 'preserved', 'pressed',
  'prevented', 'printed', 'processed', 'produced', 'programmed', 'promised',
  'promoted', 'pronounced', 'proposed', 'protected', 'proved', 'provided',
  'published', 'pulled', 'punished', 'purchased', 'pushed', 'put', 'questioned',
  'raised', 'reached', 'read', 'realized', 'received', 'recognized',
  'recommended', 'recorded', 'recovered', 'reduced', 'referred', 'reflected',
  'reformed', 'refused', 'registered', 'rejected', 'related', 'released',
  'relieved', 'remained', 'remembered', 'reminded', 'removed', 'renamed',
  'repaired', 'repeated', 'replaced', 'reported', 'represented', 'requested',
  'required', 'rescued', 'researched', 'reserved', 'resolved', 'respected',
  'restored', 'restricted', 'retired', 'returned', 'revealed', 'reviewed',
  'revised', 'rewarded', 'ridden', 'risen', 'roasted', 'robbed', 'rolled',
  'ruined', 'ruled', 'run', 'rushed', 'sacrificed', 'said', 'satisfied',
  'saved', 'scared', 'scattered', 'scheduled', 'scored', 'searched', 'seated',
  'secured', 'seen', 'seized', 'selected', 'sent', 'separated', 'served',
  'set', 'settled', 'shaken', 'shaped', 'shared', 'sheltered', 'shifted',
  'shipped', 'shocked', 'shot', 'shown', 'shut', 'signed', 'silenced',
  'simplified', 'situated', 'slammed', 'slapped', 'slaughtered', 'smashed',
  'sold', 'solved', 'sorted', 'sought', 'spent', 'split', 'spoken', 'sponsored',
  'spotted', 'spread', 'squeezed', 'stabbed', 'staged', 'stained', 'started',
  'stated', 'stationed', 'stolen', 'stopped', 'stored', 'strengthened',
  'stressed', 'stretched', 'struck', 'structured', 'studied', 'stuffed',
  'submitted', 'succeeded', 'suggested', 'suited', 'summarized', 'supervised',
  'supplied', 'supported', 'supposed', 'surprised', 'surrounded', 'survived',
  'suspected', 'suspended', 'sustained', 'swept', 'switched', 'sworn',
  'taken', 'talked', 'targeted', 'taught', 'taxed', 'terminated', 'tested',
  'thanked', 'threatened', 'thrown', 'tied', 'tired', 'told', 'torn',
  'tortured', 'touched', 'toured', 'traced', 'tracked', 'traded', 'trained',
  'transferred', 'transformed', 'translated', 'transmitted', 'transported',
  'trapped', 'treated', 'triggered', 'troubled', 'trusted', 'turned', 'typed',
  'understood', 'united', 'updated', 'upgraded', 'upset', 'used', 'valued',
  'varied', 'verified', 'viewed', 'violated', 'visited', 'voted', 'waited',
  'warned', 'washed', 'wasted', 'watched', 'weakened', 'welcomed', 'widened',
  'withdrawn', 'witnessed', 'won', 'worked', 'worried', 'worn', 'wounded',
  'wrapped', 'written'
];

/**
 * Telling words that often indicate "tell" instead of "show"
 * Donald Maass: Show emotions through physical signs
 */
const TELLING_EMOTION_PATTERNS = [
  { pattern: /\b(felt|feeling)\s+(angry|sad|happy|scared|afraid|nervous|anxious|excited|worried|confused|frustrated|annoyed|irritated|disappointed|relieved|surprised|shocked|horrified|terrified|furious|enraged|delighted|thrilled|depressed|lonely|jealous|envious|guilty|ashamed|embarrassed|proud|content|satisfied|hopeful|hopeless|desperate|determined|confident|uncertain|suspicious|curious|bored|tired|exhausted)\b/gi, type: 'emotion-tell' },
  { pattern: /\bwas\s+(angry|sad|happy|scared|afraid|nervous|anxious|excited|worried|confused|frustrated|annoyed|irritated|disappointed|relieved|surprised|shocked|horrified|terrified|furious|enraged|delighted|thrilled|depressed|lonely|jealous|envious|guilty|ashamed|embarrassed|proud|content|satisfied|hopeful|hopeless|desperate|determined|confident|uncertain|suspicious|curious|bored|tired|exhausted)\b/gi, type: 'emotion-tell' },
  { pattern: /\b(he|she|they|i)\s+(knew|realized|understood|thought|believed|felt)\s+that\b/gi, type: 'filter-tell' }
];

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Analyze text for passive voice constructions
 * @param {string} text - Plain text to analyze
 * @returns {Array} Array of issues found
 */
export function detectPassiveVoice(text) {
  const issues = [];
  const sentences = splitIntoSentences(text);

  sentences.forEach((sentence, sentenceIndex) => {
    const words = sentence.toLowerCase().split(/\s+/);

    for (let i = 0; i < words.length - 1; i++) {
      const word = words[i].replace(/[^\w]/g, '');
      const nextWord = words[i + 1]?.replace(/[^\w]/g, '');

      // Check for "to be" verb followed by past participle
      if (TO_BE_VERBS.includes(word) && COMMON_PAST_PARTICIPLES.includes(nextWord)) {
        // Find the actual position in the original text
        const match = sentence.match(new RegExp(`\\b${word}\\s+${nextWord}\\b`, 'i'));
        if (match) {
          issues.push({
            type: 'passive-voice',
            severity: 'warning',
            text: match[0],
            sentence: sentence.trim(),
            sentenceIndex,
            message: 'Passive voice detected. Consider rewriting in active voice.',
            suggestion: `Who or what is doing the action? Try: "[Subject] ${nextWord}..."`
          });
        }
      }
    }
  });

  return issues;
}

/**
 * Detect weak adverbs, especially with weak verbs
 * @param {string} text - Plain text to analyze
 * @returns {Array} Array of issues found
 */
export function detectAdverbs(text) {
  const issues = [];
  const sentences = splitIntoSentences(text);

  sentences.forEach((sentence, sentenceIndex) => {
    // One pre-compiled alternation, scanned once, instead of constructing and
    // running 56 separate RegExp objects per sentence. On a 3,000-word chapter
    // (~200 sentences) that was ~11,000 regex compilations — per keystroke.
    ADVERB_REGEX.lastIndex = 0;
    let match;

    while ((match = ADVERB_REGEX.exec(sentence)) !== null) {
      const adverb = match[0].toLowerCase();

      // Check context - is it modifying a weak verb?
      const beforeAdverb = sentence.slice(Math.max(0, match.index - 30), match.index);
      const afterAdverb = sentence.slice(match.index, Math.min(sentence.length, match.index + 30));

      const isWithWeakVerb = WEAK_VERB_BEFORE_RE.test(beforeAdverb) ||
                             WEAK_VERB_AFTER_RE.test(afterAdverb);

      issues.push({
        type: 'adverb',
        severity: isWithWeakVerb ? 'warning' : 'info',
        text: match[0],
        sentence: sentence.trim(),
        sentenceIndex,
        message: isWithWeakVerb
          ? `"${match[0]}" with weak verb - consider a stronger, more specific verb`
          : `Adverb "${match[0]}" - could a stronger verb eliminate the need for this?`,
        suggestion: getAdverbSuggestion(adverb, beforeAdverb + afterAdverb)
      });
    }
  });

  return issues;
}

/**
 * Detect filter words that distance the reader
 * @param {string} text - Plain text to analyze
 * @returns {Array} Array of issues found
 */
export function detectFilterWords(text) {
  const issues = [];
  const sentences = splitIntoSentences(text);

  sentences.forEach((sentence, sentenceIndex) => {
    // Single pre-compiled alternation rather than 56 RegExp constructions per
    // sentence. Looks for patterns like "She saw the..." or "He felt the...".
    FILTER_WORD_REGEX.lastIndex = 0;
    let match;

    while ((match = FILTER_WORD_REGEX.exec(sentence)) !== null) {
      issues.push({
        type: 'filter-word',
        severity: 'info',
        text: match[0],
        sentence: sentence.trim(),
        sentenceIndex,
        message: `Filter word "${match[2]}" creates distance. In close POV, consider removing.`,
        suggestion: `Instead of "${match[0]}", try describing directly what follows.`
      });
    }
  });

  return issues;
}

/**
 * Detect "telling" instead of "showing" emotions
 * @param {string} text - Plain text to analyze
 * @returns {Array} Array of issues found
 */
export function detectTelling(text) {
  const issues = [];
  const sentences = splitIntoSentences(text);

  sentences.forEach((sentence, sentenceIndex) => {
    TELLING_EMOTION_PATTERNS.forEach(({ pattern, type }) => {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);

      while ((match = regex.exec(sentence)) !== null) {
        issues.push({
          type: 'show-dont-tell',
          severity: 'warning',
          text: match[0],
          sentence: sentence.trim(),
          sentenceIndex,
          message: 'Telling emotion directly. Show through physical signs, actions, or dialogue.',
          suggestion: getShowDontTellSuggestion(match[0])
        });
      }
    });
  });

  return issues;
}

/**
 * Detect repeated words in close proximity
 * @param {string} text - Plain text to analyze
 * @param {number} proximity - Number of words to check (default 50)
 * @returns {Array} Array of issues found
 */
export function detectRepetition(text, proximity = 50) {
  const issues = [];
  const words = text.toLowerCase().split(/\s+/);
  const significantWords = words.filter(w => w.length > 4 && !isCommonWord(w));

  const wordPositions = {};

  significantWords.forEach((word, index) => {
    const cleanWord = word.replace(/[^\w]/g, '');
    if (!cleanWord) return;

    if (wordPositions[cleanWord]) {
      const lastPos = wordPositions[cleanWord];
      if (index - lastPos < proximity / 2) { // Adjust for filtered words
        issues.push({
          type: 'repetition',
          severity: 'info',
          text: cleanWord,
          message: `"${cleanWord}" repeated within ${proximity} words`,
          suggestion: 'Consider varying your vocabulary or restructuring sentences.'
        });
      }
    }
    wordPositions[cleanWord] = index;
  });

  return issues;
}

/**
 * Analyze sentence length variation
 * @param {string} text - Plain text to analyze
 * @returns {Object} Analysis results
 */
export function analyzeSentenceVariation(text) {
  const sentences = splitIntoSentences(text);
  const lengths = sentences.map(s => s.split(/\s+/).length);

  if (lengths.length < 3) {
    return { issues: [], stats: { avg: 0, variation: 'insufficient data' } };
  }

  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const issues = [];

  // Check for runs of similar-length sentences
  for (let i = 0; i < lengths.length - 2; i++) {
    const run = [lengths[i], lengths[i + 1], lengths[i + 2]];
    const runAvg = run.reduce((a, b) => a + b, 0) / 3;
    const allSimilar = run.every(l => Math.abs(l - runAvg) < 3);

    if (allSimilar) {
      issues.push({
        type: 'sentence-variation',
        severity: 'info',
        sentenceIndex: i,
        message: `Three consecutive sentences of similar length (~${Math.round(runAvg)} words). Vary rhythm for better flow.`,
        suggestion: 'Mix short punchy sentences with longer, flowing ones.'
      });
      i += 2; // Skip ahead to avoid duplicate warnings
    }
  }

  // Check for very long sentences
  lengths.forEach((len, i) => {
    if (len > 40) {
      issues.push({
        type: 'long-sentence',
        severity: 'info',
        sentenceIndex: i,
        sentence: sentences[i]?.trim(),
        message: `Long sentence (${len} words). Consider breaking up for readability.`,
        suggestion: 'Look for natural break points or subordinate clauses to separate.'
      });
    }
  });

  return {
    issues,
    stats: {
      avg: Math.round(avg * 10) / 10,
      min: Math.min(...lengths),
      max: Math.max(...lengths),
      count: lengths.length
    }
  };
}

/**
 * Detect sentences starting with the same word
 * @param {string} text - Plain text to analyze
 * @returns {Array} Array of issues found
 */
export function detectSentenceStarts(text) {
  const issues = [];
  const sentences = splitIntoSentences(text);

  const starts = sentences.map(s => {
    const firstWord = s.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^\w]/g, '');
    return firstWord;
  });

  // Check for consecutive same starts
  for (let i = 0; i < starts.length - 1; i++) {
    if (starts[i] === starts[i + 1] && starts[i] && starts[i] !== 'i') {
      // Check for 3+ in a row
      let count = 2;
      while (i + count < starts.length && starts[i + count] === starts[i]) {
        count++;
      }

      if (count >= 2) {
        issues.push({
          type: 'sentence-starts',
          severity: count >= 3 ? 'warning' : 'info',
          text: starts[i],
          sentenceIndex: i,
          message: `${count} consecutive sentences start with "${starts[i]}". Vary your sentence openings.`,
          suggestion: 'Try starting with: a prepositional phrase, a participial phrase, dialogue, or a different subject.'
        });
        i += count - 1; // Skip the counted sentences
      }
    }
  }

  return issues;
}

// ============================================================================
// FULL ANALYSIS
// ============================================================================

/**
 * Run complete prose analysis
 * @param {string} text - Plain text to analyze
 * @returns {Object} Complete analysis results
 */
export function analyzeProseComplete(text) {
  if (!text || text.trim().length === 0) {
    return {
      issues: [],
      stats: {
        wordCount: 0,
        sentenceCount: 0,
        avgSentenceLength: 0,
        passiveVoicePercent: 0,
        adverbDensity: 0
      },
      health: 'none'
    };
  }

  const passiveIssues = detectPassiveVoice(text);
  const adverbIssues = detectAdverbs(text);
  const filterIssues = detectFilterWords(text);
  const tellingIssues = detectTelling(text);
  const repetitionIssues = detectRepetition(text);
  const sentenceStartIssues = detectSentenceStarts(text);
  const { issues: variationIssues, stats: sentenceStats } = analyzeSentenceVariation(text);

  const allIssues = [
    ...passiveIssues,
    ...adverbIssues,
    ...filterIssues,
    ...tellingIssues,
    ...repetitionIssues,
    ...sentenceStartIssues,
    ...variationIssues
  ];

  // Calculate statistics
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  const sentences = splitIntoSentences(text);

  const stats = {
    wordCount,
    sentenceCount: sentences.length,
    avgSentenceLength: sentenceStats.avg || 0,
    passiveVoicePercent: sentences.length > 0
      ? Math.round((passiveIssues.length / sentences.length) * 100)
      : 0,
    adverbDensity: wordCount > 0
      ? Math.round((adverbIssues.length / wordCount) * 1000) / 10
      : 0,
    issuesByType: {
      passiveVoice: passiveIssues.length,
      adverbs: adverbIssues.length,
      filterWords: filterIssues.length,
      showDontTell: tellingIssues.length,
      repetition: repetitionIssues.length,
      sentenceStarts: sentenceStartIssues.length,
      sentenceVariation: variationIssues.length
    }
  };

  // Determine overall health
  const warningCount = allIssues.filter(i => i.severity === 'warning').length;
  const infoCount = allIssues.filter(i => i.severity === 'info').length;
  const issuesPerHundredWords = wordCount > 0 ? (allIssues.length / wordCount) * 100 : 0;

  let health;
  if (wordCount < 20) {
    health = 'insufficient';
  } else if (issuesPerHundredWords < 2 && stats.passiveVoicePercent < 5) {
    health = 'excellent';
  } else if (issuesPerHundredWords < 5 && stats.passiveVoicePercent < 10) {
    health = 'good';
  } else if (issuesPerHundredWords < 10 && stats.passiveVoicePercent < 20) {
    health = 'fair';
  } else {
    health = 'needs-work';
  }

  return {
    issues: allIssues,
    stats,
    health
  };
}

/**
 * Quick analysis for real-time feedback (lighter weight)
 * @param {string} text - Plain text to analyze
 * @returns {Object} Quick analysis results
 */
export function analyzeProseQuick(text) {
  if (!text || text.trim().length < 20) {
    return { issues: [], health: 'insufficient' };
  }

  // Only run the most impactful checks for real-time
  const passiveIssues = detectPassiveVoice(text).slice(0, 5);
  const adverbIssues = detectAdverbs(text).filter(i => i.severity === 'warning').slice(0, 5);
  const tellingIssues = detectTelling(text).slice(0, 3);

  const issues = [...passiveIssues, ...adverbIssues, ...tellingIssues];

  const wordCount = text.split(/\s+/).length;
  const issuesPerHundredWords = (issues.length / wordCount) * 100;

  let health;
  if (issuesPerHundredWords < 2) health = 'excellent';
  else if (issuesPerHundredWords < 5) health = 'good';
  else if (issuesPerHundredWords < 10) health = 'fair';
  else health = 'needs-work';

  return { issues, health };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Split text into sentences
 */
function splitIntoSentences(text) {
  // Handle common abbreviations and edge cases
  const prepared = text
    .replace(/Mr\./g, 'Mr\u0000')
    .replace(/Mrs\./g, 'Mrs\u0000')
    .replace(/Ms\./g, 'Ms\u0000')
    .replace(/Dr\./g, 'Dr\u0000')
    .replace(/Prof\./g, 'Prof\u0000')
    .replace(/Sr\./g, 'Sr\u0000')
    .replace(/Jr\./g, 'Jr\u0000')
    .replace(/vs\./g, 'vs\u0000')
    .replace(/etc\./g, 'etc\u0000')
    .replace(/i\.e\./g, 'ie\u0000')
    .replace(/e\.g\./g, 'eg\u0000');

  const sentences = prepared
    .split(/(?<=[.!?])\s+/)
    .map(s => s.replace(/\u0000/g, '.'))
    .filter(s => s.trim().length > 0);

  return sentences;
}

/**
 * Check if a word is too common to flag for repetition
 */
function isCommonWord(word) {
  const commonWords = [
    'the', 'and', 'that', 'have', 'for', 'not', 'with', 'you', 'this', 'but',
    'his', 'from', 'they', 'were', 'been', 'have', 'their', 'would', 'there',
    'what', 'about', 'which', 'when', 'make', 'like', 'time', 'just', 'know',
    'take', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'than',
    'then', 'look', 'only', 'come', 'over', 'such', 'also', 'back', 'after',
    'said', 'asked', 'replied', 'answered', 'thought', 'looked', 'turned'
  ];
  return commonWords.includes(word.toLowerCase());
}

/**
 * Get suggestion for replacing adverb
 */
function getAdverbSuggestion(adverb, context) {
  const suggestions = {
    'very': 'Remove or use a stronger adjective',
    'really': 'Remove or use a stronger word',
    'quickly': 'Try: rushed, darted, sprinted, bolted',
    'slowly': 'Try: crept, ambled, shuffled, trudged',
    'quietly': 'Try: whispered, murmured, muttered',
    'loudly': 'Try: shouted, bellowed, roared, thundered',
    'angrily': 'Show through actions: clenched fists, gritted teeth, flushed face',
    'sadly': 'Show through actions: slumped shoulders, downcast eyes, trembling voice',
    'happily': 'Show through actions: bright eyes, wide smile, light step',
    'suddenly': 'Often unnecessary - the action itself shows suddenness',
    'actually': 'Usually can be removed entirely',
    'basically': 'Usually can be removed entirely',
    'literally': 'Usually can be removed (or is misused)',
    'definitely': 'Consider removing or showing certainty through action'
  };

  return suggestions[adverb.toLowerCase()] || 'Consider if a stronger verb could replace this adverb.';
}

/**
 * Get suggestion for show don't tell
 */
function getShowDontTellSuggestion(phrase) {
  const emotionMatch = phrase.match(/\b(angry|sad|happy|scared|afraid|nervous|anxious|excited|worried|confused|frustrated)\b/i);

  if (emotionMatch) {
    const emotion = emotionMatch[1].toLowerCase();
    const showSuggestions = {
      'angry': 'Show: clenched jaw, narrowed eyes, flushed cheeks, sharp movements, clipped speech',
      'sad': 'Show: slumped shoulders, unfocused gaze, heavy sighs, slow movements, quiet voice',
      'happy': 'Show: bright eyes, easy smile, light step, warm tone, relaxed posture',
      'scared': 'Show: wide eyes, racing heart, shallow breathing, trembling, urge to flee',
      'afraid': 'Show: wide eyes, racing heart, shallow breathing, trembling, urge to flee',
      'nervous': 'Show: fidgeting, dry mouth, sweaty palms, darting eyes, stammering',
      'anxious': 'Show: restless movement, checking time, shallow breathing, inability to focus',
      'excited': 'Show: quick movements, bright eyes, rapid speech, inability to sit still',
      'worried': 'Show: furrowed brow, distracted gaze, lip-biting, pacing',
      'confused': 'Show: furrowed brow, tilted head, hesitation, searching gaze',
      'frustrated': 'Show: jaw tension, sharp exhale, rubbing temples, clipped words'
    };
    return showSuggestions[emotion] || 'Show through physical sensations, actions, or dialogue instead of naming the emotion.';
  }

  return 'Show through physical sensations, actions, or dialogue instead of telling directly.';
}

export default {
  analyzeProseComplete,
  analyzeProseQuick,
  detectPassiveVoice,
  detectAdverbs,
  detectFilterWords,
  detectTelling,
  detectRepetition,
  detectSentenceStarts,
  analyzeSentenceVariation
};
