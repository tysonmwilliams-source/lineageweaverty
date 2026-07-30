import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  createHeraldry,
  getHeraldry,
  updateHeraldry,
  linkHeraldryToEntity,
  getHeraldryLinks
} from '../services/heraldryService';
import { getEntryByHeraldryId, createEntry } from '../services/codexService'; // PHASE 5 Batch 3 + Auto-creation
import { getAllHouses, getHouse, updateHouse } from '../services/database';
import { createSVGHeraldryWithMask } from '../utils/shieldSVGProcessor';
import { convertSVGtoPNG } from '../utils/armoriaIntegration';
import { sanitizeSVG } from '../utils/sanitize';
import {
  CHARGES,
  CHARGE_CATEGORIES,
  getChargesByCategory,
  generateChargeBlazon
} from '../data/unifiedChargesLibrary';
import {
  TINCTURES,
  LINE_STYLES,
  FIELD_DIVISIONS,
  ORDINARIES,
  CATEGORIES,
  CHARGE_ARRANGEMENTS,
  CHARGE_SIZES
} from '../data/heraldicData';
import Navigation from '../components/Navigation';
import ExternalChargeRenderer, {
  generateExternalChargeSVGAsync
} from '../components/heraldry/ExternalChargeRenderer';
import { useAuth } from '../contexts/AuthContext';
import { useDataset } from '../contexts/DatasetContext';
import {
  syncUpdateHouse,
  syncAddCodexEntry
} from '../services/dataSyncService';
import './HeraldryCreator.css';
import { logger } from '../utils/logger';
import Icon from '../components/icons';

/**
 * HeraldryCreator - Layered Architecture Edition
 *
 * Implements a proper layered heraldry system:
 * - FIELD: Base division/colors (always present)
 * - ORDINARIES: 0-3 independent bands/shapes layered on field
 * - CHARGES: 0-3 independent symbols layered on top
 *
 * Each layer has its own settings (tincture, line style, etc.)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// LINE PATH GENERATORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a styled line path between two points
 * Returns an SVG path 'd' attribute string
 */
function generateStyledLine(x1, y1, x2, y2, lineStyle, amplitude = 12) {
  if (lineStyle === 'straight' || !lineStyle) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length === 0) {
    return `M ${x1} ${y1}`;
  }
  
  const patternSize = 20;
  const patternCount = Math.max(4, Math.round(length / patternSize));
  
  const ux = dx / length;
  const uy = dy / length;
  const perpX = -uy;
  const perpY = ux;
  
  let path = `M ${x1} ${y1}`;
  
  switch (lineStyle) {
    case 'wavy': {
      const wavyAmp = amplitude * 1.2;
      for (let i = 0; i < patternCount; i++) {
        const startT = i / patternCount;
        const endT = (i + 1) / patternCount;
        const sx = x1 + dx * startT;
        const sy = y1 + dy * startT;
        const ex = x1 + dx * endT;
        const ey = y1 + dy * endT;
        const dir = (i % 2 === 0) ? 1 : -1;
        const cp1x = sx + (ex - sx) * 0.33 + perpX * wavyAmp * dir;
        const cp1y = sy + (ey - sy) * 0.33 + perpY * wavyAmp * dir;
        const cp2x = sx + (ex - sx) * 0.67 + perpX * wavyAmp * dir;
        const cp2y = sy + (ey - sy) * 0.67 + perpY * wavyAmp * dir;
        path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
      }
      break;
    }
    
    case 'nebuly': {
      const nebulyAmp = amplitude * 2;
      for (let i = 0; i < patternCount; i++) {
        const startT = i / patternCount;
        const endT = (i + 1) / patternCount;
        const sx = x1 + dx * startT;
        const sy = y1 + dy * startT;
        const ex = x1 + dx * endT;
        const ey = y1 + dy * endT;
        const dir = (i % 2 === 0) ? 1 : -1;
        const cp1x = sx + (ex - sx) * 0.25 + perpX * nebulyAmp * dir;
        const cp1y = sy + (ey - sy) * 0.25 + perpY * nebulyAmp * dir;
        const cp2x = sx + (ex - sx) * 0.75 + perpX * nebulyAmp * dir;
        const cp2y = sy + (ey - sy) * 0.75 + perpY * nebulyAmp * dir;
        path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
      }
      break;
    }
    
    case 'engrailed': {
      for (let i = 0; i < patternCount; i++) {
        const startT = i / patternCount;
        const endT = (i + 1) / patternCount;
        const sx = x1 + dx * startT;
        const sy = y1 + dy * startT;
        const ex = x1 + dx * endT;
        const ey = y1 + dy * endT;
        const cpx = (sx + ex) / 2 + perpX * amplitude;
        const cpy = (sy + ey) / 2 + perpY * amplitude;
        path += ` Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
      }
      break;
    }
    
    case 'invected': {
      for (let i = 0; i < patternCount; i++) {
        const startT = i / patternCount;
        const endT = (i + 1) / patternCount;
        const sx = x1 + dx * startT;
        const sy = y1 + dy * startT;
        const ex = x1 + dx * endT;
        const ey = y1 + dy * endT;
        const cpx = (sx + ex) / 2 - perpX * amplitude;
        const cpy = (sy + ey) / 2 - perpY * amplitude;
        path += ` Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
      }
      break;
    }
    
    case 'indented': {
      for (let i = 0; i < patternCount; i++) {
        const midT = (i + 0.5) / patternCount;
        const endT = (i + 1) / patternCount;
        const midX = x1 + dx * midT;
        const midY = y1 + dy * midT;
        const endX = x1 + dx * endT;
        const endY = y1 + dy * endT;
        const dir = (i % 2 === 0) ? 1 : -1;
        path += ` L ${(midX + perpX * amplitude * dir).toFixed(1)} ${(midY + perpY * amplitude * dir).toFixed(1)}`;
        path += ` L ${endX.toFixed(1)} ${endY.toFixed(1)}`;
      }
      break;
    }
    
    case 'dancetty': {
      const dancettyCount = Math.max(3, Math.round(patternCount / 2));
      const dancettyAmp = amplitude * 2;
      for (let i = 0; i < dancettyCount; i++) {
        const midT = (i + 0.5) / dancettyCount;
        const endT = (i + 1) / dancettyCount;
        const midX = x1 + dx * midT;
        const midY = y1 + dy * midT;
        const endX = x1 + dx * endT;
        const endY = y1 + dy * endT;
        const dir = (i % 2 === 0) ? 1 : -1;
        path += ` L ${(midX + perpX * dancettyAmp * dir).toFixed(1)} ${(midY + perpY * dancettyAmp * dir).toFixed(1)}`;
        path += ` L ${endX.toFixed(1)} ${endY.toFixed(1)}`;
      }
      break;
    }
    
    case 'embattled': {
      for (let i = 0; i < patternCount; i++) {
        const t1 = (i + 0.25) / patternCount;
        const t3 = (i + 0.75) / patternCount;
        const t4 = (i + 1) / patternCount;
        const raised = (i % 2 === 0);
        const offset = raised ? amplitude : 0;
        path += ` L ${(x1 + dx * t1 + perpX * offset).toFixed(1)} ${(y1 + dy * t1 + perpY * offset).toFixed(1)}`;
        path += ` L ${(x1 + dx * t3 + perpX * offset).toFixed(1)} ${(y1 + dy * t3 + perpY * offset).toFixed(1)}`;
        path += ` L ${(x1 + dx * t4).toFixed(1)} ${(y1 + dy * t4).toFixed(1)}`;
      }
      break;
    }
    
    case 'raguly': {
      for (let i = 0; i < patternCount; i++) {
        const t1 = (i + 0.3) / patternCount;
        const t2 = (i + 0.5) / patternCount;
        const t3 = (i + 1) / patternCount;
        const dir = (i % 2 === 0) ? 1 : -1;
        path += ` L ${(x1 + dx * t1 + perpX * amplitude * dir * 0.5).toFixed(1)} ${(y1 + dy * t1 + perpY * amplitude * dir * 0.5).toFixed(1)}`;
        path += ` L ${(x1 + dx * t2 + perpX * amplitude * dir).toFixed(1)} ${(y1 + dy * t2 + perpY * amplitude * dir).toFixed(1)}`;
        path += ` L ${(x1 + dx * t2).toFixed(1)} ${(y1 + dy * t2).toFixed(1)}`;
        path += ` L ${(x1 + dx * t3).toFixed(1)} ${(y1 + dy * t3).toFixed(1)}`;
      }
      break;
    }
    
    case 'dovetailed': {
      for (let i = 0; i < patternCount; i++) {
        const t1 = (i + 0.2) / patternCount;
        const t2 = (i + 0.4) / patternCount;
        const t3 = (i + 0.6) / patternCount;
        const t4 = (i + 0.8) / patternCount;
        const t5 = (i + 1) / patternCount;
        const dir = (i % 2 === 0) ? 1 : -1;
        path += ` L ${(x1 + dx * t1).toFixed(1)} ${(y1 + dy * t1).toFixed(1)}`;
        path += ` L ${(x1 + dx * t2 + perpX * amplitude * dir).toFixed(1)} ${(y1 + dy * t2 + perpY * amplitude * dir).toFixed(1)}`;
        path += ` L ${(x1 + dx * t3 + perpX * amplitude * dir).toFixed(1)} ${(y1 + dy * t3 + perpY * amplitude * dir).toFixed(1)}`;
        path += ` L ${(x1 + dx * t4).toFixed(1)} ${(y1 + dy * t4).toFixed(1)}`;
        path += ` L ${(x1 + dx * t5).toFixed(1)} ${(y1 + dy * t5).toFixed(1)}`;
      }
      break;
    }
    
    default:
      path += ` L ${x2} ${y2}`;
  }
  
  return path;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SVG GENERATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate SVG for field (base layer) only
 */
