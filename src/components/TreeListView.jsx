/**
 * TreeListView — the family tree as a navigable list.
 *
 * The alternative to the D3 canvas below the phone breakpoint. Pan-and-zoom on a
 * 375px viewport is not a usable way to read a genealogy: a person card is 150px
 * wide, so two cards and a marriage line already exceed the screen, and finding
 * anything means dragging blind.
 *
 * So this is not a restyled tree. It is a different model of the same data:
 * one person in focus, their immediate family around them, and you walk the tree
 * one step at a time. A breadcrumb records the path so you can walk back up —
 * which is the thing a list view normally loses and the reason "just show a flat
 * list of people" isn't a substitute.
 *
 * It renders instead of the canvas rather than alongside it, so D3 never mounts
 * and never runs a layout on the device least able to afford it.
 */

import { useCallback, useMemo, useState } from 'react';
import Icon from './icons';
import { getPersonRelations, parentLabel } from '../utils/personRelations';
import './TreeListView.css';

/** "1683–1741", "b. 1683", "d. 1741", or nothing. */
function lifespan(person) {
  const born = person?.dateOfBirth;
  const died = person?.dateOfDeath;
  if (born && died) return `${born}–${died}`;
  if (born) return `b. ${born}`;
  if (died) return `d. ${died}`;
  return '';
}

function fullName(person) {
  return `${person?.firstName || ''} ${person?.lastName || ''}`.trim() || 'Unnamed';
}

/**
 * One tappable person row.
 *
 * A button rather than a div with onClick, so it is reachable by keyboard and
 * announced as actionable — the canvas equivalent is not reachable at all.
 */
function PersonRow({ person, house, note, onSelect }) {
  return (
    <li className="tree-list__row">
      <button
        type="button"
        className="tree-list__row-btn"
        onClick={() => onSelect(person.id)}
      >
        <span
          className="tree-list__swatch"
          style={{ background: house?.colorCode || 'var(--border-primary)' }}
          aria-hidden="true"
        />
        <span className="tree-list__row-text">
          <span className="tree-list__row-name">{fullName(person)}</span>
          <span className="tree-list__row-meta">
            {note && <span className="tree-list__row-note">{note}</span>}
            {lifespan(person) && <span>{lifespan(person)}</span>}
            {house && <span>{house.houseName}</span>}
          </span>
        </span>
        <Icon name="chevron-right" size={16} className="tree-list__row-chevron" />
      </button>
    </li>
  );
}

/** A titled group of person rows, rendered only when it has members. */
function RelationGroup({ title, ids, peopleById, housesById, noteFor, onSelect }) {
  if (!ids || ids.length === 0) return null;

  return (
    <section className="tree-list__group">
      <h3 className="tree-list__group-title">
        {title}
        <span className="tree-list__group-count">{ids.length}</span>
      </h3>
      <ul className="tree-list__rows">
        {ids.map(id => {
          const person = peopleById.get(id);
          if (!person) return null;
          return (
            <PersonRow
              key={id}
              person={person}
              house={housesById.get(person.houseId)}
              note={noteFor ? noteFor(person, id) : null}
              onSelect={onSelect}
            />
          );
        })}
      </ul>
    </section>
  );
}

