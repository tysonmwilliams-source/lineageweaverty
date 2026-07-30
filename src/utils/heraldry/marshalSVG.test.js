/**
 * Tests for shield division (decision C3, step 4).
 *
 * Marshalling is geometry, and wrong geometry is not a crash — it is a coat of
 * arms that renders cleanly and belongs to the wrong family. Quarter order in
 * particular is a convention, not a derivation: quarters run dexter chief,
 * sinister chief, dexter base, sinister base, and dexter is the *bearer's*
 * right, so quarter 1 is on the viewer's left. Swapping 2 and 3 is the classic
 * error and it looks entirely plausible.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  COAT_SIZE,
  PART_RECTS,
  placePart,
  marshalParts,
  renderNode
} from './marshalSVG';
import { createPlainNode, createMarshalledNode, MARSHALLING } from './compositionModel';

// A leaf renderer that just labels itself, so assertions are about placement
// rather than about heraldry.
const renderLabel = async (leaf) => `<rect data-coat="${leaf.field.tincture1}"/>`;

describe('PART_RECTS', () => {
  it('covers the whole shield with no gaps or overlaps', () => {
    for (const [arrangement, rects] of Object.entries(PART_RECTS)) {
      const area = rects.reduce((sum, r) => sum + r.width * r.height, 0);
      expect(area, `${arrangement} should tile the shield exactly`).toBe(COAT_SIZE * COAT_SIZE);
    }
  });

  it('matches the part counts the model declares', () => {
    // The model and the geometry are separate declarations of the same fact;
    // if they drift, validation passes and rendering silently drops a coat.
    for (const [arrangement, spec] of Object.entries(MARSHALLING)) {
      expect(PART_RECTS[arrangement], `${arrangement} needs rects`).toBeDefined();
      expect(PART_RECTS[arrangement]).toHaveLength(spec.parts);
    }
  });

  it('places impaled parts side by side, dexter first', () => {
    const [dexter, sinister] = PART_RECTS.impaled;
    expect(dexter.x).toBe(0);
    expect(sinister.x).toBe(100);
    expect(dexter.height).toBe(COAT_SIZE);
  });

  it('numbers quarters dexter chief, sinister chief, dexter base, sinister base', () => {
    expect(PART_RECTS.quartered.map((r) => [r.x, r.y])).toEqual([
      [0, 0],     // 1 — dexter chief, the viewer's top left
      [100, 0],   // 2 — sinister chief
      [0, 100],   // 3 — dexter base
      [100, 100]  // 4 — sinister base
    ]);
  });
});

describe('placePart', () => {
  it('squeezes a full coat into its share rather than cutting it', () => {
    // An impaled coat is compressed into its half. Clipping a full-size coat
    // instead would throw away whichever charges fell outside — visually
    // plausible and heraldically wrong.
    const placed = placePart('<rect/>', PART_RECTS.impaled[0], 'c0');
    expect(placed).toContain('transform="translate(0 0) scale(0.5 1)"');
  });

  it('translates a quarter to its own corner', () => {
    const placed = placePart('<rect/>', PART_RECTS.quartered[3], 'c3');
    expect(placed).toContain('transform="translate(100 100) scale(0.5 0.5)"');
  });

  it('clips as well as transforms', () => {
    // Charges are drawn from their centre and overflow the box, so without a
    // clip a lion in the first quarter bleeds into the second.
    const placed = placePart('<rect/>', PART_RECTS.quartered[0], 'c0');
    expect(placed).toContain('<clipPath id="c0">');
    expect(placed).toContain('clip-path="url(#c0)"');
  });

  it('keeps the part content intact', () => {
    expect(placePart('<rect data-coat="azure"/>', PART_RECTS.impaled[1], 'c1'))
      .toContain('<rect data-coat="azure"/>');
  });
});

describe('marshalParts', () => {
  it('emits every part, in order', () => {
    const out = marshalParts('quartered', ['<a/>', '<b/>', '<c/>', '<d/>']);
    expect(out.indexOf('<a/>')).toBeLessThan(out.indexOf('<b/>'));
    expect(out.indexOf('<b/>')).toBeLessThan(out.indexOf('<c/>'));
    expect(out.indexOf('<c/>')).toBeLessThan(out.indexOf('<d/>'));
  });

  it('gives every part a distinct clip id', () => {
    // Duplicate ids in one document silently make several parts share one clip,
    // which renders as missing quarters.
    const out = marshalParts('quartered', ['<a/>', '<b/>', '<c/>', '<d/>']);
    const ids = [...out.matchAll(/<clipPath id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(4);
  });

  it('namespaces ids so the same coat can appear twice on a page', () => {
    const first = marshalParts('impaled', ['<a/>', '<b/>'], 'one');
    const second = marshalParts('impaled', ['<a/>', '<b/>'], 'two');
    const idsOf = (s) => [...s.matchAll(/<clipPath id="([^"]+)"/g)].map((m) => m[1]);
    expect(idsOf(first).some((id) => idsOf(second).includes(id))).toBe(false);
  });

  it('refuses the wrong number of parts instead of drawing a half-empty shield', () => {
    expect(() => marshalParts('quartered', ['<a/>', '<b/>']))
      .toThrow(/needs exactly 4 parts, got 2/);
  });

  it('refuses an unknown arrangement', () => {
    expect(() => marshalParts('tierced', ['<a/>', '<b/>', '<c/>']))
      .toThrow(/Unknown marshalling arrangement/);
  });

  it('tolerates a part that rendered to nothing', () => {
    expect(() => marshalParts('impaled', ['<a/>', null])).not.toThrow();
  });
});

describe('renderNode', () => {
  const azure = createPlainNode({ field: { tincture1: 'azure' } });
  const gules = createPlainNode({ field: { tincture1: 'gules' } });

  it('renders a single coat with no marshalling wrapper at all', async () => {
    // Every coat stored today is one plain node, so this is the path that must
    // stay byte-identical to what the pipeline produced before step 4.
    const out = await renderNode(azure, renderLabel);
    expect(out).toBe('<rect data-coat="azure"/>');
    expect(out).not.toContain('clipPath');
  });

  it('renders an impaled marriage as two placed coats', async () => {
    const out = await renderNode(createMarshalledNode('impaled', [azure, gules]), renderLabel);
    expect(out).toContain('data-coat="azure"');
    expect(out).toContain('data-coat="gules"');
    expect(out.indexOf('azure')).toBeLessThan(out.indexOf('gules'));
  });

  it('recurses into a grand quarter', async () => {
    const inner = createMarshalledNode('quartered', [azure, gules, azure, gules]);
    const grand = createMarshalledNode('quartered', [inner, gules, gules, gules]);

    const out = await renderNode(grand, renderLabel);

    // Seven leaves: four inside quarter 1, plus quarters 2, 3 and 4.
    expect([...out.matchAll(/data-coat=/g)]).toHaveLength(7);
    // And the nested quarter is scaled twice — a quarter of a quarter.
    expect(out).toContain('scale(0.5 0.5)');
  });

  it('keeps clip ids unique through nesting', async () => {
    const inner = createMarshalledNode('quartered', [azure, gules, azure, gules]);
    const grand = createMarshalledNode('quartered', [inner, gules, gules, gules]);

    const out = await renderNode(grand, renderLabel);
    const ids = [...out.matchAll(/<clipPath id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('renders parts concurrently rather than one after another', async () => {
    // Charge fetches dominate render time; serialising four quarters would make
    // a quartered coat four times slower than the coat it replaced.
    let active = 0;
    let peak = 0;
    const slowLeaf = async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return '<rect/>';
    };

    await renderNode(createMarshalledNode('quartered', [azure, gules, azure, gules]), slowLeaf);
    expect(peak).toBeGreaterThan(1);
  });

  it('returns empty content for a missing or unknown node', async () => {
    expect(await renderNode(null, renderLabel)).toBe('');
    expect(await renderNode({ type: 'something-else' }, renderLabel)).toBe('');
  });

  it('does not call the leaf renderer for a marshalled node itself', async () => {
    const leaf = vi.fn(renderLabel);
    await renderNode(createMarshalledNode('impaled', [azure, gules]), leaf);
    expect(leaf).toHaveBeenCalledTimes(2);
  });
});
