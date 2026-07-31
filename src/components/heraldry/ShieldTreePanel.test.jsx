/**
 * Tests for the marshalling panel (decision C3, step 5d).
 *
 * This panel is the only place in the app that can destroy a coat of arms — it
 * divides a shield and collapses it again — so the tests concentrate on what
 * happens to the user's work rather than on markup.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ShieldTreePanel from './ShieldTreePanel';
import { createPlainNode, createMarshalledNode } from '../../utils/heraldry';

const leaf = (t) => createPlainNode({ field: { tincture1: t } });

function setup({
  root = leaf('murrey'),
  selectedPath = [],
  section = 'marshalling',
  canUndo = false,
  canRedo = false
} = {}) {
  const onSelectPath = vi.fn();
  const onChangeNode = vi.fn();
  const onSectionChange = vi.fn();
  const onMashCoat = vi.fn();
  const onUndo = vi.fn();
  const onRedo = vi.fn();
  render(
    <ShieldTreePanel
      root={root}
      selectedPath={selectedPath}
      onSelectPath={onSelectPath}
      onChangeNode={onChangeNode}
      onMashCoat={onMashCoat}
      activeSection={section}
      onSectionChange={onSectionChange}
      onUndo={onUndo}
      onRedo={onRedo}
      canUndo={canUndo}
      canRedo={canRedo}
    />
  );
  return { onSelectPath, onChangeNode, onSectionChange, onMashCoat, onUndo, onRedo };
}

describe('ShieldTreePanel — an undivided shield', () => {
  it('offers both arrangements', () => {
    setup();
    expect(screen.getByText('A single undivided coat.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Impaled' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quartered' })).toBeInTheDocument();
  });

  it('divides, keeping the existing coat as the first part', async () => {
    const { onChangeNode } = setup({ root: leaf('murrey') });
    await userEvent.click(screen.getByRole('button', { name: 'Quartered' }));

    const [next] = onChangeNode.mock.calls[0];
    expect(next.type).toBe('marshalled');
    expect(next.parts).toHaveLength(4);
    expect(next.parts[0].field.tincture1).toBe('murrey');
  });

  it('follows the user into the coat they were drawing', async () => {
    // Dividing moves their work into part 0. Leaving the selection on the new
    // marshalled node would show them an editor-less panel for no reason.
    const { onSelectPath } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Impaled' }));
    expect(onSelectPath).toHaveBeenCalledWith([0]);
  });

  it('offers no undivide control — there is nothing to collapse', () => {
    setup();
    expect(screen.queryByRole('button', { name: /undivide/i })).not.toBeInTheDocument();
  });
});

describe('ShieldTreePanel — a divided shield', () => {
  const impaled = () => createMarshalledNode('impaled', [leaf('azure'), leaf('gules')]);
  const quartered = () =>
    createMarshalledNode('quartered', [leaf('a'), leaf('b'), leaf('c'), leaf('d')]);

  it('names impaled parts by side and quartered parts by number', () => {
    setup({ root: impaled() });
    expect(screen.getByText('Dexter half')).toBeInTheDocument();
    expect(screen.getByText('Sinister half')).toBeInTheDocument();
  });

  it('selects a part when it is clicked', async () => {
    const { onSelectPath } = setup({ root: quartered() });
    await userEvent.click(screen.getByText('Quarter 3'));
    expect(onSelectPath).toHaveBeenCalledWith([2]);
  });

  it('says which parts are themselves divided', () => {
    const nested = createMarshalledNode('quartered', [
      impaled(), leaf('b'), leaf('c'), leaf('d')
    ]);
    setup({ root: nested });
    expect(screen.getByText('Impaled')).toBeInTheDocument();
    expect(screen.getAllByText('single coat')).toHaveLength(3);
  });

  describe('undividing', () => {
    it('does not collapse on the first click', async () => {
      const { onChangeNode } = setup({ root: quartered() });
      await userEvent.click(screen.getByRole('button', { name: /undivide/i }));
      expect(onChangeNode).not.toHaveBeenCalled();
    });

    it('says how many coats would be discarded', async () => {
      setup({ root: quartered() });
      await userEvent.click(screen.getByRole('button', { name: /undivide/i }));
      expect(screen.getByText(/3 coats will be discarded/i)).toBeInTheDocument();
    });

    it('counts everything inside a nested part, not just the parts', async () => {
      // Understating the loss is the dangerous direction — this shield holds
      // seven coats, and collapsing it keeps only the first.
      const nested = createMarshalledNode('quartered', [
        leaf('x'), quartered(), leaf('y'), leaf('z')
      ]);
      setup({ root: nested });
      await userEvent.click(screen.getByRole('button', { name: /undivide/i }));
      expect(screen.getByText(/6 coats will be discarded/i)).toBeInTheDocument();
    });

    it('uses the singular for one coat', async () => {
      setup({ root: impaled() });
      await userEvent.click(screen.getByRole('button', { name: /undivide/i }));
      expect(screen.getByText(/1 coat will be discarded/i)).toBeInTheDocument();
    });

    it('collapses to the first part once confirmed', async () => {
      const { onChangeNode } = setup({ root: impaled() });
      await userEvent.click(screen.getByRole('button', { name: /undivide/i }));
      await userEvent.click(screen.getByRole('button', { name: /yes, undivide/i }));

      const [next] = onChangeNode.mock.calls[0];
      expect(next.type).toBe('plain');
      expect(next.field.tincture1).toBe('azure');
    });

    it('backs out on cancel', async () => {
      const { onChangeNode } = setup({ root: impaled() });
      await userEvent.click(screen.getByRole('button', { name: /undivide/i }));
      await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onChangeNode).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /^undivide$/i })).toBeInTheDocument();
    });
  });
});

describe('ShieldTreePanel — navigating', () => {
  const nested = () => createMarshalledNode('quartered', [
    createMarshalledNode('impaled', [leaf('azure'), leaf('gules')]),
    leaf('b'), leaf('c'), leaf('d')
  ]);

  it('shows no breadcrumb at the root, where there is nowhere to go back to', () => {
    setup({ root: nested(), selectedPath: [] });
    expect(screen.queryByText('Whole shield')).not.toBeInTheDocument();
  });

  it('shows the trail once inside a part', () => {
    setup({ root: nested(), selectedPath: [0, 1] });
    expect(screen.getByRole('button', { name: 'Whole shield' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quarter 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sinister half' })).toBeInTheDocument();
  });

  it('navigates back up when a crumb is clicked', async () => {
    const { onSelectPath } = setup({ root: nested(), selectedPath: [0, 1] });
    await userEvent.click(screen.getByRole('button', { name: 'Whole shield' }));
    expect(onSelectPath).toHaveBeenCalledWith([]);
  });

  it('offers to divide a part that is a single coat', () => {
    setup({ root: nested(), selectedPath: [1] });
    expect(screen.getByText('This part is a single coat.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quartered' })).toBeInTheDocument();
  });

  it('stops offering to divide at the nesting limit', () => {
    // The control is disabled rather than allowed to build something that then
    // fails validation on save.
    setup({ root: leaf('azure'), selectedPath: [0, 0, 0] });
    expect(screen.getByText(/as deeply nested as the renderer supports/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Impaled' })).not.toBeInTheDocument();
  });
});

describe('ShieldTreePanel — collapsed', () => {
  it('renders only its heading', () => {
    setup({ section: '' });
    expect(screen.queryByRole('button', { name: 'Impaled' })).not.toBeInTheDocument();
    expect(screen.getByText('Marshalling')).toBeInTheDocument();
  });
});


describe('ShieldTreePanel — undo', () => {
  it('disables both controls when there is no history', () => {
    setup();
    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /redo/i })).toBeDisabled();
  });

  it('calls back when there is something to undo', async () => {
    const { onUndo } = setup({ canUndo: true });
    await userEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(onUndo).toHaveBeenCalled();
  });

  it('calls back when there is something to redo', async () => {
    const { onRedo } = setup({ canRedo: true });
    await userEvent.click(screen.getByRole('button', { name: /redo/i }));
    expect(onRedo).toHaveBeenCalled();
  });
});

describe("ShieldTreePanel — combining another house's arms", () => {
  const impaled = () => createMarshalledNode('impaled', [leaf('azure'), leaf('gules')]);

  it('offers to fill each part from a house', () => {
    setup({ root: impaled() });
    expect(screen.getAllByRole('button', { name: /use a house's arms/i })).toHaveLength(2);
  });

  it('reports which part is to be filled', async () => {
    // The marriage case: the sinister half is the spouse's side, so the path
    // handed back has to be the part that was clicked, not the selection.
    const { onMashCoat } = setup({ root: impaled(), selectedPath: [] });
    const buttons = screen.getAllByRole('button', { name: /use a house's arms/i });

    await userEvent.click(buttons[1]);
    expect(onMashCoat).toHaveBeenCalledWith([1]);
  });

  it('does not change the selection as a side effect of asking', async () => {
    const { onMashCoat, onSelectPath } = setup({ root: impaled() });
    await userEvent.click(screen.getAllByRole('button', { name: /use a house's arms/i })[0]);

    expect(onMashCoat).toHaveBeenCalledWith([0]);
    expect(onSelectPath).not.toHaveBeenCalled();
  });

  it('offers it for a nested single coat too', async () => {
    const nested = createMarshalledNode('quartered', [impaled(), leaf('b'), leaf('c'), leaf('d')]);
    const { onMashCoat } = setup({ root: nested, selectedPath: [0, 1] });

    await userEvent.click(screen.getByRole('button', { name: /use another house's arms here/i }));
    expect(onMashCoat).toHaveBeenCalledWith([0, 1]);
  });

  it('does not offer it for the whole shield, where there is nothing to combine with', () => {
    setup({ root: leaf('azure'), selectedPath: [] });
    expect(screen.queryByRole('button', { name: /use another house's arms here/i })).not.toBeInTheDocument();
  });
});
