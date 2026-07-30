import { useState, useEffect, useCallback } from 'react';
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
  generateChargeBlazon
} from '../data/unifiedChargesLibrary';
import ListSearchBar from '../components/shared/ListSearchBar';
import { downloadHeraldrySVG, downloadHeraldryPNG } from '../utils/downloadHeraldry';
import { addCadencyToSVG, generatePersonalArmsBlazon } from '../utils/personalArmsRenderer';
import { primaryLeaf, readComposition, collectLeaves, composeCoat, renderNode } from '../utils/heraldry';
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
import CoatEditor from '../components/heraldry/CoatEditor';
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

// LazyChargePreview, OrdinaryCard and ChargeCard now live in
// components/heraldry/ (decision C3, step 5).

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function HeraldryCreator() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const presetHouseId = searchParams.get('houseId');

  // Personal-arms context. "Create Personal Arms" in PersonalArmsSection has
  // always navigated here with personId/deriveFrom/birthPosition, and the creator
  // read none of them — so it opened a blank shield and the whole cadency engine
  // in personalArmsRenderer.js was unreachable.
  const personIdParam = searchParams.get('personId');
  const deriveFromParam = searchParams.get('deriveFrom');
  const birthPositionParam = searchParams.get('birthPosition');

  const personId = personIdParam ? parseInt(personIdParam) : null;
  const deriveFromHeraldryId = deriveFromParam ? parseInt(deriveFromParam) : null;
  // Cadency marks are 1-based: 1st son gets one triangle.
  const birthPosition = birthPositionParam ? parseInt(birthPositionParam) : null;
  const isPersonalArms = Boolean(personId);

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
  
  // The ordinary and charge mutators moved into CoatEditor (decision C3, step
  // 5). They operated on this page's three state variables, which is exactly
  // what stopped the editing UI being usable for more than one coat.

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
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  // Cadency is on by default when arriving from "Create Personal Arms" — that's
  // the point of the flow — but it stays a toggle, because a bastard, an heiress
  // or an adopted child may be differenced some other way, and that's the
  // owner's call, not the app's.
  const [applyCadency, setApplyCadency] = useState(isPersonalArms);
  const [derivedFromName, setDerivedFromName] = useState(null);

  // Keys a legacy composition carried that the migration did not recognise.
  // Held across an edit so that re-saving a record does not drop them — the
  // migration deliberately preserves unknown data, and it would be pointless
  // for the first save afterwards to throw it away.
  const [carriedUnmigrated, setCarriedUnmigrated] = useState(null);

  // Export the current preview. Works on an unsaved design too — you can compose
  // arms and take the file without committing it to the Armory.
  const handleDownload = useCallback(async (format) => {
    if (!previewSVG) return;

    setExportError(null);
    setExporting(true);
    try {
      const filenameBase = name?.trim() || blazon || 'coat-of-arms';
      if (format === 'png') {
        await downloadHeraldryPNG(previewSVG, filenameBase);
      } else {
        downloadHeraldrySVG(previewSVG, filenameBase);
      }
    } catch (error) {
      logger.error('Heraldry export failed:', error);
      setExportError(error.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  }, [previewSVG, name, blazon]);

  // Get current field division info
  
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
          
          // Decision C3, step 2. This used to be an inline format conversion:
          // it branched on `comp.field`, and rebuilt legacy records from a copy
          // of the migration logic that admitted, in its own closing comment,
          // to dropping ordinaries it could not classify. That conversion also
          // never persisted, so a legacy record stayed legacy until the day it
          // happened to be saved.
          //
          // primaryLeaf accepts any stored version, so this no longer cares
          // which format the record is in — which is what lets the data
          // migration and the code land in either order.
          const stored = readComposition(heraldry.composition);
          const leaf = stored && collectLeaves(stored.root)[0];
          if (leaf) {
            setField(leaf.field);
            setOrdinaries(leaf.ordinaries);
            setCharges(leaf.charges);
          }
          if (stored?.unmigrated) setCarriedUnmigrated(stored.unmigrated);
          
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

      // Personal arms: seed the composition from the house arms being derived
      // from, so the shield opens as the parent arms and the cadency marks
      // difference it. Without this the flow opened a blank shield and there was
      // nothing for cadency to be applied *to*.
      if (isPersonalArms && !isEditMode && deriveFromHeraldryId) {
        try {
          const parentArms = await getHeraldry(deriveFromHeraldryId, datasetId);
          if (parentArms) {
            setDerivedFromName(parentArms.name || null);

            // Was `if (comp?.field)`, which recognised version 2 and nothing
            // else — so deriving from a legacy record opened a blank shield,
            // and deriving from a migrated one would have done the same the
            // moment step 3 started writing version 3.
            const parentLeaf = primaryLeaf(parentArms.composition);
            if (parentLeaf) {
              setField(parentLeaf.field);
              setOrdinaries(parentLeaf.ordinaries);
              setCharges(parentLeaf.charges);
            }
            if (parentArms.shieldType) {
              setShieldType(parentArms.shieldType);
            }
            setCategory('personal');
          }
        } catch (parentError) {
          // A missing parent must not block creating arms from scratch.
          logger.error('Could not load the arms being derived from:', parentError);
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
      // Decision C3, step 4. The body of this used to be the preview: field,
      // then ordinaries, then charges, straight into one string. It is now the
      // *leaf* renderer, and the preview is whatever renderNode makes of the
      // composition — one coat today, a divided shield once step 5 can build
      // one. Everything below the composition boundary is unchanged.
      const renderLeaf = async (leaf) => {
        let content = generateFieldSVG(leaf.field);

        for (const ordinary of leaf.ordinaries) {
          if (ordinary.visible === false) continue;
          content += generateOrdinarySVG(ordinary);
        }

        for (const charge of leaf.charges) {
          if (charge.visible === false) continue;
          const chargeHex = TINCTURES[charge.tincture]?.hex || charge.tincture;
          const sizeScale = CHARGE_SIZES[charge.size]?.scale || 0.9;

          if (charge.count === 1) {
            content += await generateExternalChargeSVGAsync(
              charge.chargeId,
              chargeHex,
              100, 90,
              sizeScale
            );
          } else {
            const arrangements = CHARGE_ARRANGEMENTS[charge.count];
            const arrangementKey = charge.arrangement || Object.keys(arrangements)[0];
            const positions = arrangements[arrangementKey];

            const chargeResults = await Promise.all(
              positions.map(pos =>
                generateExternalChargeSVGAsync(
                  charge.chargeId,
                  chargeHex,
                  pos.x,
                  pos.y,
                  sizeScale * 0.7
                )
              )
            );
            content += chargeResults.join('');
          }
        }

        return content;
      };

      const composition = composeCoat({ field, ordinaries, charges });
      const svgContent = await renderNode(composition.root, renderLeaf);

      // Wrap in SVG container
      const fullSVG = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`;
      setRawSVG(fullSVG);
      
      // 4. Apply shield mask
      const maskedSVG = await createSVGHeraldryWithMask(fullSVG, shieldType, 400);

      // 5. For personal arms, difference the shield with cadency marks. Applied
      // after masking so the triangles sit on the finished shield rather than
      // being clipped by it.
      const finalSVG = (isPersonalArms && applyCadency && birthPosition >= 1)
        ? addCadencyToSVG(maskedSVG, birthPosition)
        : maskedSVG;
      setPreviewSVG(finalSVG);

      // 6. Generate blazon — cadency gets its own blazon clause.
      const baseBlazon = generateFullBlazon(field, ordinaries, charges);
      setBlazon(
        (isPersonalArms && applyCadency && birthPosition >= 1)
          ? generatePersonalArmsBlazon(baseBlazon, birthPosition)
          : baseBlazon
      );

    } catch (error) {
      logger.error('Error generating preview:', error);
    }
    setGenerating(false);
  }, [field, ordinaries, charges, shieldType, isPersonalArms, applyCadency, birthPosition]);
  
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
        // Decision C3, step 3. Was an inline object literal carrying its own
        // `version: 2`, which is how a format acquires three spellings and no
        // owner. composeCoat is now the single place a saved composition is
        // shaped.
        //
        // Cadency is recorded here for the first time. It was previously only
        // ever burned into the SVG by addCadencyToSVG, so the composition —
        // the thing that is supposed to describe how the coat is built — did
        // not know the arms were differenced at all. That was survivable while
        // rendering read the stored SVG, and becomes data loss in step 4, which
        // renders from the composition: personal arms would quietly lose their
        // cadency marks on the next redraw.
        composition: composeCoat({
          field,
          ordinaries,
          charges,
          cadency: (isPersonalArms && applyCadency && birthPosition >= 1)
            ? { type: 'triangles', count: birthPosition, position: 'chief', tincture: 'sable' }
            : null,
          generatedAt: new Date().toISOString(),
          unmigrated: carriedUnmigrated
        }),
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
              
              {isPersonalArms && (
                <div className="personal-arms-panel">
                  <h3>Personal arms</h3>
                  <p className="personal-arms-panel__note">
                    {derivedFromName
                      ? <>Derived from <strong>{derivedFromName}</strong>.</>
                      : 'Building personal arms from scratch — no parent arms were found to derive from.'}
                  </p>
                  <label className="personal-arms-panel__toggle">
                    <input
                      type="checkbox"
                      checked={applyCadency}
                      onChange={(e) => setApplyCadency(e.target.checked)}
                      disabled={!birthPosition || birthPosition < 1}
                    />
                    <span>
                      Apply cadency
                      {birthPosition >= 1 && (
                        <> — {birthPosition} {birthPosition === 1 ? 'mark' : 'marks'} (birth position {birthPosition})</>
                      )}
                    </span>
                  </label>
                  {(!birthPosition || birthPosition < 1) && (
                    <p className="personal-arms-panel__note">
                      No birth position was passed, so cadency can’t be calculated.
                    </p>
                  )}
                </div>
              )}

              {previewSVG && (
                <div className="preview-export">
                  <h3>Export</h3>
                  <div className="preview-export__buttons">
                    <button
                      type="button"
                      className="preview-export__btn"
                      onClick={() => handleDownload('svg')}
                      disabled={exporting}
                      title="Download as a scalable vector file"
                    >
                      <Icon name="download" /> SVG
                    </button>
                    <button
                      type="button"
                      className="preview-export__btn"
                      onClick={() => handleDownload('png')}
                      disabled={exporting}
                      title="Download as a 400px PNG image"
                    >
                      <Icon name="download" /> PNG
                    </button>
                  </div>
                  {exportError && (
                    <p className="preview-export__error" role="alert">{exportError}</p>
                  )}
                </div>
              )}

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
                  <h3><Icon name="scroll-text" size={14} /> Codex Entry</h3>
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
            {/* Decision C3, step 5: the field/ordinaries/charges editor is now
                a component that edits a *node*, so it can be pointed at any
                coat in a marshalled shield rather than only at this page. */}
            <CoatEditor
              node={{ type: 'plain', field, ordinaries, charges }}
              onChange={(next) => {
                setField(next.field);
                setOrdinaries(next.ordinaries);
                setCharges(next.charges);
              }}
              activeSection={activeSection}
              onSectionChange={setActiveSection}
            />
            
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
                <span className="collapse-icon">{activeSection === 'shield' ? <Icon name="chevron-down" size={14} /> : <Icon name="chevron-right" size={14} />}</span>
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
                <span className="collapse-icon">{activeSection === 'classification' ? <Icon name="chevron-down" size={14} /> : <Icon name="chevron-right" size={14} />}</span>
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
                <span className="collapse-icon">{activeSection === 'linking' ? <Icon name="chevron-down" size={14} /> : <Icon name="chevron-right" size={14} />}</span>
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