function generateFieldSVG(field) {
  const { division, tincture1, tincture2, tincture3, lineStyle = 'straight', count = 6, inverted = false } = field;
  
  const c1 = TINCTURES[tincture1]?.hex || tincture1;
  const c2 = TINCTURES[tincture2]?.hex || tincture2;
  const c3 = tincture3 ? (TINCTURES[tincture3]?.hex || tincture3) : c1;
  
  let content = '';
  
  const bgColor = inverted && ['perChevron'].includes(division) ? c2 : c1;
  const fgColor = inverted && ['perChevron'].includes(division) ? c1 : c2;
  
  content = `<rect x="0" y="0" width="200" height="200" fill="${bgColor}"/>`;
  
  switch (division) {
    case 'plain':
      break;
      
    case 'perPale':
      if (lineStyle === 'straight') {
        content += `<rect x="100" y="0" width="100" height="200" fill="${c2}"/>`;
      } else {
        const linePath = generateStyledLine(100, 0, 100, 200, lineStyle);
        content += `<path d="${linePath} L 200 200 L 200 0 Z" fill="${c2}"/>`;
      }
      break;
      
    case 'perFess':
      if (lineStyle === 'straight') {
        content += `<rect x="0" y="100" width="200" height="100" fill="${c2}"/>`;
      } else {
        const linePath = generateStyledLine(0, 100, 200, 100, lineStyle);
        content += `<path d="${linePath} L 200 200 L 0 200 Z" fill="${c2}"/>`;
      }
      break;
      
    case 'perBend':
      if (lineStyle === 'straight') {
        content += `<path d="M 0 0 L 200 200 L 200 0 Z" fill="${c2}"/>`;
      } else {
        const linePath = generateStyledLine(0, 0, 200, 200, lineStyle);
        content += `<path d="${linePath} L 200 0 Z" fill="${c2}"/>`;
      }
      break;
      
    case 'perBendSinister':
      if (lineStyle === 'straight') {
        content += `<path d="M 200 0 L 0 200 L 0 0 Z" fill="${c2}"/>`;
      } else {
        const linePath = generateStyledLine(200, 0, 0, 200, lineStyle);
        content += `<path d="${linePath} L 0 0 Z" fill="${c2}"/>`;
      }
      break;
    
    case 'perChevron': {
      const peakY = inverted ? 140 : 60;
      const baseY = inverted ? 0 : 200;
      if (lineStyle === 'straight') {
        content += `<path d="M 0 ${baseY} L 100 ${peakY} L 200 ${baseY} Z" fill="${fgColor}"/>`;
      } else {
        const line1 = generateStyledLine(0, baseY, 100, peakY, lineStyle);
        const line2 = generateStyledLine(100, peakY, 200, baseY, lineStyle);
        content += `<path d="${line1} ${line2.replace(/^M [^ ]+ [^ ]+/, '')} Z" fill="${fgColor}"/>`;
      }
      break;
    }
      
    case 'quarterly':
      content += `
        <rect x="100" y="0" width="100" height="100" fill="${c2}"/>
        <rect x="0" y="100" width="100" height="100" fill="${c2}"/>
      `;
      break;
      
    case 'perSaltire':
      content += `<path d="M 100 0 L 200 100 L 100 200 L 0 100 Z" fill="${c2}"/>`;
      break;
      
    case 'paly': {
      const stripeCount = count || 6;
      const stripeWidth = 200 / stripeCount;
      for (let i = 0; i < stripeCount; i++) {
        if (i % 2 === 1) {
          content += `<rect x="${i * stripeWidth}" y="0" width="${stripeWidth}" height="200" fill="${c2}"/>`;
        }
      }
      break;
    }
      
    case 'barry': {
      const stripeCount = count || 6;
      const stripeHeight = 200 / stripeCount;
      for (let i = 0; i < stripeCount; i++) {
        if (i % 2 === 1) {
          content += `<rect x="0" y="${i * stripeHeight}" width="200" height="${stripeHeight}" fill="${c2}"/>`;
        }
      }
      break;
    }
      
    case 'bendy': {
      const stripeCount = count || 6;
      const stripeWidth = 400 / stripeCount;
      for (let i = 0; i < stripeCount * 2; i++) {
        if (i % 2 === 1) {
          const offset = i * stripeWidth / 2 - 200;
          content += `<path d="M ${offset} 0 L ${offset + stripeWidth/2} 0 L ${offset + 200 + stripeWidth/2} 200 L ${offset + 200} 200 Z" fill="${c2}"/>`;
        }
      }
      break;
    }
      
    case 'bendySinister': {
      const stripeCount = count || 6;
      const stripeWidth = 400 / stripeCount;
      for (let i = 0; i < stripeCount * 2; i++) {
        if (i % 2 === 1) {
          const offset = i * stripeWidth / 2 - 200;
          content += `<path d="M ${200 - offset} 0 L ${200 - offset - stripeWidth/2} 0 L ${-offset - stripeWidth/2} 200 L ${-offset} 200 Z" fill="${c2}"/>`;
        }
      }
      break;
    }
      
    case 'chequy': {
      const checkSize = 40;
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
          if ((row + col) % 2 === 1) {
            content += `<rect x="${col * checkSize}" y="${row * checkSize}" width="${checkSize}" height="${checkSize}" fill="${c2}"/>`;
          }
        }
      }
      break;
    }
      
    case 'lozengy': {
      const size = 35;
      for (let row = -2; row < 8; row++) {
        for (let col = -2; col < 8; col++) {
          if ((row + col) % 2 === 0) {
            const cx = col * size + (row % 2 === 0 ? 0 : size/2);
            const cy = row * size * 0.7;
            content += `<path d="M ${cx} ${cy - size/2} L ${cx + size/2} ${cy} L ${cx} ${cy + size/2} L ${cx - size/2} ${cy} Z" fill="${c2}"/>`;
          }
        }
      }
      break;
    }
    
    case 'fusily': {
      const width = 25;
      const height = 50;
      for (let row = -1; row < 5; row++) {
        for (let col = -1; col < 10; col++) {
          if ((row + col) % 2 === 0) {
            const cx = col * width + (row % 2 === 0 ? 0 : width/2);
            const cy = row * height * 0.8 + 20;
            content += `<path d="M ${cx} ${cy - height/2} L ${cx + width/2} ${cy} L ${cx} ${cy + height/2} L ${cx - width/2} ${cy} Z" fill="${c2}"/>`;
          }
        }
      }
      break;
    }
      
    case 'gyronny':
      content += `
        <path d="M 100 100 L 100 0 L 200 0 Z" fill="${c2}"/>
        <path d="M 100 100 L 200 100 L 200 200 Z" fill="${c2}"/>
        <path d="M 100 100 L 100 200 L 0 200 Z" fill="${c2}"/>
        <path d="M 100 100 L 0 100 L 0 0 Z" fill="${c2}"/>
      `;
      break;
      
    case 'tiercedPale':
      if (lineStyle === 'straight') {
        content += `<rect x="67" y="0" width="66" height="200" fill="${c2}"/>`;
        content += `<rect x="133" y="0" width="67" height="200" fill="${c3}"/>`;
      } else {
        const line1 = generateStyledLine(67, 0, 67, 200, lineStyle);
        content += `<path d="${line1} L 133 200 L 133 0 Z" fill="${c2}"/>`;
        const line2 = generateStyledLine(133, 0, 133, 200, lineStyle);
        content += `<path d="${line2} L 200 200 L 200 0 L 133 0 Z" fill="${c3}"/>`;
      }
      break;
      
    case 'tiercedFess':
      if (lineStyle === 'straight') {
        content += `<rect x="0" y="67" width="200" height="66" fill="${c2}"/>`;
        content += `<rect x="0" y="133" width="200" height="67" fill="${c3}"/>`;
      } else {
        const line1 = generateStyledLine(0, 67, 200, 67, lineStyle);
        content += `<path d="${line1} L 200 133 L 0 133 Z" fill="${c2}"/>`;
        const line2 = generateStyledLine(0, 133, 200, 133, lineStyle);
        content += `<path d="${line2} L 200 200 L 0 200 L 0 133 Z" fill="${c3}"/>`;
      }
      break;
      
    default:
      break;
  }
  
  return content;
}

/**
 * Generate SVG for a single ordinary
 */
