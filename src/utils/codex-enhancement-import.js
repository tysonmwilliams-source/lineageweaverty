/**
 * CODEX ENHANCEMENT IMPORT UTILITY
 *
 * This utility provides the ability to ENHANCE existing codex entries
 * by appending new sections to their content, rather than replacing them entirely.
 *
 * USE CASE:
 * When you have new information (like "Voice of Breakmount" sections) that should
 * be added to existing entries without losing existing content.
 *
 * USAGE:
 * import { enhanceCodexEntries, WILFREY_VOICE_ENHANCEMENTS } from './codex-enhancement-import.js';
 * const results = await enhanceCodexEntries(WILFREY_VOICE_ENHANCEMENTS);
 */

import { searchEntriesByTitle, updateEntry, getAllEntries } from '../services/codexService.js';
import { logger } from './logger';

/**
 * Enhancement data structure
 * Each enhancement targets an existing entry by title and adds new content
 */
export const WILFREY_VOICE_ENHANCEMENTS = [
  {
    targetTitle: 'Breakmount Castle',
    appendSection: {
      heading: 'The Voice of Breakmount',
      content: `Breakmount Wilfreys carry the weight of leadership for the entire family. This shapes their character distinctly from the other seats:

**Character:** The weight of leadership. Breakmount Wilfreys carry the burden of the whole family's honour. They are the most formal, the most careful, the most aware of how their actions reflect on everyone.

**Voice tends toward:**
- Greatest formality of all four seats
- Longest view (thinking in generations, not seasons)
- Heaviest awareness of [[The Wilson Wound|the Wilson wound]]
- Most explicit invocation of duty and [[The Five Pillars of House Wilfrey|the Five Pillars]]

**Distinct touches:**
- References to silver, stone, the mountain
- Acute awareness of being watched and judged
- The loneliness of paramount authority - a Breakmount lord must sometimes stand apart from even their fostering brothers

*"We who hold Breakmount hold all. The weight is ours. The judgement is ours. The silence after hard decisions - that too is ours."*`
    },
    addTags: ['wilfrey-voice'],
    addToSections: {
      heading: 'The Voice of Breakmount',
      content: 'Weight of leadership, greatest formality, longest view',
      order: 10
    }
  },

  {
    targetTitle: 'Bramblehall',
    appendSection: {
      heading: 'The Voice of Bramblehall',
      content: `Bramblehall Wilfreys are the keepers of old ways. Their character differs notably from the other seats:

**Character:** Traditional, insular, rooted. Bramblehall Wilfreys are less concerned with the wider world and more concerned with doing things properly, as they have always been done.

**Voice tends toward:**
- Simpler, more direct language - fewer words, more weight
- Suspicion of novelty and outsiders
- Deep connection to the land and seasons
- Patience measured in tree-growth, not politics

**Distinct touches:**
- References to wood, forest, the old ways
- Open distrust of [[Fourhearth Castle|Fourhearth's]] cosmopolitan nature
- Pride in self-sufficiency - "We need nothing from beyond the treeline"
- Longer silences in conversation; comfort with quiet

*"The trees were here before us. They will be here after. We tend what we were given and pass it on. That is enough."*`
    },
    addTags: ['wilfrey-voice'],
    addToSections: {
      heading: 'The Voice of Bramblehall',
      content: 'Traditional, rooted, patience measured in tree-growth',
      order: 10
    }
  },

  {
    targetTitle: 'Riverhead',
    appendSection: {
      heading: 'The Voice of Riverhead',
      content: `Riverhead Wilfreys know they feed half the domain. This shapes their character:

**Character:** Strategic, abundant, leveraged. Riverhead Wilfreys are practical, somewhat political, aware of their importance and not shy about using it.

**Voice tends toward:**
- More political calculation in their speech
- Awareness of leverage and negotiation
- Practical concerns (harvest, stores, supply) woven into conversation
- Slightly more willing to push back on [[Breakmount Castle|Breakmount]] than the other seats

**Distinct touches:**
- References to water, harvest, the bridge
- Consciousness of being essential - "The silver feeds the coffers, but we feed the mouths"
- The tension between service and power; they serve the family, but the family cannot survive without them
- Blunter in council; they have earned the right to speak plainly

*"We do not ask for gratitude. We ask only that when we speak of grain and stores, you listen. The mountain's silver cannot fill an empty belly."*`
    },
    addTags: ['wilfrey-voice'],
    addToSections: {
      heading: 'The Voice of Riverhead',
      content: 'Strategic, leveraged, blunter in council',
      order: 10
    }
  },

  {
    targetTitle: 'Fourhearth Castle',
    appendSection: {
      heading: 'The Voice of Fourhearth',
      content: `Fourhearth Wilfreys look outward. They know foreign customs, speak with traders from distant lands, bring news of the wider world:

**Character:** Cosmopolitan, connected, worldly. Fourhearth Wilfreys are comfortable with strangers in ways that would make a Bramblehall Wilfrey uneasy.

**Voice tends toward:**
- Most flexible with formality - can adjust register for different audiences
- Awareness of how others see [[House Wilfrey]] from outside
- Comfort with strangers and new ideas
- Sometimes tension with [[Bramblehall]]'s insularity

**Distinct touches:**
- References to sea, ships, trade, far shores
- Comfort with foreign words and customs slipping into speech
- The burden of being where [[Lennis Wilfrey|Lennis]] ruled - Fourhearth carries the [[The Wilson Wound|Wilson history]] differently, as the seat from which he defied the council
- First to know news, last to judge - they have seen too much of the world's complexity

*"The sea teaches humility. However great we are, there is always a larger wave. However much we know, there is always another shore."*`
    },
    addTags: ['wilfrey-voice'],
    addToSections: {
      heading: 'The Voice of Fourhearth',
      content: 'Flexible, worldly, bearing Wilson\'s weight',
      order: 10
    }
  },

  {
    targetTitle: 'Baudin Wilfson',
    prependSection: {
      heading: 'How He Is Remembered',
      content: `In [[House Wilfrey]] today, Baudin is spoken of with weight and sorrow - as the cost of loyalty, never with celebration of the violence, and with recognition that both brothers were trapped by circumstance.

**The proper way to invoke his memory:**
- *"Colard did what was required. Baudin paid what was owed. We remember them both."*
- *"Even brothers may stand on different sides of duty."*
- *"Some choices leave no one whole."*

This is the [[The Wilfrey Voice|Wilfrey way]] - acknowledge the cost, honour the sacrifice, do not celebrate the violence.`
    },
    addTags: ['wilson-wound', 'wilfrey-voice'],
    addToSections: {
      heading: 'How He Is Remembered',
      content: 'With weight and sorrow, honouring the cost',
      order: 0
    }
  },

  {
    targetTitle: 'Colard Wilfson',
    prependSection: {
      heading: 'How He Is Remembered',
      content: `In [[House Wilfrey]] today, Colard is spoken of alongside his brother - never one without the other, never with celebration of the violence, always with acknowledgment that both were trapped by impossible circumstance.

**The proper way to invoke his memory:**
- *"Colard did what was required. Baudin paid what was owed. We remember them both."*
- *"Even brothers may stand on different sides of duty."*
- *"Some choices leave no one whole."*

This is the [[The Wilfrey Voice|Wilfrey way]] - acknowledge the terrible duty, do not celebrate the kinslaying, recognise that Colard too was a victim of the circumstance that trapped them both.`
    },
    addTags: ['wilson-wound', 'wilfrey-voice'],
    addToSections: {
      heading: 'How He Is Remembered',
      content: 'With the weight of terrible duty, alongside his brother',
      order: 0
    }
  },

  {
    targetTitle: 'The Fostering System',
    appendSection: {
      heading: 'The Heart of Wilfrey Unity',
      content: `The fostering system is more than administration - it is the deliberate prevention of isolation. It is what makes the Wilfreys a family beyond blood.

*"We who broke bread at [[Breakmount Castle|Breakmount]]..."*
*"My fostering brother / sister..."*
*"What the halls taught us..."*
*"The bonds forged young do not break easily."*

These phrases, heard throughout [[House Wilfrey]], speak to the system's success in creating connections that last lifetimes.

## The Lesson of Wilson

The [[The Wilson Wound|Wilson split]] is taught to every generation of fosterlings. But the lesson is not blame - it is unity:

*"This is what happens when we let one of our own stand alone. Let us be better."*

The emphasis is on the collective failure that let it come to such a choice at all. The fostering system exists precisely to prevent isolation - and when it failed to catch Lennis, Baudin, Nivette... the whole family paid the price.`
    },
    addTags: ['wilfrey-culture', 'unity'],
    addToSections: {
      heading: 'The Heart of Unity',
      content: 'Deliberate prevention of isolation; bonds beyond blood',
      order: 0
    }
  }
];

