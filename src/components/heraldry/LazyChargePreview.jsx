/**
 * A charge thumbnail that only renders once scrolled into view.
 *
 * Extracted from HeraldryCreator (decision C3, step 5). The charge library is
 * thousands of SVGs and the picker mounts hundreds of these at once, so the
 * IntersectionObserver is what stops it rendering the whole library up front.
 * Behaviour is unchanged; only the location moved.
 */
import { useState, useEffect, useRef } from 'react';
import { CHARGES } from '../../data/unifiedChargesLibrary';
import ExternalChargeRenderer from './ExternalChargeRenderer';

function LazyChargePreview({ chargeId, tincture, size = 50, selected, onClick, showName = true }) {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef(null);
  const chargeData = CHARGES[chargeId];
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '50px', threshold: 0.1 }
    );
    
    if (cardRef.current) {
      observer.observe(cardRef.current);
    }
    
    return () => observer.disconnect();
  }, []);
  
  if (!chargeData) return null;
  
  return (
    <button
      ref={cardRef}
      type="button"
      className={`charge-preview-btn ${selected ? 'selected' : ''}`}
      onClick={() => onClick?.(chargeId)}
      title={chargeData.description}
    >
      <div className="charge-preview-icon">
        {isVisible ? (
          <ExternalChargeRenderer
            chargeId={chargeId}
            tincture={tincture}
            size={size}
            showOutline={true}
          />
        ) : (
          <div className="charge-preview-placeholder" style={{ width: size, height: size }} />
        )}
      </div>
      {showName && (
        <span className="charge-preview-name">{chargeData.name}</span>
      )}
    </button>
  );
}

export default LazyChargePreview;
