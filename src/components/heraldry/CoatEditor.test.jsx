/**
 * Tests for the extracted coat editor (decision C3, step 5).
 *
 * This UI had no coverage at all, and the extraction changed the one thing most
 * likely to break quietly: how an edit is applied. It used to call three
 * setters on page state; it now returns a whole new node to a caller. A mutator
 * that accidentally mutates its input instead of replacing it still *looks*
 * correct in React until something memoises — and then edits stop appearing.
 *
 * So these assert two things throughout: the right node comes out, and the
 * node that went in is untouched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The cards are heavy (the charge library is thousands of entries) and are not
// what this file tests. Each stub exposes the callbacks so the editor's own
// list logic can be driven directly.
vi.mock('./OrdinaryCard', () => ({
  default: ({ ordinary, index, onUpdate, onRemove, onDuplicate, onToggleVisibility, onMoveUp, onMoveDown }) => (
    <div data-testid={`ordinary-${index}`} data-type={ordinary.type} data-visible={String(ordinary.visible)}>
      <button onClick={() => onUpdate(index, { tincture: 'sable' })}>update-{index}</button>
      <button onClick={() => onRemove(index)}>remove-{index}</button>
      <button onClick={() => onDuplicate(index)}>duplicate-{index}</button>
      <button onClick={() => onToggleVisibility(index)}>toggle-{index}</button>
      <button onClick={() => onMoveUp(index)}>up-{index}</button>
      <button onClick={() => onMoveDown(index)}>down-{index}</button>
    </div>
  )
}));

vi.mock('./ChargeCard', () => ({
  default: ({ charge, index, onRemove, onToggleVisibility }) => (
    <div data-testid={`charge-${index}`} data-id={charge.chargeId} data-visible={String(charge.visible)}>
      <button onClick={() => onRemove(index)}>remove-charge-{index}</button>
      <button onClick={() => onToggleVisibility(index)}>toggle-charge-{index}</button>
    </div>
  )
}));

const { default: CoatEditor } = await import('./CoatEditor');

const baseNode = () => ({
  type: 'plain',
  field: {
    division: 'perPale',
    tincture1: 'azure',
    tincture2: 'or',
    tincture3: 'gules',
    lineStyle: 'straight',
    count: 6,
    inverted: false
  },
  ordinaries: [{ type: 'chief', tincture: 'or', visible: true }],
  charges: [{ chargeId: 'lion4', tincture: 'gules', visible: true }]
});

let onChange;
let onSectionChange;

function renderEditor(section = 'field', node = baseNode()) {
  onChange = vi.fn();
  onSectionChange = vi.fn();
  const result = render(
    <CoatEditor
      node={node}
      onChange={onChange}
      activeSection={section}
      onSectionChange={onSectionChange}
    />
  );
  return { ...result, node };
}

beforeEach(() => {
  onChange = undefined;
  onSectionChange = undefined;
});

describe('CoatEditor — editing the field', () => {
  it('returns a new node with the division changed and everything else intact', async () => {
    const { node } = renderEditor('field');
    const before = structuredClone(node);

    await userEvent.click(screen.getByTitle(/four quarters/i));

    const [next] = onChange.mock.calls[0];
    expect(next.field.division).toBe('quarterly');
    expect(next.field.tincture1).toBe('azure');
    expect(next.ordinaries).toEqual(node.ordinaries);
    expect(next.charges).toEqual(node.charges);
    // The input must be untouched — a mutating edit survives React until
    // something memoises, and then edits silently stop appearing.
    expect(node).toEqual(before);
  });

  it('hides the secondary tincture on a plain field', () => {
    const plain = { ...baseNode(), field: { ...baseNode().field, division: 'plain' } };
    renderEditor('field', plain);
    expect(screen.queryByText('Secondary Tincture')).not.toBeInTheDocument();
  });

  it('offers no third tincture on an ordinary two-part division', () => {
    renderEditor('field');
    expect(screen.queryByText('Tertiary Tincture')).not.toBeInTheDocument();
  });

  it('offers a third tincture for a tierced division', () => {
    const tierced = { ...baseNode(), field: { ...baseNode().field, division: 'tiercedPale' } };
    renderEditor('field', tierced);
    expect(screen.getByText('Tertiary Tincture')).toBeInTheDocument();
  });

  it('renders nothing of the field body when the section is collapsed', () => {
    renderEditor('');
    expect(screen.queryByText('Field Settings')).not.toBeInTheDocument();
  });

  it('asks the caller to change section rather than deciding itself', async () => {
    renderEditor('');
    await userEvent.click(screen.getByText(/Field \(Base Layer\)/));
    expect(onSectionChange).toHaveBeenCalledWith('field');
  });
});

describe('CoatEditor — ordinaries', () => {
  it('adds one without disturbing the field or charges', async () => {
    const { node } = renderEditor('ordinaries');
    const before = structuredClone(node);

    await userEvent.click(screen.getByText('+ Add Ordinary'));

    const [next] = onChange.mock.calls[0];
    expect(next.ordinaries).toHaveLength(2);
    expect(next.field).toEqual(node.field);
    expect(node).toEqual(before);
  });

  it('stops at three, and hides the button rather than failing silently', () => {
    const full = { ...baseNode(), ordinaries: [{ type: 'chief' }, { type: 'fess' }, { type: 'pale' }] };
    renderEditor('ordinaries', full);
    expect(screen.queryByText('+ Add Ordinary')).not.toBeInTheDocument();
    expect(screen.getByText('▬ Ordinaries (3/3)')).toBeInTheDocument();
  });

  it('removes by index', async () => {
    const two = { ...baseNode(), ordinaries: [{ type: 'chief' }, { type: 'fess' }] };
    renderEditor('ordinaries', two);

    await userEvent.click(screen.getByText('remove-0'));
    expect(onChange.mock.calls[0][0].ordinaries).toEqual([{ type: 'fess' }]);
  });

  it('reorders without losing an entry', async () => {
    const two = { ...baseNode(), ordinaries: [{ type: 'chief' }, { type: 'fess' }] };
    const { node } = renderEditor('ordinaries', two);
    const before = structuredClone(node);

    await userEvent.click(screen.getByText('down-0'));

    expect(onChange.mock.calls[0][0].ordinaries).toEqual([{ type: 'fess' }, { type: 'chief' }]);
    expect(node).toEqual(before);
  });

  it('ignores a move that would run off either end', async () => {
    const two = { ...baseNode(), ordinaries: [{ type: 'chief' }, { type: 'fess' }] };
    renderEditor('ordinaries', two);

    await userEvent.click(screen.getByText('up-0'));
    await userEvent.click(screen.getByText('down-1'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('inserts a duplicate directly after its original', async () => {
    const two = { ...baseNode(), ordinaries: [{ type: 'chief' }, { type: 'fess' }] };
    renderEditor('ordinaries', two);

    await userEvent.click(screen.getByText('duplicate-0'));
    expect(onChange.mock.calls[0][0].ordinaries.map((o) => o.type))
      .toEqual(['chief', 'chief', 'fess']);
  });

  describe('visibility', () => {
    // `visible` is read as `!== false` everywhere, so an absent flag means
    // visible. The toggle has to hide such an item, not reveal it.
    it('hides an item that was visible', async () => {
      renderEditor('ordinaries');
      await userEvent.click(screen.getByText('toggle-0'));
      expect(onChange.mock.calls[0][0].ordinaries[0].visible).toBe(false);
    });

    it('hides an item that had no flag at all', async () => {
      const noFlag = { ...baseNode(), ordinaries: [{ type: 'chief' }] };
      renderEditor('ordinaries', noFlag);
      await userEvent.click(screen.getByText('toggle-0'));
      expect(onChange.mock.calls[0][0].ordinaries[0].visible).toBe(false);
    });

    it('shows an item that was hidden', async () => {
      const hidden = { ...baseNode(), ordinaries: [{ type: 'chief', visible: false }] };
      renderEditor('ordinaries', hidden);
      await userEvent.click(screen.getByText('toggle-0'));
      expect(onChange.mock.calls[0][0].ordinaries[0].visible).toBe(true);
    });
  });
});

describe('CoatEditor — charges', () => {
  it('adds one', async () => {
    renderEditor('charges');
    await userEvent.click(screen.getByText('+ Add Charge'));
    expect(onChange.mock.calls[0][0].charges).toHaveLength(2);
  });

  it('stops at three, hiding the button rather than failing silently', () => {
    const full = { ...baseNode(), charges: [{ chargeId: 'a' }, { chargeId: 'b' }, { chargeId: 'c' }] };
    renderEditor('charges', full);
    expect(screen.queryByText('+ Add Charge')).not.toBeInTheDocument();
  });

  it('removes without touching the ordinaries', async () => {
    const { node } = renderEditor('charges');
    await userEvent.click(screen.getByText('remove-charge-0'));

    const [next] = onChange.mock.calls[0];
    expect(next.charges).toEqual([]);
    expect(next.ordinaries).toEqual(node.ordinaries);
  });

  it('toggles visibility the same way ordinaries do', async () => {
    renderEditor('charges');
    await userEvent.click(screen.getByText('toggle-charge-0'));
    expect(onChange.mock.calls[0][0].charges[0].visible).toBe(false);
  });
});

describe('CoatEditor — it edits whatever node it is given', () => {
  it('is not tied to a page-level coat', async () => {
    // The entire point of the extraction: point it at a quarter and it edits
    // that quarter. Nothing here knows about HeraldryCreator's state.
    const quarter = {
      type: 'plain',
      field: { division: 'plain', tincture1: 'vert', tincture2: 'or', lineStyle: 'straight', count: 6, inverted: false },
      ordinaries: [],
      charges: []
    };
    renderEditor('ordinaries', quarter);

    await userEvent.click(screen.getByText('+ Add Ordinary'));

    const [next] = onChange.mock.calls[0];
    expect(next.field.tincture1).toBe('vert');
    expect(next.ordinaries).toHaveLength(1);
    expect(next.type).toBe('plain');
  });
});