function generateOrdinarySVG(ordinary) {
  const { type, tincture, lineStyle = 'straight', thickness = 'normal', count = 1, inverted = false } = ordinary;
  
  const color = TINCTURES[tincture]?.hex || tincture;
  const thicknessMultiplier = thickness === 'narrow' ? 0.6 : thickness === 'wide' ? 1.4 : 1;
  
  let content = '';
  
  switch (type) {
    case 'chief': {
      const height = 60 * thicknessMultiplier;
      if (lineStyle === 'straight') {
        content = `<rect x="0" y="0" width="200" height="${height}" fill="${color}"/>`;
      } else {
        const linePath = generateStyledLine(200, height, 0, height, lineStyle);
        content = `<path d="M 0 0 L 200 0 L 200 ${height} ${linePath.replace(/^M [\d.-]+ [\d.-]+\s*/, '')} Z" fill="${color}"/>`;
      }
      break;
    }
      
    case 'base': {
      const height = 60 * thicknessMultiplier;
      const y = 200 - height;
      if (lineStyle === 'straight') {
        content = `<rect x="0" y="${y}" width="200" height="${height}" fill="${color}"/>`;
      } else {
        const linePath = generateStyledLine(0, y, 200, y, lineStyle);
        content = `<path d="${linePath} L 200 200 L 0 200 Z" fill="${color}"/>`;
      }
      break;
    }
      
    case 'fess': {
      const bandHeight = 50 * thicknessMultiplier;
      const bandCount = Math.min(count || 1, 3);
      const spacing = bandCount === 1 ? 0 : 30;
      const startY = 100 - (bandCount * bandHeight + (bandCount - 1) * spacing) / 2;
      
      for (let i = 0; i < bandCount; i++) {
        const y = startY + i * (bandHeight + spacing);
        if (lineStyle === 'straight') {
          content += `<rect x="0" y="${y}" width="200" height="${bandHeight}" fill="${color}"/>`;
        } else {
          const topLine = generateStyledLine(0, y, 200, y, lineStyle);
          const bottomLine = generateStyledLine(200, y + bandHeight, 0, y + bandHeight, lineStyle);
          content += `<path d="${topLine} L 200 ${y + bandHeight} ${bottomLine.replace(/^M [^ ]+ [^ ]+/, '')} L 0 ${y} Z" fill="${color}"/>`;
        }
      }
      break;
    }
      
    case 'pale': {
      const bandWidth = 50 * thicknessMultiplier;
      const bandCount = Math.min(count || 1, 3);
      const spacing = bandCount === 1 ? 0 : 20;
      const startX = 100 - (bandCount * bandWidth + (bandCount - 1) * spacing) / 2;
      
      for (let i = 0; i < bandCount; i++) {
        const x = startX + i * (bandWidth + spacing);
        if (lineStyle === 'straight') {
          content += `<rect x="${x}" y="0" width="${bandWidth}" height="200" fill="${color}"/>`;
        } else {
          const leftLine = generateStyledLine(x, 0, x, 200, lineStyle);
          const rightLine = generateStyledLine(x + bandWidth, 200, x + bandWidth, 0, lineStyle);
          content += `<path d="${leftLine} L ${x} 200 ${rightLine.replace(/^M [^ ]+ [^ ]+/, '')} L ${x + bandWidth} 0 Z" fill="${color}"/>`;
        }
      }
      break;
    }
      
    case 'bend': {
      const bandWidth = 45 * thicknessMultiplier;
      const bandCount = Math.min(count || 1, 3);
      
      for (let i = 0; i < bandCount; i++) {
        const offset = (i - (bandCount - 1) / 2) * (bandWidth + 15);
        if (lineStyle === 'straight') {
          content += `<path d="M ${-bandWidth/2 + offset} ${bandWidth/2} L ${bandWidth/2 + offset} ${-bandWidth/2} L ${200 + bandWidth/2 + offset} ${200 - bandWidth/2} L ${200 - bandWidth/2 + offset} ${200 + bandWidth/2} Z" fill="${color}"/>`;
        } else {
          const line1 = generateStyledLine(-bandWidth/2 + offset, bandWidth/2, 200 - bandWidth/2 + offset, 200 + bandWidth/2, lineStyle);
          content += `<path d="${line1} L ${200 + bandWidth/2 + offset} ${200 - bandWidth/2} L ${bandWidth/2 + offset} ${-bandWidth/2} Z" fill="${color}"/>`;
        }
      }
      break;
    }
      
    case 'bendSinister': {
      const bandWidth = 45 * thicknessMultiplier;
      const bandCount = Math.min(count || 1, 3);
      
      for (let i = 0; i < bandCount; i++) {
        const offset = (i - (bandCount - 1) / 2) * (bandWidth + 15);
        if (lineStyle === 'straight') {
          content += `<path d="M ${200 + bandWidth/2 - offset} ${bandWidth/2} L ${200 - bandWidth/2 - offset} ${-bandWidth/2} L ${-bandWidth/2 - offset} ${200 - bandWidth/2} L ${bandWidth/2 - offset} ${200 + bandWidth/2} Z" fill="${color}"/>`;
        } else {
          const line1 = generateStyledLine(200 + bandWidth/2 - offset, bandWidth/2, bandWidth/2 - offset, 200 + bandWidth/2, lineStyle);
          content += `<path d="${line1} L ${-bandWidth/2 - offset} ${200 - bandWidth/2} L ${200 - bandWidth/2 - offset} ${-bandWidth/2} Z" fill="${color}"/>`;
        }
      }
      break;
    }
      
    case 'chevron': {
      const bandWidth = 45 * thicknessMultiplier;
      const bandCount = Math.min(count || 1, 3);
      const baseY = inverted ? 40 : 160;
      const peakY = inverted ? 160 : 40;
      const direction = inverted ? -1 : 1;
      
      for (let i = 0; i < bandCount; i++) {
        const offset = i * (bandWidth + 15) * direction;
        const outerBaseY = baseY + offset;
        const innerBaseY = outerBaseY + bandWidth * direction;
        const outerPeakY = peakY + offset;
        const innerPeakY = outerPeakY + bandWidth * direction;
        
        if (lineStyle === 'straight') {
          content += `<path d="M 0 ${outerBaseY} L 100 ${outerPeakY} L 200 ${outerBaseY} L 200 ${innerBaseY} L 100 ${innerPeakY} L 0 ${innerBaseY} Z" fill="${color}"/>`;
        } else {
          const outer1 = generateStyledLine(0, outerBaseY, 100, outerPeakY, lineStyle);
          const outer2 = generateStyledLine(100, outerPeakY, 200, outerBaseY, lineStyle);
          content += `<path d="${outer1} ${outer2.replace(/^M [^ ]+ [^ ]+/, '')} L 200 ${innerBaseY} L 100 ${innerPeakY} L 0 ${innerBaseY} Z" fill="${color}"/>`;
        }
      }
      break;
    }
    
    case 'pile': {
      const pileCount = Math.min(count || 1, 3);
      const baseWidth = 200 / pileCount;
      const baseY = inverted ? 200 : 0;
      const pointY = inverted ? 40 : 160;
      
      for (let i = 0; i < pileCount; i++) {
        const centerX = baseWidth * (i + 0.5);
        const leftX = centerX - baseWidth * 0.4;
        const rightX = centerX + baseWidth * 0.4;
        
        if (lineStyle === 'straight') {
          content += `<path d="M ${leftX} ${baseY} L ${centerX} ${pointY} L ${rightX} ${baseY} Z" fill="${color}"/>`;
        } else {
          const line1 = generateStyledLine(leftX, baseY, centerX, pointY, lineStyle);
          const line2 = generateStyledLine(centerX, pointY, rightX, baseY, lineStyle);
          content += `<path d="${line1} ${line2.replace(/^M [^ ]+ [^ ]+/, '')} Z" fill="${color}"/>`;
        }
      }
      break;
    }
      
    case 'cross': {
      const armWidth = 50 * thicknessMultiplier;
      const halfArm = armWidth / 2;
      content = `<rect x="${100 - halfArm}" y="0" width="${armWidth}" height="200" fill="${color}"/>`;
      content += `<rect x="0" y="${100 - halfArm}" width="200" height="${armWidth}" fill="${color}"/>`;
      break;
    }
      
    case 'saltire': {
      const armWidth = 40 * thicknessMultiplier;
      content = `<path d="M 0 ${armWidth} L ${armWidth} 0 L 100 ${100 - armWidth} L ${200 - armWidth} 0 L 200 ${armWidth} L ${100 + armWidth} 100 L 200 ${200 - armWidth} L ${200 - armWidth} 200 L 100 ${100 + armWidth} L ${armWidth} 200 L 0 ${200 - armWidth} L ${100 - armWidth} 100 Z" fill="${color}"/>`;
      break;
    }
      
    default:
      break;
  }
  
  return content;
}

/**
 * Generate blazon for field
 */
