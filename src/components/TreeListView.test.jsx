/**
 * TreeListView render tests — the mobile tree fallback.
 *
 * Worth testing rather than eyeballing because the whole point of this component
 * is navigability: if a relation group fails to render, or a row isn't a real
 * button, the tree becomes unreachable on a phone again — which is the exact bug
 * it exists to fix.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildRelationshipMaps } from '../utils/treeRelationshipMaps';
import TreeListView from '../components/TreeListView';

const people = [
  { id: 1, firstName: 'Baudin', lastName: 'Wilfrey', gender: 'male', dateOfBirth: '1650', dateOfDeath: '1712', houseId: 1 },
  { id: 2, firstName: 'Signa', lastName: 'Wilfrey', gender: 'female', dateOfBirth: '1652', houseId: 1 },
  { id: 4, firstName: 'Aldric', lastName: 'Wilfrey', gender: 'male', dateOfBirth: '1680', houseId: 1 },
  { id: 5, firstName: 'Elenna', lastName: 'Wilfrey', gender: 'female', dateOfBirth: '1683', houseId: 1 },
  { id: 8, firstName: 'Rosal', lastName: 'Breakmount', gender: 'female', dateOfBirth: '1682', houseId: 2 },
  { id: 9, firstName: 'Fen', lastName: 'Wilfrey', gender: 'male', dateOfBirth: '1704', houseId: 1 },
  { id: 99, firstName: 'Orphan', lastName: 'Alone', gender: 'male', houseId: 1 },
];
const houses = [
  { id: 1, houseName: 'House Wilfrey', colorCode: '#8b2c2c' },
  { id: 2, houseName: 'House Breakmount', colorCode: '#2c4a8b' },
];
const relationships = [
  { id: 1, person1Id: 1, person2Id: 2, relationshipType: 'spouse', marriageDate: '1678' },
  { id: 3, person1Id: 1, person2Id: 4, relationshipType: 'parent' },
  { id: 4, person1Id: 2, person2Id: 4, relationshipType: 'parent' },
  { id: 5, person1Id: 1, person2Id: 5, relationshipType: 'parent' },
  { id: 6, person1Id: 2, person2Id: 5, relationshipType: 'parent' },
  { id: 11, person1Id: 4, person2Id: 8, relationshipType: 'spouse', marriageDate: '1702' },
  { id: 12, person1Id: 4, person2Id: 9, relationshipType: 'parent' },
  { id: 13, person1Id: 8, person2Id: 9, relationshipType: 'parent' },
];

const maps = buildRelationshipMaps(people, houses, relationships);

function renderAt(rootPersonId, extra = {}) {
  return render(
    <TreeListView
      rootPersonId={rootPersonId}
      people={people}
      houses={houses}
      relationships={relationships}
      maps={maps}
      {...extra}
    />
  );
}

describe('TreeListView', () => {
  it('shows the focus person with their lifespan and house', () => {
    renderAt(4);
    expect(screen.getByRole('heading', { name: 'Aldric Wilfrey' })).toBeInTheDocument();
    // Aldric has a birth year but no death year, so this is "b. 1680" rather
    // than a range — the living/unknown case, which is the common one.
    expect(screen.getByText(/b\. 1680 · House Wilfrey/)).toBeInTheDocument();
  });

  it('shows a full range when both dates are known', () => {
    renderAt(1); // Baudin: 1650-1712
    expect(screen.getByRole('heading', { name: 'Baudin Wilfrey' })).toBeInTheDocument();
    expect(screen.getByText(/1650–1712/)).toBeInTheDocument();
  });

  it('renders each relation group with a count', () => {
    renderAt(4);
    expect(screen.getByText('Parents')).toBeInTheDocument();
    expect(screen.getByText('Spouse')).toBeInTheDocument();
    expect(screen.getByText('Children')).toBeInTheDocument();
    expect(screen.getByText('Siblings')).toBeInTheDocument();
  });

  it('omits groups that have no members', () => {
    renderAt(9); // Fen: has parents, no spouse, no children, no siblings
    expect(screen.getByText('Parents')).toBeInTheDocument();
    expect(screen.queryByText('Children')).not.toBeInTheDocument();
    expect(screen.queryByText('Spouse')).not.toBeInTheDocument();
  });

  it('every person row is a real button, so it is keyboard reachable', () => {
    renderAt(4);
    // The canvas equivalent is not reachable by keyboard at all.
    const parentBtn = screen.getByRole('button', { name: /Baudin Wilfrey/ });
    expect(parentBtn.tagName).toBe('BUTTON');
  });

  it('navigating to a relation moves the focus and extends the breadcrumb', async () => {
    const user = userEvent.setup();
    renderAt(4);

    await user.click(screen.getByRole('button', { name: /Baudin Wilfrey/ }));

    expect(screen.getByRole('heading', { name: 'Baudin Wilfrey' })).toBeInTheDocument();
    // Aldric is now a crumb you can walk back to.
    expect(screen.getByRole('button', { name: 'Aldric' })).toBeInTheDocument();
  });

  it('walking back to someone already on the path truncates rather than growing it', async () => {
    const user = userEvent.setup();
    renderAt(4);

    await user.click(screen.getByRole('button', { name: /Baudin Wilfrey/ }));
    await user.click(screen.getByRole('button', { name: /Aldric Wilfrey/ }));

    // Trail should be Aldric only, not Aldric > Baudin > Aldric
    const nav = screen.getByRole('navigation', { name: 'Navigation path' });
    const crumbs = within(nav).getAllByRole('listitem');
    expect(crumbs).toHaveLength(1);
  });

  it('the Back control returns to the previous person', async () => {
    const user = userEvent.setup();
    renderAt(4);

    await user.click(screen.getByRole('button', { name: /Baudin Wilfrey/ }));
    await user.click(screen.getByRole('button', { name: /Back/ }));

    expect(screen.getByRole('heading', { name: 'Aldric Wilfrey' })).toBeInTheDocument();
  });

  it('shows a marriage date on the spouse row', () => {
    renderAt(4);
    expect(screen.getByText('m. 1702')).toBeInTheDocument();
  });

  it('explains itself for a person with no relations at all', () => {
    renderAt(99);
    expect(screen.getByText(/no recorded parents, spouse, siblings or children/)).toBeInTheDocument();
  });

  it('calls onOpenPerson with the focused person', async () => {
    const user = userEvent.setup();
    const onOpenPerson = vi.fn();
    renderAt(4, { onOpenPerson });

    await user.click(screen.getByRole('button', { name: /Details/ }));
    expect(onOpenPerson).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }));
  });

  it('offers a way out when the house has nobody', () => {
    const onExit = vi.fn();
    render(
      <TreeListView
        rootPersonId={null}
        people={[]}
        houses={houses}
        relationships={[]}
        maps={buildRelationshipMaps([], houses, [])}
        onExit={onExit}
      />
    );
    expect(screen.getByText(/No one to show/)).toBeInTheDocument();
  });
});
