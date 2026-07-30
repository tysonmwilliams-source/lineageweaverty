/**
 * The recursive heraldic composition model and its migration (decision C3).
 */
export {
  COMPOSITION_VERSION,
  MARSHALLING,
  MAX_MARSHALLING_DEPTH,
  DEFAULT_FIELD,
  createPlainNode,
  createMarshalledNode,
  isPlainNode,
  isMarshalledNode,
  collectLeaves,
  compositionDepth,
  isSimpleComposition,
  validateComposition
} from './compositionModel';

export {
  migrateComposition,
  needsCompositionMigration,
  classifyComposition
} from './migrateComposition';

export {
  readComposition,
  primaryLeaf,
  allLeaves,
  readCadency
} from './readComposition';

export { composeCoat } from './composeCoat';