function generateFieldBlazon(field) {
  const { division, tincture1, tincture2, tincture3, lineStyle = 'straight', count = 6, inverted = false } = field;
  
  const t1 = TINCTURES[tincture1]?.name.split(' ')[0] || tincture1;
  const t2 = TINCTURES[tincture2]?.name.split(' ')[0] || tincture2;
  const t3 = tincture3 ? (TINCTURES[tincture3]?.name.split(' ')[0] || tincture3) : null;
  
  const lineDesc = LINE_STYLES[lineStyle]?.blazon || '';
  
  switch (division) {
    case 'plain':
      return t1;
    case 'perPale':
      return `Per pale ${lineDesc} ${t1} and ${t2}`.replace(/\s+/g, ' ').trim();
    case 'perFess':
      return `Per fess ${lineDesc} ${t1} and ${t2}`.replace(/\s+/g, ' ').trim();
    case 'perBend':
      return `Per bend ${lineDesc} ${t1} and ${t2}`.replace(/\s+/g, ' ').trim();
    case 'perBendSinister':
      return `Per bend sinister ${lineDesc} ${t1} and ${t2}`.replace(/\s+/g, ' ').trim();
    case 'perChevron':
      return `Per chevron ${lineDesc}${inverted ? ' inverted' : ''} ${t1} and ${t2}`.replace(/\s+/g, ' ').trim();
    case 'quarterly':
      return `Quarterly ${t1} and ${t2}`;
    case 'perSaltire':
      return `Per saltire ${t1} and ${t2}`;
    case 'paly':
      return `Paly of ${count} ${t1} and ${t2}`;
    case 'barry':
      return `Barry of ${count} ${t1} and ${t2}`;
    case 'bendy':
      return `Bendy of ${count} ${t1} and ${t2}`;
    case 'bendySinister':
      return `Bendy sinister of ${count} ${t1} and ${t2}`;
    case 'chequy':
      return `Chequy ${t1} and ${t2}`;
    case 'lozengy':
      return `Lozengy ${t1} and ${t2}`;
    case 'fusily':
      return `Fusily ${t1} and ${t2}`;
    case 'gyronny':
      return `Gyronny ${t1} and ${t2}`;
    case 'tiercedPale':
      return `Tierced in pale ${lineDesc} ${t1}, ${t2}, and ${t3 || t1}`.replace(/\s+/g, ' ').trim();
    case 'tiercedFess':
      return `Tierced in fess ${lineDesc} ${t1}, ${t2}, and ${t3 || t1}`.replace(/\s+/g, ' ').trim();
    default:
      return t1;
  }
}

/**
 * Generate blazon for a single ordinary
 */
function generateOrdinaryBlazon(ordinary) {
  const { type, tincture, lineStyle = 'straight', count = 1, inverted = false } = ordinary;
  const ordinaryDef = ORDINARIES[type];
  if (!ordinaryDef) return '';
  
  const tinctureName = TINCTURES[tincture]?.name.split(' ')[0] || tincture;
  const lineDesc = LINE_STYLES[lineStyle]?.blazon || '';
  
  let name;
  if (count > 1 && ordinaryDef.blazonPlural?.[count]) {
    name = ordinaryDef.blazonPlural[count];
  } else {
    name = ordinaryDef.blazonSingle;
  }
  
  const invertedText = inverted ? (type === 'pile' ? ' reversed' : ' inverted') : '';
  
  return `${name} ${lineDesc}${invertedText} ${tinctureName}`.replace(/\s+/g, ' ').trim();
}

/**
 * Generate full blazon from all layers
 */
