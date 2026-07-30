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

function ShieldTreePanel({ root, selectedPath, onSelectPath, onChangeNode, activeSection, onSectionChange }) {
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
            borne; quartering is how descent is borne.
          </p>

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
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`shield-tree__part ${samePath(partPath, selectedPath) ? 'is-current' : ''}`}
                      onClick={() => onSelectPath(partPath)}
                    >
                      <span className="shield-tree__part-name">{describePath(root, partPath)}</span>
                      <span className="shield-tree__part-kind">
                        {isMarshalledNode(part)
                          ? (MARSHALLING[part.arrangement]?.label ?? 'divided')
                          : 'single coat'}
                      </span>
                    </button>
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
