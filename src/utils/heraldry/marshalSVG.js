/**
 * Dividing a shield between two or more coats (decision C3, step 4).
 *
 * The existing pipeline renders one coat as SVG fragments on a 200×200 space —
 * a field rect, then ordinaries, then charges. Marshalling composes several of
 * those into one shield, so this module works at exactly that seam: give it the
 * rendered content of each part and it returns the content of the whole.
 *
 * It knows nothing about fields, ordinaries or charges. That is deliberate —
 * it means marshalling does not have to be taught every time the leaf renderer
 * learns a new charge type, and it can be tested without the charge library.
 *
 * On squeezing rather than cutting: an impaled coat is drawn *compressed* into
 * its half, not sliced down the middle with half the charges lost. Each part is
 * therefore rendered full-size and then transformed into its share of the
 * shield, which is also what the shield mask already does when it fits a square
 * design to a shield outline.
 */

/** The coordinate space every leaf renders into. */
export const COAT_SIZE = 200;

/**
 * Where each part sits, in heraldic order.
 *
 * Quarters are numbered dexter chief, sinister chief, dexter base, sinister
 * base — and dexter is the *bearer's* right, so quarter 1 is on the viewer's
 * left. Getting this order wrong draws a real coat of arms for the wrong
 * family, which is why it is a table rather than arithmetic.
 */
export const PART_RECTS = {
  impaled: [
    { x: 0, y: 0, width: 100, height: 200 },
    { x: 100, y: 0, width: 100, height: 200 }
  ],
  quartered: [
    { x: 0, y: 0, width: 100, height: 100 },
    { x: 100, y: 0, width: 100, height: 100 },
    { x: 0, y: 100, width: 100, height: 100 },
    { x: 100, y: 100, width: 100, height: 100 }
  ]
};

/**
 * Place one part's rendered content into its share of the shield.
 *
 * The clip is not redundant with the transform: charges are drawn from their
 * own centre and routinely overflow the 200×200 box slightly, so without it a
 * lion in the first quarter bleeds into the second.
 *
 * @param {string} content   SVG fragments on a 200×200 space.
 * @param {Object} rect      Destination rect within the 200×200 shield.
 * @param {string} clipId    Unique id for this part's clip path.
 */
export function placePart(content, rect, clipId) {
  const scaleX = rect.width / COAT_SIZE;
  const scaleY = rect.height / COAT_SIZE;

  return (
    `<clipPath id="${clipId}">` +
      `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"/>` +
    `</clipPath>` +
    `<g clip-path="url(#${clipId})">` +
      `<g transform="translate(${rect.x} ${rect.y}) scale(${scaleX} ${scaleY})">${content}</g>` +
    `</g>`
  );
}

/**
 * Compose already-rendered parts into one shield.
 *
 * @param {string}   arrangement  'impaled' or 'quartered'.
 * @param {string[]} parts        Rendered content, one per part, in heraldic order.
 * @param {string}   [idPrefix]   Namespace for clip ids. Ids must be unique
 *                                within a document, and a marshalled coat can
 *                                appear several times on one page, so callers
 *                                nesting these must vary it.
 */
export function marshalParts(arrangement, parts, idPrefix = 'lw-marshal') {
  const rects = PART_RECTS[arrangement];

  if (!rects) {
    throw new Error(`Unknown marshalling arrangement "${arrangement}"`);
  }
  if (parts.length !== rects.length) {
    throw new Error(
      `${arrangement} needs exactly ${rects.length} parts, got ${parts.length}`
    );
  }

  return parts
    .map((content, i) => placePart(content ?? '', rects[i], `${idPrefix}-${arrangement}-${i}`))
    .join('');
}

/**
 * Render a composition node to SVG content, recursing through marshalling.
 *
 * `renderLeaf` is the existing single-coat renderer, passed in rather than
 * imported: it lives in HeraldryCreator, it is async, and it depends on the
 * charge library. Injecting it keeps this module pure and testable, and means
 * any surface with its own leaf renderer — a thumbnail, an export — can reuse
 * the marshalling without inheriting the creator's dependencies.
 *
 * @param {Object}   node        A `plain` or `marshalled` node.
 * @param {Function} renderLeaf  async (plainNode) => SVG content string.
 * @param {string}   [idPrefix]  Namespace for clip ids.
 */
export async function renderNode(node, renderLeaf, idPrefix = 'lw-marshal') {
  if (!node) return '';

  if (node.type === 'plain') {
    return renderLeaf(node);
  }

  if (node.type === 'marshalled') {
    // Rendered in parallel — each part is an independent set of async charge
    // fetches, and a quartered coat would otherwise take four times as long as
    // the single coat it replaced.
    const parts = await Promise.all(
      (node.parts || []).map((part, i) =>
        renderNode(part, renderLeaf, `${idPrefix}-${i}`)
      )
    );
    return marshalParts(node.arrangement, parts, idPrefix);
  }

  return '';
}
