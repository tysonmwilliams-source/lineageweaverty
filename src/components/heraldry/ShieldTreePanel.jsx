/**
 * Navigating and reshaping a marshalled shield (decision C3, step 5d).
 *
 * This is the surface that makes the recursive model reachable: it divides a
 * coat into an impalement or a quartering, selects which part the editing panel
 * below is pointed at, and collapses a division back down.
 *
 * It renders nothing but controls — the shield itself is the existing preview,
 * which already draws marshalled compositions as of step 4.
 */
import { useState } from 'react';
import {
  MARSHALLING,
  describePath,
  samePath,
  getNodeAtPath,
  isMarshalledNode,
  divideNode,
  undivideNode,
  undivideLoses,
  canDivide
} from '../../utils/heraldry';
import Icon from '../icons';
import './ShieldTreePanel.css';

function ShieldTreePanel({
  root,
  selectedPath,
  onSelectPath,
  onChangeNode,
  onMashCoat,
  activeSection,
  onSectionChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo
}) {
  const [confirmingUndivide, setConfirmingUndivide] = useState(false);

  const node = getNodeAtPath(root, selectedPath) ?? root;
  const divided = isMarshalledNode(node);
  const losses = divided ? undivideLoses(node) : 0;

  // Breadcrumb trail: every ancestor of the selection, plus the selection.
  const trail = [[], ...selectedPath.map((_, i) => selectedPath.slice(0, i + 1))];

  const divide = (arrangement) => {
    onChangeNode(divideNode(node, arrangement));
    // Stay where you are. The coat you just divided is now its first part, so
    // following it keeps the editor pointed at the thing you were drawing.
    onSelectPath([...selectedPath, 0]);
  };

  const undivide = () => {
    onChangeNode(undivideNode(node));
    setConfirmingUndivide(false);
  };

  return (
    <section className="design-section shield-tree">
      <h2
        className={`section-title collapsible ${activeSection === 'marshalling' ? 'active' : ''}`}
        onClick={() => onSectionChange(activeSection === 'marshalling' ? '' : 'marshalling')}
      >
        <span><Icon name="layout-grid" size={14} /> Marshalling</span>
        <span className="collapse-icon">
          {activeSection === 'marshalling'
            ? <Icon name="chevron-down" size={14} />
            : <Icon name="chevron-right" size={14} />}
        </span>
      </h2>

      {activeSection === 'marshalling' && (
        <div className="shield-tree__body">
          <p className="section-help">
            Combine whole coats into one shield. Impalement is how a marriage is
            borne — one house's arms beside another's; quartering is how descent
            is borne.
          </p>

          <div className="shield-tree__history">
            <button
              type="button"
              className="shield-tree__btn"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo the last change to this shield"
            >
              <Icon name="undo" size={14} />
              <span>Undo</span>
            </button>
            <button
              type="button"
              className="shield-tree__btn"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo"
            >
              <Icon name="redo" size={14} />
              <span>Redo</span>
            </button>
          </div>

          {selectedPath.length > 0 && (
            <nav className="shield-tree__crumbs" aria-label="Shield parts">
              {trail.map((path, i) => (
                <span key={path.join('-') || 'root'}>
                  {i > 0 && <span className="shield-tree__crumb-sep">›</span>}
                  <button
                    type="button"
                    className={`shield-tree__crumb ${samePath(path, selectedPath) ? 'is-current' : ''}`}
                    onClick={() => onSelectPath(path)}
                  >
                    {describePath(root, path)}
                  </button>
                </span>
              ))}
            </nav>
          )}

          {divided ? (
            <>
              <p className="shield-tree__state">
                {MARSHALLING[node.arrangement]?.label ?? node.arrangement} into{' '}
                {node.parts.length} parts. Choose one to edit:
              </p>

              <div className="shield-tree__parts">
                {node.parts.map((part, i) => {
                  const partPath = [...selectedPath, i];
                  const isCurrent = samePath(partPath, selectedPath);
                  return (
                    /* A container rather than one big button: "select this
                       part" and "fill it from a house" are two actions, and
                       nesting a control inside a <button> is invalid markup
                       and unreachable by keyboard. */
                    <div key={i} className={`shield-tree__part ${isCurrent ? 'is-current' : ''}`}>
                      <button
                        type="button"
                        className="shield-tree__part-select"
                        onClick={() => onSelectPath(partPath)}
                      >
                        <span className="shield-tree__part-name">{describePath(root, partPath)}</span>
                        <span className="shield-tree__part-kind">
                          {isMarshalledNode(part)
                            ? (MARSHALLING[part.arrangement]?.label ?? 'divided')
                            : 'single coat'}
                        </span>
                      </button>

                      {/* The marriage case: fill this part straight from
                          another house's arms rather than redrawing them. */}
                      <button
                        type="button"
                        className="shield-tree__part-mash"
                        onClick={() => onMashCoat?.(partPath)}
                      >
                        <Icon name="shield" size={12} />
                        <span>Use a house's arms</span>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Undividing throws away coats, so it asks — and says how many. */}
              {confirmingUndivide ? (
                <div className="shield-tree__confirm">
                  <span>
                    <Icon name="alert-triangle" size={14} />
                    {losses === 0
                      ? ' Undivide this shield?'
                      : ` Undivide? ${losses} coat${losses === 1 ? '' : 's'} will be discarded.`}
                  </span>
                  <button type="button" className="shield-tree__btn shield-tree__btn--danger" onClick={undivide}>
                    Yes, undivide
                  </button>
                  <button type="button" className="shield-tree__btn" onClick={() => setConfirmingUndivide(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="shield-tree__btn"
                  onClick={() => setConfirmingUndivide(true)}
                >
                  <Icon name="minimize" size={14} />
                  <span>Undivide</span>
                </button>
              )}
            </>
          ) : (
            <>
              <p className="shield-tree__state">
                {selectedPath.length === 0 ? 'A single undivided coat.' : 'This part is a single coat.'}
              </p>

              {selectedPath.length > 0 && (
                <button
                  type="button"
                  className="shield-tree__btn shield-tree__btn--mash"
                  onClick={() => onMashCoat?.(selectedPath)}
                >
                  <Icon name="shield" size={14} />
                  <span>Use another house's arms here</span>
                </button>
              )}

              {canDivide(root, selectedPath) ? (
                <div className="shield-tree__divide">
                  {Object.entries(MARSHALLING).map(([key, spec]) => (
                    <button
                      key={key}
                      type="button"
                      className="shield-tree__btn shield-tree__btn--primary"
                      onClick={() => divide(key)}
                      title={spec.description}
                    >
                      {spec.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="shield-tree__limit">
                  <Icon name="info" size={14} />
                  This part is as deeply nested as the renderer supports.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default ShieldTreePanel;