export default function TreeListView({
  rootPersonId,
  people,
  houses,
  relationships,
  maps,
  onOpenPerson,
  onExit
}) {
  // The walked path. Last entry is in focus; earlier entries are the way back.
  const [trail, setTrail] = useState(() => (rootPersonId ? [rootPersonId] : []));

  const focusId = trail[trail.length - 1] ?? rootPersonId ?? people[0]?.id ?? null;

  const relations = useMemo(
    () => (focusId == null ? null : getPersonRelations(focusId, maps, relationships)),
    [focusId, maps, relationships]
  );

  const step = useCallback((personId) => {
    setTrail(prev => {
      // Stepping back to someone already on the path truncates rather than
      // extending it, so walking A→B→A→B doesn't grow an endless breadcrumb.
      const existing = prev.indexOf(personId);
      if (existing !== -1) return prev.slice(0, existing + 1);
      return [...prev, personId];
    });
  }, []);

  const back = useCallback(() => {
    setTrail(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  if (!relations) {
    return (
      <div className="tree-list">
        <div className="tree-list__empty">
          <Icon name="users" size={32} />
          <p>No one to show in this house yet.</p>
          {onExit && (
            <button type="button" className="tree-list__exit" onClick={onExit}>
              Choose another house
            </button>
          )}
        </div>
      </div>
    );
  }

  const { person, parents, spouses, siblings, halfSiblings, children, isIsolated } = relations;
  const house = maps.housesById.get(person.houseId);

  return (
    <div className="tree-list">
      {/* Breadcrumb — the path walked, so you can get back up the tree. */}
      <nav className="tree-list__trail" aria-label="Navigation path">
        {onExit && (
          <button type="button" className="tree-list__trail-exit" onClick={onExit}>
            <Icon name="arrow-left" size={14} />
            Houses
          </button>
        )}
        {trail.length > 1 && (
          <button type="button" className="tree-list__trail-back" onClick={back}>
            <Icon name="chevron-left" size={14} />
            Back
          </button>
        )}
        <ol className="tree-list__crumbs">
          {trail.map((id, i) => {
            const p = maps.peopleById.get(id);
            if (!p) return null;
            const isLast = i === trail.length - 1;
            return (
              <li key={`${id}-${i}`} className="tree-list__crumb">
                {isLast ? (
                  <span aria-current="page">{p.firstName}</span>
                ) : (
                  <button type="button" onClick={() => step(id)}>{p.firstName}</button>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* The person in focus */}
      <header className="tree-list__focus">
        <span
          className="tree-list__focus-swatch"
          style={{ background: house?.colorCode || 'var(--border-primary)' }}
          aria-hidden="true"
        />
        <div className="tree-list__focus-text">
          <h2 className="tree-list__focus-name">{fullName(person)}</h2>
          <p className="tree-list__focus-meta">
            {[lifespan(person), house?.houseName].filter(Boolean).join(' · ')}
          </p>
        </div>
        {onOpenPerson && (
          <button
            type="button"
            className="tree-list__focus-open"
            onClick={() => onOpenPerson(person)}
          >
            <Icon name="pencil" size={14} />
            Details
          </button>
        )}
      </header>

      {isIsolated ? (
        <p className="tree-list__isolated">
          {person.firstName} has no recorded parents, spouse, siblings or children —
          so there is nowhere to navigate from here. This is one of the people the
          tree can&rsquo;t place.
        </p>
      ) : (
        <>
          <RelationGroup
            title="Parents"
            ids={parents}
            peopleById={maps.peopleById}
            housesById={maps.housesById}
            noteFor={(p) => parentLabel(p)}
            onSelect={step}
          />

          {/* Spouses carry their marriage date, and there may be more than one —
              the canvas can only draw a single spouse (decision C6). */}
          {spouses.length > 0 && (
            <section className="tree-list__group">
              <h3 className="tree-list__group-title">
                {spouses.length === 1 ? 'Spouse' : 'Spouses'}
                <span className="tree-list__group-count">{spouses.length}</span>
              </h3>
              <ul className="tree-list__rows">
                {spouses.map(({ id, relationship }) => {
                  const sp = maps.peopleById.get(id);
                  if (!sp) return null;
                  const note = relationship?.divorceDate
                    ? `divorced ${relationship.divorceDate}`
                    : relationship?.marriageDate
                      ? `m. ${relationship.marriageDate}`
                      : null;
                  return (
                    <PersonRow
                      key={id}
                      person={sp}
                      house={maps.housesById.get(sp.houseId)}
                      note={note}
                      onSelect={step}
                    />
                  );
                })}
              </ul>
            </section>
          )}

          <RelationGroup
            title="Children"
            ids={children}
            peopleById={maps.peopleById}
            housesById={maps.housesById}
            noteFor={(p) => (p.legitimacyStatus === 'bastard' ? 'natural child' : null)}
            onSelect={step}
          />

          <RelationGroup
            title="Siblings"
            ids={siblings}
            peopleById={maps.peopleById}
            housesById={maps.housesById}
            onSelect={step}
          />

          <RelationGroup
            title="Half-siblings"
            ids={halfSiblings}
            peopleById={maps.peopleById}
            housesById={maps.housesById}
            onSelect={step}
          />
        </>
      )}
    </div>
  );
}
