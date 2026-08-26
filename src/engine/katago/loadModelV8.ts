import {
  KataGoBinModelParser,
  parseActivationKind,
  parseBatchNormV8,
  parseConv2d,
  parseMatBias,
  parseMatMul,
} from './binModelParser';
import type { ParsedKataGoModelV8 } from './modelV8';

/** KataGo SGFMetadata::METADATA_INPUT_NUM_CHANNELS for meta encoder version 1. */
export const NUM_INPUT_META_CHANNELS_V1 = 192;

export function parseKataGoModelV8(data: Uint8Array): ParsedKataGoModelV8 {
  const p = new KataGoBinModelParser(data);

  const modelName = p.readToken();
  const modelVersion = p.readInt();
  if (modelVersion < 8 || modelVersion > 16) {
    throw new Error(`Unsupported modelVersion ${modelVersion}, supported 8..16`);
  }
  const numInputChannels = p.readInt();
  const numInputGlobalChannels = p.readInt();

  const postProcessParams =
    modelVersion >= 13
      ? {
          tdScoreMultiplier: p.readFloatAscii(),
          scoreMeanMultiplier: p.readFloatAscii(),
          scoreStdevMultiplier: p.readFloatAscii(),
          leadMultiplier: p.readFloatAscii(),
          varianceTimeMultiplier: p.readFloatAscii(),
          shorttermValueErrorMultiplier: p.readFloatAscii(),
          shorttermScoreErrorMultiplier: p.readFloatAscii(),
          outputScaleMultiplier: 1.0,
        }
      : {
          // Defaults for older models (ModelPostProcessParams).
          tdScoreMultiplier: 20.0,
          scoreMeanMultiplier: 20.0,
          scoreStdevMultiplier: 20.0,
          leadMultiplier: 20.0,
          varianceTimeMultiplier: 40.0,
          shorttermValueErrorMultiplier: 0.25,
          shorttermScoreErrorMultiplier: 30.0,
          outputScaleMultiplier: 1.0,
        };

  const metaEncoderVersion = modelVersion >= 15 ? p.readInt() : 0;
  if (modelVersion >= 15) {
    for (let i = 0; i < 7; i++) p.readInt(); // Unused model-level params in KataGo v15+.
  }
  // Version 1 is the SGF metadata encoder that the human SL nets use.
  if (metaEncoderVersion !== 0 && metaEncoderVersion !== 1) {
    throw new Error(`Unsupported metaEncoderVersion ${metaEncoderVersion}`);
  }

  // trunk header
  p.readToken(); // trunk name
  const numBlocks = p.readInt();
  const trunkNumChannels = p.readInt();
  const midNumChannels = p.readInt();
  const regularNumChannels = p.readInt();
  p.readInt();
  const gpoolNumChannels = p.readInt();
  if (modelVersion >= 15) {
    const trunkNormKind = p.readInt();
    // 0 is KataGo's standard batch-norm trunk; 1 is RMS norm, which this port does
    // not implement, so refuse rather than reading the weights as the wrong shape.
    if (trunkNormKind !== 0) throw new Error(`Unsupported trunk norm kind ${trunkNormKind}`);
    for (let i = 0; i < 5; i++) p.readInt(); // Unused trunk params in KataGo v15+.
  }

  const conv1 = parseConv2d(p);
  const ginput = parseMatMul(p);

  // KataGo SGFMetadataEncoderDesc: a small MLP over the game metadata whose output
  // is added to the trunk as another per-channel bias (cpp/neuralnet/desc.cpp).
  let metaEncoder: ParsedKataGoModelV8['metaEncoder'];
  if (metaEncoderVersion > 0) {
    p.readToken(); // meta encoder name
    const numInputMetaChannels = p.readInt();
    if (numInputMetaChannels !== NUM_INPUT_META_CHANNELS_V1) {
      throw new Error(`Unexpected numInputMetaChannels ${numInputMetaChannels}`);
    }
    const mul1 = parseMatMul(p);
    const bias1 = parseMatBias(p);
    const act1 = parseActivationKind(p, modelVersion);
    const mul2 = parseMatMul(p);
    const bias2 = parseMatBias(p);
    const act2 = parseActivationKind(p, modelVersion);
    const mul3 = parseMatMul(p);
    if (mul3.outChannels !== trunkNumChannels) {
      throw new Error(`Meta encoder output ${mul3.outChannels} does not match trunk channels ${trunkNumChannels}`);
    }
    metaEncoder = { numInputMetaChannels, mul1, bias1, act1, mul2, bias2, act2, mul3 };
  }

  function parseResidualBlock(): ParsedKataGoModelV8['trunk']['blocks'][number] {
    const kindTok = p.readToken();

    if (kindTok === 'ordinary_block') {
      p.readToken(); // block name
      const preBN = parseBatchNormV8(p);
      const preActivation = parseActivationKind(p, modelVersion);
      const w1 = parseConv2d(p);
      const midBN = parseBatchNormV8(p);
      const midActivation = parseActivationKind(p, modelVersion);
      const w2 = parseConv2d(p);
      return { kind: 'ordinary', preBN, preActivation, w1, midBN, midActivation, w2 };
    }

    if (kindTok === 'gpool_block') {
      p.readToken(); // block name
      const preBN = parseBatchNormV8(p);
      const preActivation = parseActivationKind(p, modelVersion);
      const w1a = parseConv2d(p);
      const w1b = parseConv2d(p);
      const gpoolBN = parseBatchNormV8(p);
      const gpoolActivation = parseActivationKind(p, modelVersion);
      const w1r = parseMatMul(p);
      const midBN = parseBatchNormV8(p);
      const midActivation = parseActivationKind(p, modelVersion);
      const w2 = parseConv2d(p);
      return { kind: 'gpool', preBN, preActivation, w1a, w1b, gpoolBN, gpoolActivation, w1r, midBN, midActivation, w2 };
    }

    if (kindTok === 'nested_bottleneck_block') {
      p.readToken(); // block name
      const numInnerBlocks = p.readInt();
      const preBN = parseBatchNormV8(p);
      const preActivation = parseActivationKind(p, modelVersion);
      const preConv = parseConv2d(p);

      const blocks: ParsedKataGoModelV8['trunk']['blocks'] = [];
      for (let i = 0; i < numInnerBlocks; i++) blocks.push(parseResidualBlock());

      const postBN = parseBatchNormV8(p);
      const postActivation = parseActivationKind(p, modelVersion);
      const postConv = parseConv2d(p);
      return { kind: 'nested_bottleneck', numBlocks: numInnerBlocks, preBN, preActivation, preConv, blocks, postBN, postActivation, postConv };
    }

    throw new Error(`Unsupported trunk block kind ${kindTok}`);
  }

  const blocks: ParsedKataGoModelV8['trunk']['blocks'] = [];
  for (let i = 0; i < numBlocks; i++) blocks.push(parseResidualBlock());

  const tipBN = parseBatchNormV8(p);
  const tipActivation = parseActivationKind(p, modelVersion);

  // policy head
  p.readToken(); // policy head name
  const p1 = parseConv2d(p);
  const g1 = parseConv2d(p);
  const g1BN = parseBatchNormV8(p);
  const g1Activation = parseActivationKind(p, modelVersion);
  const gpoolToBias = parseMatMul(p);
  const p1BN = parseBatchNormV8(p);
  const p1Activation = parseActivationKind(p, modelVersion);
  const p2 = parseConv2d(p);
  const passMul = parseMatMul(p);
  const passBias = modelVersion >= 15 ? parseMatBias(p) : undefined;
  const passActivation = modelVersion >= 15 ? parseActivationKind(p, modelVersion) : undefined;
  const passMul2 = modelVersion >= 15 ? parseMatMul(p) : undefined;

  // value head
  p.readToken(); // value head name
  const v1 = parseConv2d(p);
  const v1BN = parseBatchNormV8(p);
  const v1Activation = parseActivationKind(p, modelVersion);
  const v2 = parseMatMul(p);
  const v2Bias = parseMatBias(p);
  const v2Activation = parseActivationKind(p, modelVersion);
  const v3 = parseMatMul(p);
  const v3Bias = parseMatBias(p);
  const sv3 = parseMatMul(p);
  const sv3Bias = parseMatBias(p);
  const ownership = parseConv2d(p);

  return {
    modelName,
    modelVersion,
    numInputChannels,
    numInputGlobalChannels,
    metaEncoderVersion,
    metaEncoder,
    postProcessParams,
    policyOutChannels: p2.outChannels,
    scoreValueChannels: sv3.outChannels,
    trunk: {
      numBlocks,
      trunkNumChannels,
      midNumChannels,
      regularNumChannels,
      gpoolNumChannels,
      conv1,
      ginput,
      blocks,
      tipBN,
      tipActivation,
    },
    policy: {
      p1,
      g1,
      g1BN,
      g1Activation,
      gpoolToBias,
      p1BN,
      p1Activation,
      p2,
      passMul,
      passBias,
      passActivation,
      passMul2,
    },
    value: {
      v1,
      v1BN,
      v1Activation,
      v2,
      v2Bias,
      v2Activation,
      v3,
      v3Bias,
      sv3,
      sv3Bias,
      ownership,
    },
  };
}