function generateFullBlazon(field, ordinaries, charges) {
  let blazon = generateFieldBlazon(field);
  
  // Add ordinaries
  for (const ordinary of ordinaries) {
    const ordBlazon = generateOrdinaryBlazon(ordinary);
    if (ordBlazon) {
      blazon += `, ${ordBlazon}`;
    }
  }
  
  // Add charges
  for (const charge of charges) {
    const chargeTinctureName = TINCTURES[charge.tincture]?.name.split(' ')[0] || charge.tincture;
    const chargeBlazon = generateChargeBlazon(charge.chargeId, chargeTinctureName, charge.count || 1);
    if (chargeBlazon) {
      blazon += `, ${chargeBlazon}`;
    }
  }
  
  return blazon;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAZY LOADING CHARGE PREVIEW
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// ELEMENT CARD COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OrdinaryCard - Collapsible card for editing a single ordinary
 */
function OrdinaryCard({ 
  ordinary, 
  index, 
  totalCount,
  onUpdate, 
  onRemove,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onToggleVisibility
}) {
  const [expanded, setExpanded] = useState(true);
  const ordinaryDef = ORDINARIES[ordinary.type];
  const tinctureDef = TINCTURES[ordinary.tincture];
  const isVisible = ordinary.visible !== false;
  
  const summaryText = `${ordinaryDef?.name || ordinary.type} — ${tinctureDef?.name.split(' ')[0] || ordinary.tincture}${ordinary.lineStyle !== 'straight' ? `, ${LINE_STYLES[ordinary.lineStyle]?.name}` : ''}`;
  
  return (
    <div className={`element-card ${!isVisible ? 'hidden-layer' : ''}`}>
      <div className="element-card-header" onClick={() => setExpanded(!expanded)}>
        <span className="element-card-icon">{ordinaryDef?.icon || '▬'}</span>
        <span className="element-card-summary">{summaryText}</span>
        
        {/* Layer Controls */}
        <div className="element-card-controls" onClick={(e) => e.stopPropagation()}>
          <button 
            type="button"
            className="element-control-btn"
            onClick={() => onMoveUp(index)}
            disabled={index === 0}
            title="Move up (render earlier)"
          >
            ▲
          </button>
          <button 
            type="button"
            className="element-control-btn"
            onClick={() => onMoveDown(index)}
            disabled={index >= totalCount - 1}
            title="Move down (render later)"
          >
            ▼
          </button>
          <button 
            type="button"
            className="element-control-btn"
            onClick={() => onDuplicate(index)}
            disabled={totalCount >= 3}
            title="Duplicate this ordinary"
          >
            📋
          </button>
          <button 
            type="button"
            className={`element-control-btn ${!isVisible ? 'toggled-off' : ''}`}
            onClick={() => onToggleVisibility(index)}
            title={isVisible ? 'Hide from preview' : 'Show in preview'}
          >
            {isVisible ? '👁' : '👁‍🗨'}
          </button>
          <button 
            type="button"
            className="element-card-remove" 
            onClick={() => onRemove(index)}
            title="Remove this ordinary"
          >
            ✕
          </button>
        </div>
        <span className="element-card-expand">{expanded ? '▼' : '▶'}</span>
      </div>
      
      {expanded && (
        <div className="element-card-body">
          {/* Type Selector */}
          <div className="element-option">
            <label>Type</label>
            <div className="element-type-grid">
              {Object.entries(ORDINARIES).map(([key, ord]) => (
                <button
                  key={key}
                  type="button"
                  className={`element-type-btn ${ordinary.type === key ? 'selected' : ''}`}
                  onClick={() => onUpdate(index, { type: key })}
                  title={ord.description}
                >
                  <span className="type-icon">{ord.icon}</span>
                  <span className="type-name">{ord.name}</span>
                </button>
              ))}
            </div>
          </div>
          
          {/* Tincture */}
          <div className="element-option">
            <label>Tincture</label>
            <div className="tincture-grid compact">
              {Object.entries(TINCTURES).map(([key, tinc]) => (
                <button
                  key={key}
                  type="button"
                  className={`tincture-option ${ordinary.tincture === key ? 'selected' : ''}`}
                  onClick={() => onUpdate(index, { tincture: key })}
                  title={tinc.name}
                  style={{ 
                    backgroundColor: tinc.hex,
                    color: ['or', 'argent'].includes(key) ? '#000' : '#fff'
                  }}
                >
                  {key.charAt(0).toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          
          {/* Line Style */}
          {ordinaryDef?.supportsLine && (
            <div className="element-option">
              <label>Line Style</label>
              <div className="line-style-grid">
                {Object.entries(LINE_STYLES).map(([key, style]) => (
                  <button
                    key={key}
                    type="button"
                    className={`line-style-option ${ordinary.lineStyle === key ? 'selected' : ''}`}
                    onClick={() => onUpdate(index, { lineStyle: key })}
                    title={style.description}
                  >
                    {style.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Thickness */}
          {ordinaryDef?.supportsThickness && (
            <div className="element-option">
              <label>Thickness</label>
              <div className="thickness-controls">
                {['narrow', 'normal', 'wide'].map(t => (
                  <button
                    key={t}
                    type="button"
                    className={`thickness-button ${ordinary.thickness === t ? 'selected' : ''}`}
                    onClick={() => onUpdate(index, { thickness: t })}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Count */}
          {ordinaryDef?.supportsCount && (
            <div className="element-option">
              <label>Count</label>
              <div className="count-controls">
                {[1, 2, 3].map(num => (
                  <button
                    key={num}
                    type="button"
                    className={`count-button ${ordinary.count === num ? 'selected' : ''}`}
                    onClick={() => onUpdate(index, { count: num })}
                    disabled={ordinaryDef.maxCount && num > ordinaryDef.maxCount}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Inverted */}
          {ordinaryDef?.supportsInvert && (
            <div className="element-option">
              <label className="checkbox-label-container">
                <input
                  type="checkbox"
                  checked={ordinary.inverted || false}
                  onChange={(e) => onUpdate(index, { inverted: e.target.checked })}
                  className="invert-checkbox"
                />
                <span className="checkbox-label">
                  Inverted {ordinary.type === 'pile' ? '(Reversed)' : ''}
                </span>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * ChargeCard - Collapsible card for editing a single charge
 */
function ChargeCard({ 
  charge, 
  index, 
  totalCount,
  onUpdate, 
  onRemove,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onToggleVisibility
}) {
  const [expanded, setExpanded] = useState(true);
  const [activeCategory, setActiveCategory] = useState(() => {
    const chargeData = CHARGES[charge.chargeId];
    return chargeData?.category || 'beasts';
  });
  
  const chargeData = CHARGES[charge.chargeId];
  const tinctureDef = TINCTURES[charge.tincture];
  const sizeDef = CHARGE_SIZES[charge.size];
  const isVisible = charge.visible !== false;
  
  const summaryText = `${chargeData?.name || charge.chargeId} — ${tinctureDef?.name.split(' ')[0] || charge.tincture}, ${sizeDef?.name || charge.size}`;
  
  const categoryCharges = getChargesByCategory(activeCategory);
  
  return (
    <div className={`element-card ${!isVisible ? 'hidden-layer' : ''}`}>
      <div className="element-card-header" onClick={() => setExpanded(!expanded)}>
        <span className="element-card-icon"><Icon name="crown" /></span>
        <span className="element-card-summary">{summaryText}</span>
        
        {/* Layer Controls */}
        <div className="element-card-controls" onClick={(e) => e.stopPropagation()}>
          <button 
            type="button"
            className="element-control-btn"
            onClick={() => onMoveUp(index)}
            disabled={index === 0}
            title="Move up (render earlier)"
          >
            ▲
          </button>
          <button 
            type="button"
            className="element-control-btn"
            onClick={() => onMoveDown(index)}
            disabled={index >= totalCount - 1}
            title="Move down (render later)"
          >
            ▼
          </button>
          <button 
            type="button"
            className="element-control-btn"
            onClick={() => onDuplicate(index)}
            disabled={totalCount >= 3}
            title="Duplicate this charge"
          >
            📋
          </button>
          <button 
            type="button"
            className={`element-control-btn ${!isVisible ? 'toggled-off' : ''}`}
            onClick={() => onToggleVisibility(index)}
            title={isVisible ? 'Hide from preview' : 'Show in preview'}
          >
            {isVisible ? '👁' : '👁‍🗨'}
          </button>
          <button 
            type="button"
            className="element-card-remove" 
            onClick={() => onRemove(index)}
            title="Remove this charge"
          >
            ✕
          </button>
        </div>
        <span className="element-card-expand">{expanded ? '▼' : '▶'}</span>
      </div>
      
      {expanded && (
        <div className="element-card-body">
          {/* Category Tabs */}
          <div className="element-option">
            <label>Category</label>
            <div className="charge-category-tabs">
              {Object.entries(CHARGE_CATEGORIES).map(([catId, cat]) => (
                <button
                  key={catId}
                  type="button"
                  className={`line-style-option ${activeCategory === catId ? 'selected' : ''}`}
                  onClick={() => setActiveCategory(catId)}
                  title={cat.description}
                >
                  <span>{cat.icon}</span> {cat.name}
                </button>
              ))}
            </div>
          </div>
          
          {/* Charge Grid */}
          <div className="element-option">
            <label>Select Charge</label>
            <div className="unified-charge-grid">
              {Object.entries(categoryCharges).map(([id]) => (
                <LazyChargePreview
                  key={id}
                  chargeId={id}
                  tincture={TINCTURES[charge.tincture]?.hex || '#000000'}
                  size={45}
                  selected={charge.chargeId === id}
                  onClick={(chargeId) => onUpdate(index, { chargeId })}
                  showName={true}
                />
              ))}
            </div>
          </div>
          
          {/* Tincture */}
          <div className="element-option">
            <label>Tincture</label>
            <div className="tincture-grid compact">
              {Object.entries(TINCTURES).map(([key, tinc]) => (
                <button
                  key={key}
                  type="button"
                  className={`tincture-option ${charge.tincture === key ? 'selected' : ''}`}
                  onClick={() => onUpdate(index, { tincture: key })}
                  title={tinc.name}
                  style={{ 
                    backgroundColor: tinc.hex,
                    color: ['or', 'argent'].includes(key) ? '#000' : '#fff'
                  }}
                >
                  {key.charAt(0).toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          
          {/* Size */}
          <div className="element-option">
            <label>Size</label>
            <div className="thickness-controls">
              {Object.entries(CHARGE_SIZES).map(([sizeId, size]) => (
                <button
                  key={sizeId}
                  type="button"
                  className={`thickness-button ${charge.size === sizeId ? 'selected' : ''}`}
                  onClick={() => onUpdate(index, { size: sizeId })}
                >
                  {size.name}
                </button>
              ))}
            </div>
          </div>
          
          {/* Count */}
          <div className="element-option">
            <label>Number of Charges</label>
            <div className="count-controls">
              {[1, 2, 3].map(num => (
                <button
                  key={num}
                  type="button"
                  className={`count-button ${charge.count === num ? 'selected' : ''}`}
                  onClick={() => {
                    const updates = { count: num };
                    if (num === 1) updates.arrangement = 'fessPoint';
                    else if (num === 2) updates.arrangement = 'pale';
                    else updates.arrangement = 'twoAndOne';
                    onUpdate(index, updates);
                  }}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
          
          {/* Arrangement */}
          {charge.count > 1 && (
            <div className="element-option">
              <label>Arrangement</label>
              <div className="thickness-controls">
                {Object.keys(CHARGE_ARRANGEMENTS[charge.count] || {}).map(arr => (
                  <button
                    key={arr}
                    type="button"
                    className={`thickness-button ${charge.arrangement === arr ? 'selected' : ''}`}
                    onClick={() => onUpdate(index, { arrangement: arr })}
                  >
                    {arr === 'twoAndOne' ? '2 & 1' :
                     arr === 'oneAndTwo' ? '1 & 2' :
                     arr === 'pale' ? 'In Pale' :
                     arr === 'fess' ? 'In Fess' :
                     arr === 'bend' ? 'In Bend' : arr}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function HeraldryCreator() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const presetHouseId = searchParams.get('houseId');

  // ☁️ Get user for cloud sync
  const { user } = useAuth();
  const { activeDataset } = useDataset();

  const isEditMode = !!id;
  
  // Identity state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [shieldType, setShieldType] = useState('default'); // Uses single default shield shape
  const [category, setCategory] = useState('noble');
  const [tags, setTags] = useState('');
  const [linkedHouseId, setLinkedHouseId] = useState(presetHouseId || '');
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LAYERED STATE STRUCTURE
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Field (base layer - always present)
  const [field, setField] = useState({
    division: 'plain',
    tincture1: 'azure',
    tincture2: 'or',
    tincture3: 'gules',
    lineStyle: 'straight',
    count: 6,
    inverted: false
  });
  
  // Ordinaries array (0-3 items)
  const [ordinaries, setOrdinaries] = useState([]);
  
  // Charges array (0-3 items)
  const [charges, setCharges] = useState([]);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER MANAGEMENT FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  
  const addOrdinary = () => {
    if (ordinaries.length < 3) {
      setOrdinaries([...ordinaries, {
        type: 'chief',
        tincture: 'or',
        lineStyle: 'straight',
        thickness: 'normal',
        count: 1,
        inverted: false,
        visible: true  // Visibility toggle support
      }]);
    }
  };
  
  const removeOrdinary = (index) => {
    setOrdinaries(ordinaries.filter((_, i) => i !== index));
  };
  
  const updateOrdinary = (index, updates) => {
    setOrdinaries(ordinaries.map((ord, i) => 
      i === index ? { ...ord, ...updates } : ord
    ));
  };
  
  // Move ordinary up in the layer stack
  const moveOrdinaryUp = (index) => {
    if (index === 0) return;
    const newOrdinaries = [...ordinaries];
    [newOrdinaries[index - 1], newOrdinaries[index]] = 
      [newOrdinaries[index], newOrdinaries[index - 1]];
    setOrdinaries(newOrdinaries);
  };
  
  // Move ordinary down in the layer stack
  const moveOrdinaryDown = (index) => {
    if (index >= ordinaries.length - 1) return;
    const newOrdinaries = [...ordinaries];
    [newOrdinaries[index], newOrdinaries[index + 1]] = 
      [newOrdinaries[index + 1], newOrdinaries[index]];
    setOrdinaries(newOrdinaries);
  };
  
  // Duplicate an ordinary
  const duplicateOrdinary = (index) => {
    if (ordinaries.length >= 3) return;
    const copy = { ...ordinaries[index] };
    const newOrdinaries = [...ordinaries];
    newOrdinaries.splice(index + 1, 0, copy);
    setOrdinaries(newOrdinaries);
  };
  
  // Toggle ordinary visibility
  const toggleOrdinaryVisibility = (index) => {
    setOrdinaries(ordinaries.map((ord, i) => 
      i === index ? { ...ord, visible: ord.visible === false ? true : false } : ord
    ));
  };
  
  const addCharge = () => {
    if (charges.length < 3) {
      setCharges([...charges, {
        chargeId: 'lion4',
        tincture: 'or',
        size: 'medium',
        count: 1,
        arrangement: 'fessPoint',
        visible: true  // Visibility toggle support
      }]);
    }
  };
  
  const removeCharge = (index) => {
    setCharges(charges.filter((_, i) => i !== index));
  };
  
  const updateCharge = (index, updates) => {
    setCharges(charges.map((chg, i) => 
      i === index ? { ...chg, ...updates } : chg
    ));
  };
  
  // Move charge up in the layer stack
  const moveChargeUp = (index) => {
    if (index === 0) return;
    const newCharges = [...charges];
    [newCharges[index - 1], newCharges[index]] = 
      [newCharges[index], newCharges[index - 1]];
    setCharges(newCharges);
  };
  
  // Move charge down in the layer stack
  const moveChargeDown = (index) => {
    if (index >= charges.length - 1) return;
    const newCharges = [...charges];
    [newCharges[index], newCharges[index + 1]] = 
      [newCharges[index + 1], newCharges[index]];
    setCharges(newCharges);
  };
  
  // Duplicate a charge
  const duplicateCharge = (index) => {
    if (charges.length >= 3) return;
    const copy = { ...charges[index] };
    const newCharges = [...charges];
    newCharges.splice(index + 1, 0, copy);
    setCharges(newCharges);
  };
  
  // Toggle charge visibility
  const toggleChargeVisibility = (index) => {
    setCharges(charges.map((chg, i) => 
      i === index ? { ...chg, visible: chg.visible === false ? true : false } : chg
    ));
  };
  
  // Generated content
  const [blazon, setBlazon] = useState('');
  const [previewSVG, setPreviewSVG] = useState(null);
  const [rawSVG, setRawSVG] = useState(null);
  
  // Data
  const [houses, setHouses] = useState([]);
  const [existingHeraldry, setExistingHeraldry] = useState(null);
  const [linkedCodexEntry, setLinkedCodexEntry] = useState(null); // PHASE 5 Batch 3
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('field');
  const [showRuleWarning, setShowRuleWarning] = useState(false);
  
  // Get current field division info
  const currentDivision = FIELD_DIVISIONS[field.division] || {};
  const needsThirdTincture = ['tiercedPale', 'tiercedFess'].includes(field.division);
  
  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, [id, activeDataset]);

  async function loadInitialData() {
    setLoading(true);
    const datasetId = activeDataset?.id;
    try {
      const housesData = await getAllHouses(datasetId);
      setHouses(housesData);

      if (isEditMode) {
        const heraldry = await getHeraldry(parseInt(id), datasetId);
        if (heraldry) {
          setExistingHeraldry(heraldry);
          setName(heraldry.name || '');
          setDescription(heraldry.description || '');
          // Normalize legacy shield types to 'default'
          const savedShieldType = heraldry.shieldType;
          if (!savedShieldType || ['french', 'heater', 'english', 'spanish', 'swiss'].includes(savedShieldType)) {
            setShieldType('default');
          } else {
            setShieldType(savedShieldType);
          }
          setCategory(heraldry.category || 'noble');
          setTags(heraldry.tags?.join(', ') || '');
          setBlazon(heraldry.blazon || '');
          
          if (heraldry.composition) {
            const comp = heraldry.composition;
            
            // Check if this is the new layered format
            if (comp.field) {
              // New layered format
              setField(comp.field);
              setOrdinaries(comp.ordinaries || []);
              setCharges(comp.charges || []);
            } else {
              // Legacy flat format - migrate to new structure
              setField({
                division: comp.division || 'plain',
                tincture1: comp.tincture1 || 'azure',
                tincture2: comp.tincture2 || 'or',
                tincture3: comp.tincture3 || 'gules',
                lineStyle: comp.lineStyle || 'straight',
                count: comp.count || 6,
                inverted: comp.inverted || false
              });
              
              // If legacy format had a charge enabled, migrate it
              if (comp.chargeEnabled && comp.chargeId) {
                setCharges([{
                  chargeId: comp.externalChargeId || comp.chargeId,
                  tincture: comp.chargeTincture || 'or',
                  size: comp.chargeSize || 'medium',
                  count: comp.chargeCount || 1,
                  arrangement: comp.chargeArrangement || 'fessPoint'
                }]);
              }
              
              // Note: Legacy format stored ordinaries AS divisions (chief, fess, etc.)
              // We'd need to detect if the division was actually an ordinary and migrate
              // For now, we leave ordinaries empty in legacy migration
            }
          }
          
          if (heraldry.heraldrySVG) {
            setPreviewSVG(heraldry.heraldrySVG);
          }
          
          // PHASE 5 Batch 3: Load linked codex entry if exists
          if (heraldry.codexEntryId) {
            try {
              const codexEntry = await getEntryByHeraldryId(heraldry.id, datasetId);
              if (codexEntry) {
                setLinkedCodexEntry(codexEntry);
              }
            } catch (codexError) {
              logger.error('Error loading linked codex entry:', codexError);
            }
          }

          // Restore linked house from heraldryLinks table
          try {
            const links = await getHeraldryLinks(heraldry.id, datasetId);
            const houseLink = links.find(l => l.entityType === 'house' && l.linkType === 'primary');
            if (houseLink) {
              setLinkedHouseId(String(houseLink.entityId));
            }
          } catch (linkError) {
            logger.error('Error loading linked house:', linkError);
          }
        }
      }

      if (presetHouseId && !isEditMode) {
        const house = await getHouse(parseInt(presetHouseId), datasetId);
        if (house) {
          setName(`Arms of ${house.houseName}`);
          setLinkedHouseId(presetHouseId);
        }
      }
    } catch (error) {
      logger.error('Error loading data:', error);
    }
    setLoading(false);
  }
  
  // Check rule of tincture for field
  useEffect(() => {
    const t1Type = TINCTURES[field.tincture1]?.type;
    const t2Type = TINCTURES[field.tincture2]?.type;
    const adjacentDivisions = ['perPale', 'perFess', 'perBend', 'perBendSinister', 'quarterly', 'perSaltire', 'perChevron'];
    
    if (adjacentDivisions.includes(field.division)) {
      if ((t1Type === 'metal' && t2Type === 'metal') || 
          (t1Type === 'colour' && t2Type === 'colour')) {
        setShowRuleWarning(true);
      } else {
        setShowRuleWarning(false);
      }
    } else {
      setShowRuleWarning(false);
    }
  }, [field.tincture1, field.tincture2, field.division]);
  
  // Generate preview with layered composition
  const generatePreview = useCallback(async () => {
    setGenerating(true);
    try {
      // 1. Generate field SVG
      let svgContent = generateFieldSVG(field);
      
      // 2. Add ordinaries in order (skip hidden ones)
      for (const ordinary of ordinaries) {
        if (ordinary.visible === false) continue;
        const ordinarySVG = generateOrdinarySVG(ordinary);
        svgContent += ordinarySVG;
      }
      
      // 3. Add charges in order (skip hidden ones)
      for (const charge of charges) {
        if (charge.visible === false) continue;
        const chargeHex = TINCTURES[charge.tincture]?.hex || charge.tincture;
        const sizeScale = CHARGE_SIZES[charge.size]?.scale || 0.9;
        
        let chargeSVGContent = '';
        
        if (charge.count === 1) {
          chargeSVGContent = await generateExternalChargeSVGAsync(
            charge.chargeId, 
            chargeHex, 
            100, 90, 
            sizeScale
          );
        } else {
          const arrangements = CHARGE_ARRANGEMENTS[charge.count];
          const arrangementKey = charge.arrangement || Object.keys(arrangements)[0];
          const positions = arrangements[arrangementKey];
          
          const chargePromises = positions.map(pos =>
            generateExternalChargeSVGAsync(
              charge.chargeId,
              chargeHex,
              pos.x,
              pos.y,
              sizeScale * 0.7
            )
          );
          
          const chargeResults = await Promise.all(chargePromises);
          chargeSVGContent = chargeResults.join('');
        }
        
        svgContent += chargeSVGContent;
      }
      
      // Wrap in SVG container
      const fullSVG = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`;
      setRawSVG(fullSVG);
      
      // 4. Apply shield mask
      const maskedSVG = await createSVGHeraldryWithMask(fullSVG, shieldType, 400);
      setPreviewSVG(maskedSVG);
      
      // 5. Generate blazon
      const newBlazon = generateFullBlazon(field, ordinaries, charges);
      setBlazon(newBlazon);
      
    } catch (error) {
      logger.error('Error generating preview:', error);
    }
    setGenerating(false);
  }, [field, ordinaries, charges, shieldType]);
  
  useEffect(() => {
    generatePreview();
  }, [generatePreview]);
  
  // Handle save
  async function handleSave() {
    if (!name.trim()) {
      alert('Please enter a name for this heraldry.');
      return;
    }

    if (!previewSVG) {
      alert('Please generate a preview first.');
      return;
    }

    setSaving(true);
    const datasetId = activeDataset?.id;

    try {
      const pngVersions = await convertSVGtoPNG(previewSVG);
      
      const heraldryData = {
        name: name.trim(),
        description: description.trim() || null,
        blazon: blazon,
        heraldrySVG: previewSVG,
        heraldrySourceSVG: rawSVG,
        heraldryDisplay: pngVersions.display,
        heraldryThumbnail: pngVersions.thumbnail,
        heraldryHighRes: pngVersions.highRes,
        shieldType: shieldType,
        composition: {
          // New layered format
          field,
          ordinaries,
          charges,
          generatedAt: new Date().toISOString(),
          version: 2 // Mark as layered format
        },
        category: category,
        tags: tags.split(',').map(t => t.trim()).filter(t => t),
        source: 'creator'
      };
      
      let heraldryId;

      // createHeraldry/updateHeraldry sync internally when given userId +
      // datasetId. The explicit sync* calls that used to sit here passed their
      // arguments in the wrong order — (userId, id, data, datasetId) against a
      // (userId, datasetId, id, data) signature — so datasetId received a
      // numeric id and getDatabase() spun up a phantom `LineageweaverDB_<id>`
      // per record. They were redundant as well as wrong.
      if (isEditMode) {
        await updateHeraldry(parseInt(id), heraldryData, user?.uid, datasetId);
        heraldryId = parseInt(id);
      } else {
        heraldryId = await createHeraldry(heraldryData, user?.uid, datasetId);
      }
      
      // ═══════════════════════════════════════════════════════════════════════
      // AUTO-CREATE CODEX ENTRY (only for NEW heraldry, not edits)
      // ═══════════════════════════════════════════════════════════════════════
      if (!isEditMode) {
        try {
          const codexEntryData = {
            type: 'heraldry',  // Goes into the dedicated Heraldry section in The Codex
            title: name.trim(),
            content: `**Blazon:** ${blazon}\n\n**Category:** ${CATEGORIES.find(c => c.id === category)?.name || category}\n\n*[Add detailed description of this heraldic device here]*`,
            heraldryId: heraldryId,
            category: 'heraldry',
            tags: ['heraldry', 'coat of arms', ...tags.split(',').map(t => t.trim()).filter(t => t)]
          };
          
          const codexEntryId = await createEntry(codexEntryData, datasetId);

          // Update heraldry with codex link (bidirectional).
          // This syncs internally — no separate sync call needed.
          await updateHeraldry(heraldryId, { codexEntryId: codexEntryId }, user?.uid, datasetId);

          // codexService has no internal sync, so this one is required.
          if (user?.uid) {
            syncAddCodexEntry(user.uid, datasetId, codexEntryId, { ...codexEntryData, id: codexEntryId });
          }
          
          logger.log(`✅ Auto-created Codex entry ${codexEntryId} for heraldry "${name.trim()}"`);
        } catch (codexError) {
          // Non-blocking: heraldry still saved successfully even if Codex creation fails
          logger.error('⚠️ Failed to auto-create Codex entry:', codexError);
        }
      }
      
      if (linkedHouseId) {
        const linkId = await linkHeraldryToEntity({
          heraldryId: heraldryId,
          entityType: 'house',
          entityId: parseInt(linkedHouseId),
          linkType: 'primary'
        }, user?.uid, datasetId);

        // Note: linkHeraldryToEntity already handles cloud sync internally

        const houseUpdates = {
          heraldrySVG: previewSVG,
          heraldrySourceSVG: rawSVG,
          heraldryImageData: pngVersions.display,
          heraldryThumbnail: pngVersions.thumbnail,
          heraldryHighRes: pngVersions.highRes,
          heraldryShieldType: shieldType,
          heraldrySource: 'creator',
          heraldryType: 'svg',
          heraldryId: heraldryId
        };

        await updateHouse(parseInt(linkedHouseId), houseUpdates, datasetId);

        // ☁️ Sync house update to cloud
        if (user?.uid) {
          syncUpdateHouse(user.uid, datasetId, parseInt(linkedHouseId), houseUpdates);
        }
      }
      
      navigate(`/heraldry`);
    } catch (error) {
      logger.error('Error saving heraldry:', error);
      alert('Failed to save heraldry. Please try again.');
    }
    
    setSaving(false);
  }
  
  if (loading) {
    return (
      <>
        <Navigation />
        <div className="heraldry-creator loading">
          <div className="loading-spinner">
            <div className="loading-icon">🛡️</div>
            <p>Preparing the Design Studio...</p>
          </div>
        </div>
      </>
    );
  }
  
  return (
    <>
      <Navigation />
      <div className="heraldry-creator">
        
        <header className="creator-header">
          <div className="header-content">
            <button className="back-button" onClick={() => navigate('/heraldry')}>
              ← Back to Armory
            </button>
            <h1 className="creator-title">
              {isEditMode ? 'Edit Heraldry' : 'Design New Heraldry'}
            </h1>
          </div>
        </header>
        
        <div className="creator-layout">
          
          {/* Preview Panel */}
          <aside className="preview-panel">
            <div className="preview-container">
              <h2 className="panel-title">Preview</h2>
              
              <div className="shield-preview">
                {generating ? (
                  <div className="generating-indicator">
                    <Icon name="settings" />
                    <p>Generating...</p>
                  </div>
                ) : previewSVG ? (
                  <div
                    className="shield-display"
                    role="img"
                    aria-label={blazon || 'Heraldic shield design preview'}
                    dangerouslySetInnerHTML={{ __html: sanitizeSVG(previewSVG) }}
                  />
                ) : (
                  <div className="preview-placeholder">
                    <Icon name="shield" />
                    <p>Your design will appear here</p>
                  </div>
                )}
              </div>
              
              {blazon && (
                <div className="blazon-display">
                  <h3>Blazon</h3>
                  <p className="blazon-text">{blazon}</p>
                </div>
              )}
              
              {showRuleWarning && (
                <div className="rule-warning">
                  <span className="warning-icon"><Icon name="alert-triangle" /></span>
                  <p>
                    <strong>Rule of Tincture:</strong> Metal on metal or colour on colour 
                    is traditionally avoided. This design may violate convention.
                  </p>
                </div>
              )}
              
              {/* Layer Summary */}
              <div className="layer-summary">
                <h3>Composition</h3>
                <div className="layer-counts">
                  <span className="layer-count">Field: {FIELD_DIVISIONS[field.division]?.name || 'Plain'}</span>
                  <span className="layer-count">Ordinaries: {ordinaries.length}/3</span>
                  <span className="layer-count">Charges: {charges.length}/3</span>
                </div>
              </div>
              
              {/* PHASE 5 Batch 3: Codex Integration Link */}
              {isEditMode && (
                <div className="codex-link-section">
                  <h3>📜 Codex Entry</h3>
                  {linkedCodexEntry ? (
                    <div className="codex-link-content">
                      <p className="codex-link-title">{linkedCodexEntry.title}</p>
                      <button 
                        className="codex-link-button"
                        onClick={() => navigate(`/codex/entry/${linkedCodexEntry.id}`)}
                      >
                        View in Codex →
                      </button>
                    </div>
                  ) : (
                    <div className="codex-link-empty">
                      <p>No codex entry linked.</p>
                      <button 
                        className="codex-create-button"
                        onClick={() => navigate(`/codex/create?type=heraldry&heraldryId=${id}&title=${encodeURIComponent(name)}`)}
                      >
                        📝 Create Codex Entry
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
          
          {/* Design Panel */}
          <main className="design-panel">
            
            {/* Identity */}
            <section className="design-section">
              <h2 className="section-title">Identity</h2>
              <div className="form-group">
                <label htmlFor="name">Name *</label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Arms of House Wilfrey"
                  className="text-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional notes about this heraldry..."
                  className="text-input textarea"
                  rows={3}
                />
              </div>
            </section>
            
            {/* ═══════════════════════════════════════════════════════════════
                FIELD (Base Layer)
                ═══════════════════════════════════════════════════════════════ */}
            <section className="design-section">
              <h2 
                className={`section-title collapsible ${activeSection === 'field' ? 'active' : ''}`}
                onClick={() => setActiveSection(activeSection === 'field' ? '' : 'field')}
              >
                <span>🏴 Field (Base Layer)</span>
                <span className="collapse-icon">{activeSection === 'field' ? '▼' : '▶'}</span>
              </h2>
              
              {activeSection === 'field' && (
                <>
                  {/* Division Grid */}
                  <div className="division-grid">
                    {Object.entries(FIELD_DIVISIONS).map(([key, div]) => (
                      <button
                        key={key}
                        className={`division-option ${field.division === key ? 'selected' : ''}`}
                        onClick={() => setField({ ...field, division: key })}
                        title={div.description}
                      >
                        <span className="division-icon">{div.icon}</span>
                        <span className="division-name">{div.name}</span>
                      </button>
                    ))}
                  </div>
                  
                  {/* Field Options */}
                  <div className="division-options">
                    <h3 className="options-title">Field Settings</h3>
                    
                    {/* Primary Tincture */}
                    <div className="option-group">
                      <label>Primary Tincture</label>
                      <div className="tincture-grid">
                        {Object.entries(TINCTURES).map(([key, tinc]) => (
                          <button
                            key={key}
                            type="button"
                            className={`tincture-option ${field.tincture1 === key ? 'selected' : ''}`}
                            onClick={() => setField({ ...field, tincture1: key })}
                            title={tinc.name}
                            style={{ 
                              backgroundColor: tinc.hex,
                              color: ['or', 'argent'].includes(key) ? '#000' : '#fff'
                            }}
                          >
                            {key.charAt(0).toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {/* Secondary Tincture */}
                    {field.division !== 'plain' && (
                      <div className="option-group">
                        <label>Secondary Tincture</label>
                        <div className="tincture-grid">
                          {Object.entries(TINCTURES).map(([key, tinc]) => (
                            <button
                              key={key}
                              type="button"
                              className={`tincture-option ${field.tincture2 === key ? 'selected' : ''}`}
                              onClick={() => setField({ ...field, tincture2: key })}
                              title={tinc.name}
                              style={{ 
                                backgroundColor: tinc.hex,
                                color: ['or', 'argent'].includes(key) ? '#000' : '#fff'
                              }}
                            >
                              {key.charAt(0).toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Third Tincture for tierced */}
                    {needsThirdTincture && (
                      <div className="option-group">
                        <label>Tertiary Tincture</label>
                        <div className="tincture-grid">
                          {Object.entries(TINCTURES).map(([key, tinc]) => (
                            <button
                              key={key}
                              type="button"
                              className={`tincture-option ${field.tincture3 === key ? 'selected' : ''}`}
                              onClick={() => setField({ ...field, tincture3: key })}
                              title={tinc.name}
                              style={{ 
                                backgroundColor: tinc.hex,
                                color: ['or', 'argent'].includes(key) ? '#000' : '#fff'
                              }}
                            >
                              {key.charAt(0).toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Line Style */}
                    {currentDivision.supportsLine && (
                      <div className="option-group">
                        <label>Line Style</label>
                        <div className="line-style-grid">
                          {Object.entries(LINE_STYLES).map(([key, style]) => (
                            <button
                              key={key}
                              type="button"
                              className={`line-style-option ${field.lineStyle === key ? 'selected' : ''}`}
                              onClick={() => setField({ ...field, lineStyle: key })}
                              title={style.description}
                            >
                              {style.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Stripe Count */}
                    {currentDivision.supportsCount && (
                      <div className="option-group">
                        <label>Stripe Count</label>
                        <div className="count-controls">
                          <input
                            type="range"
                            min="4"
                            max="10"
                            step="2"
                            value={field.count}
                            onChange={(e) => setField({ ...field, count: parseInt(e.target.value) })}
                            className="count-slider"
                          />
                          <span className="count-value">{field.count} stripes</span>
                        </div>
                      </div>
                    )}
                    
                    {/* Inverted */}
                    {currentDivision.supportsInvert && (
                      <div className="option-group">
                        <label className="checkbox-label-container">
                          <input
                            type="checkbox"
                            checked={field.inverted}
                            onChange={(e) => setField({ ...field, inverted: e.target.checked })}
                            className="invert-checkbox"
                          />
                          <span className="checkbox-label">Inverted</span>
                        </label>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
            
            {/* ═══════════════════════════════════════════════════════════════
                ORDINARIES (Layer 2)
                ═══════════════════════════════════════════════════════════════ */}
            <section className="design-section">
              <h2 
                className={`section-title collapsible ${activeSection === 'ordinaries' ? 'active' : ''}`}
                onClick={() => setActiveSection(activeSection === 'ordinaries' ? '' : 'ordinaries')}
              >
                <span>▬ Ordinaries ({ordinaries.length}/3)</span>
                <span className="collapse-icon">{activeSection === 'ordinaries' ? '▼' : '▶'}</span>
              </h2>
              
              {activeSection === 'ordinaries' && (
                <div className="layer-section-content">
                  <p className="section-help">
                    Ordinaries are geometric shapes placed on the field. Add up to 3 ordinaries,
                    each with their own tincture and options.
                  </p>
                  
                  {/* Ordinary Cards */}
                  <div className="element-cards">
                    {ordinaries.map((ordinary, index) => (
                      <OrdinaryCard
                        key={index}
                        ordinary={ordinary}
                        index={index}
                        totalCount={ordinaries.length}
                        onUpdate={updateOrdinary}
                        onRemove={removeOrdinary}
                        onMoveUp={moveOrdinaryUp}
                        onMoveDown={moveOrdinaryDown}
                        onDuplicate={duplicateOrdinary}
                        onToggleVisibility={toggleOrdinaryVisibility}
                      />
                    ))}
                  </div>
                  
                  {/* Add Button */}
                  {ordinaries.length < 3 && (
                    <button 
                      type="button" 
                      className="add-element-btn"
                      onClick={addOrdinary}
                    >
                      + Add Ordinary
                    </button>
                  )}
                </div>
              )}
            </section>
            
            {/* ═══════════════════════════════════════════════════════════════
                CHARGES (Layer 3)
                ═══════════════════════════════════════════════════════════════ */}
            <section className="design-section">
              <h2 
                className={`section-title collapsible ${activeSection === 'charges' ? 'active' : ''}`}
                onClick={() => setActiveSection(activeSection === 'charges' ? '' : 'charges')}
              >
                <span>⚜ Charges ({charges.length}/3)</span>
                <span className="collapse-icon">{activeSection === 'charges' ? '▼' : '▶'}</span>
              </h2>
              
              {activeSection === 'charges' && (
                <div className="layer-section-content">
                  <p className="section-help">
                    Charges are symbols placed on the shield. Add up to 3 charge types,
                    each with their own tincture, size, and count.
                  </p>
                  
                  {/* Charge Cards */}
                  <div className="element-cards">
                    {charges.map((charge, index) => (
                      <ChargeCard
                        key={index}
                        charge={charge}
                        index={index}
                        totalCount={charges.length}
                        onUpdate={updateCharge}
                        onRemove={removeCharge}
                        onMoveUp={moveChargeUp}
                        onMoveDown={moveChargeDown}
                        onDuplicate={duplicateCharge}
                        onToggleVisibility={toggleChargeVisibility}
                      />
                    ))}
                  </div>
                  
                  {/* Add Button */}
                  {charges.length < 3 && (
                    <button 
                      type="button" 
                      className="add-element-btn"
                      onClick={addCharge}
                    >
                      + Add Charge
                    </button>
                  )}
                </div>
              )}
            </section>
            
            {/* 
              🪝 FUTURE EXPANSION: Shield Shape Selection
              Currently using single default shield shape.
              To re-enable multiple shapes:
              1. Uncomment SHIELD_TYPES constant above
              2. Uncomment this section
              3. Update shieldSVGProcessor.js to support multiple shapes
            
            <section className="design-section">
              <h2 
                className={`section-title collapsible ${activeSection === 'shield' ? 'active' : ''}`}
                onClick={() => setActiveSection(activeSection === 'shield' ? '' : 'shield')}
              >
                <span>Shield Shape</span>
                <span className="collapse-icon">{activeSection === 'shield' ? '▼' : '▶'}</span>
              </h2>
              
              {activeSection === 'shield' && (
                <div className="shield-type-grid">
                  {SHIELD_TYPES.map(shield => (
                    <button
                      key={shield.id}
                      className={`shield-type-option ${shieldType === shield.id ? 'selected' : ''}`}
                      onClick={() => setShieldType(shield.id)}
                    >
                      <span className="shield-icon">{shield.icon}</span>
                      <span className="shield-name">{shield.name}</span>
                      <span className="shield-desc">{shield.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
            */}
            
            {/* Classification */}
            <section className="design-section">
              <h2 
                className={`section-title collapsible ${activeSection === 'classification' ? 'active' : ''}`}
                onClick={() => setActiveSection(activeSection === 'classification' ? '' : 'classification')}
              >
                <span>Classification</span>
                <span className="collapse-icon">{activeSection === 'classification' ? '▼' : '▶'}</span>
              </h2>
              
              {activeSection === 'classification' && (
                <>
                  <div className="form-group">
                    <label>Category</label>
                    <div className="category-grid">
                      {CATEGORIES.map(cat => (
                        <button
                          key={cat.id}
                          className={`category-option ${category === cat.id ? 'selected' : ''}`}
                          onClick={() => setCategory(cat.id)}
                        >
                          <span>{cat.icon}</span>
                          <span>{cat.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="tags">Tags (comma-separated)</label>
                    <input
                      type="text"
                      id="tags"
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      placeholder="e.g., royal, ancient, cadet branch"
                      className="text-input"
                    />
                  </div>
                </>
              )}
            </section>
            
            {/* House Linking */}
            <section className="design-section">
              <h2 
                className={`section-title collapsible ${activeSection === 'linking' ? 'active' : ''}`}
                onClick={() => setActiveSection(activeSection === 'linking' ? '' : 'linking')}
              >
                <span>Link to House</span>
                <span className="collapse-icon">{activeSection === 'linking' ? '▼' : '▶'}</span>
              </h2>
              
              {activeSection === 'linking' && (
                <div className="form-group">
                  <label htmlFor="house">Assign to House (optional)</label>
                  <select
                    id="house"
                    value={linkedHouseId}
                    onChange={(e) => setLinkedHouseId(e.target.value)}
                    className="select-input"
                  >
                    <option value="">-- No house linked --</option>
                    {houses.map(house => (
                      <option key={house.id} value={house.id}>
                        {house.houseName}
                        {house.heraldryId ? ' (has heraldry)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="help-text">
                    Linking this heraldry will update the house's coat of arms.
                  </p>
                </div>
              )}
            </section>
            
            {/* Actions */}
            <div className="action-bar">
              <button className="action-button secondary" onClick={() => navigate('/heraldry')}>
                Cancel
              </button>
              <button 
                className="action-button primary"
                onClick={handleSave}
                disabled={saving || !name.trim()}
              >
                {saving ? '💾 Saving...' : isEditMode ? '💾 Update Heraldry' : '💾 Save Heraldry'}
              </button>
            </div>
            
          </main>
        </div>
      </div>
    </>
  );
}

export default HeraldryCreator;