/**
 * Find an entry by exact title match
 * @param {string} title - Entry title to find
 * @param {string} datasetId - Dataset ID
 * @returns {Promise<Object|null>} - Found entry or null
 */
async function findEntryByTitle(title, datasetId) {
  const matches = await searchEntriesByTitle(title, datasetId);
  // Find exact match
  return matches.find(entry => entry.title === title) || null;
}

/**
 * Enhance existing codex entries with new content
 * @deprecated Use unifiedImport() from './unifiedImport.js' with codexEnhancements field for new imports.
 * This function is kept for backward compatibility and as the internal enhancement engine.
 * @param {Array} enhancements - Array of enhancement objects
 * @param {Object} options - Options
 * @returns {Promise<Object>} - Results of enhancement
 */
export async function enhanceCodexEntries(enhancements = WILFREY_VOICE_ENHANCEMENTS, options = {}) {
  const {
    datasetId = null,
    dryRun = false,
    onProgress = null
  } = options;

  const results = {
    enhanced: [],
    notFound: [],
    errors: [],
    skipped: []
  };

  logger.log(`📝 Starting codex enhancement (${dryRun ? 'DRY RUN' : 'LIVE'})...`);

  for (let i = 0; i < enhancements.length; i++) {
    const enhancement = enhancements[i];

    if (onProgress) {
      onProgress({
        current: enhancement.targetTitle,
        processed: i,
        total: enhancements.length
      });
    }

    try {
      // Find the existing entry
      const existingEntry = await findEntryByTitle(enhancement.targetTitle, datasetId);

      if (!existingEntry) {
        logger.warn(`⚠️ Entry not found: "${enhancement.targetTitle}"`);
        results.notFound.push(enhancement.targetTitle);
        continue;
      }

      // Check if enhancement already applied (look for the heading in content)
      const sectionHeading = enhancement.appendSection?.heading || enhancement.prependSection?.heading;
      if (sectionHeading && existingEntry.content.includes(`## ${sectionHeading}`)) {
        logger.log(`⏭️ Already enhanced: "${enhancement.targetTitle}"`);
        results.skipped.push({
          title: enhancement.targetTitle,
          reason: `Section "${sectionHeading}" already exists`
        });
        continue;
      }

      // Build the updated content
      let newContent = existingEntry.content;

      if (enhancement.prependSection) {
        // Add new section at the beginning (after first paragraph)
        const firstParagraphEnd = newContent.indexOf('\n\n');
        if (firstParagraphEnd > 0) {
          const before = newContent.substring(0, firstParagraphEnd);
          const after = newContent.substring(firstParagraphEnd);
          newContent = `${before}\n\n## ${enhancement.prependSection.heading}\n\n${enhancement.prependSection.content}${after}`;
        } else {
          newContent = `${newContent}\n\n## ${enhancement.prependSection.heading}\n\n${enhancement.prependSection.content}`;
        }
      }

      if (enhancement.appendSection) {
        // Add new section at the end
        newContent = `${newContent}\n\n## ${enhancement.appendSection.heading}\n\n${enhancement.appendSection.content}`;
      }

      // Build updated sections array
      let newSections = [...(existingEntry.sections || [])];
      if (enhancement.addToSections) {
        newSections.push(enhancement.addToSections);
        // Re-sort by order
        newSections.sort((a, b) => (a.order || 0) - (b.order || 0));
      }

      // Build updated tags
      let newTags = [...(existingEntry.tags || [])];
      if (enhancement.addTags) {
        for (const tag of enhancement.addTags) {
          if (!newTags.includes(tag)) {
            newTags.push(tag);
          }
        }
      }

      // Prepare updates
      const updates = {
        content: newContent,
        sections: newSections,
        tags: newTags
      };

      if (dryRun) {
        logger.log(`🔍 Would enhance: "${enhancement.targetTitle}"`);
        logger.log(`   - Adding section: ${sectionHeading}`);
        logger.log(`   - New tags: ${enhancement.addTags?.join(', ') || 'none'}`);
        results.enhanced.push({
          title: enhancement.targetTitle,
          id: existingEntry.id,
          dryRun: true
        });
      } else {
        // Apply the update
        await updateEntry(existingEntry.id, updates, datasetId);
        logger.log(`✅ Enhanced: "${enhancement.targetTitle}"`);
        results.enhanced.push({
          title: enhancement.targetTitle,
          id: existingEntry.id,
          section: sectionHeading
        });
      }

    } catch (error) {
      logger.error(`❌ Error enhancing "${enhancement.targetTitle}":`, error);
      results.errors.push({
        title: enhancement.targetTitle,
        error: error.message
      });
    }
  }

  logger.log(`\n📊 Enhancement complete:`);
  logger.log(`   ✅ Enhanced: ${results.enhanced.length}`);
  logger.log(`   ⏭️ Skipped: ${results.skipped.length}`);
  logger.log(`   ⚠️ Not found: ${results.notFound.length}`);
  logger.log(`   ❌ Errors: ${results.errors.length}`);

  return results;
}

/**
 * Preview enhancements without applying them
 * @param {Array} enhancements - Enhancement data
 * @param {string} datasetId - Dataset ID
 * @returns {Promise<Object>} - Preview results
 */
export async function previewEnhancements(enhancements = WILFREY_VOICE_ENHANCEMENTS, datasetId = null) {
  return enhanceCodexEntries(enhancements, { datasetId, dryRun: true });
}

export default {
  enhanceCodexEntries,
  previewEnhancements,
  WILFREY_VOICE_ENHANCEMENTS
};
