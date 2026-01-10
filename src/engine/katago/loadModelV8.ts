import {
  KataGoBinModelParser,
  parseActivationNameV8,
  parseBatchNormV8,
  parseConv2d,
  parseMatBias,
  parseMatMul,
} from './binModelParser';
import type { ParsedKataGoModelV8 } from './modelV8';

export function parseKataGoModelV8(data: Uint8Array): ParsedKataGoModelV8 {
  const p = new KataGoBinModelParser(data);

  const modelName = p.readToken();
  const modelVersion = p.readInt();
  if (modelVersion !== 8) {
    throw new Error(`Unsupported modelVersion ${modelVersion}, expected 8`);
  }
  const numInputChannels = p.readInt();
  const numInputGlobalChannels = p.readInt();

  // trunk header
  const trunkName = p.readToken();
  if (trunkName !== 'trunk') {
    throw new Error(`Unexpected trunk name ${trunkName}`);
  }
  const numBlocks = p.readInt();
  const trunkNumChannels = p.readInt();
  const midNumChannels = p.readInt();
  const regularNumChannels = p.readInt();
  p.readInt();
  const gpoolNumChannels = p.readInt();

  const conv1 = parseConv2d(p);
  const ginput = parseMatMul(p);

  const blocks: ParsedKataGoModelV8['trunk']['blocks'] = [];
  for (let i = 0; i < numBlocks; i++) {
    const kindTok = p.readToken();
    if (kindTok === 'ordinary_block') {
      p.readToken();
      const preBN = parseBatchNormV8(p);
      void parseActivationNameV8(p);
      const w1 = parseConv2d(p);
      const midBN = parseBatchNormV8(p);
      void parseActivationNameV8(p);
      const w2 = parseConv2d(p);

      blocks.push({ kind: 'ordinary', preBN, w1, midBN, w2 });
      continue;
    }

    if (kindTok === 'gpool_block') {
      p.readToken();
      const preBN = parseBatchNormV8(p);
      void parseActivationNameV8(p);
      const w1a = parseConv2d(p);
      const w1b = parseConv2d(p);
      const gpoolBN = parseBatchNormV8(p);
      void parseActivationNameV8(p);
      const w1r = parseMatMul(p);
      const midBN = parseBatchNormV8(p);
      void parseActivationNameV8(p);
      const w2 = parseConv2d(p);

      blocks.push({ kind: 'gpool', preBN, w1a, w1b, gpoolBN, w1r, midBN, w2 });
      continue;
    }

    throw new Error(`Unsupported trunk block kind ${kindTok}`);
  }

  const tipBN = parseBatchNormV8(p);
  void parseActivationNameV8(p);

  // policy head
  const policyHeadName = p.readToken();
  if (policyHeadName !== 'policyhead') {
    throw new Error(`Unexpected policy head name ${policyHeadName}`);
  }
  const p1 = parseConv2d(p);
  const g1 = parseConv2d(p);
  const g1BN = parseBatchNormV8(p);
  void parseActivationNameV8(p);
  const gpoolToBias = parseMatMul(p);
  const p1BN = parseBatchNormV8(p);
  void parseActivationNameV8(p);
  const p2 = parseConv2d(p);
  const passMul = parseMatMul(p);

  // value head
  const valueHeadName = p.readToken();
  if (valueHeadName !== 'valuehead') {
    throw new Error(`Unexpected value head name ${valueHeadName}`);
  }
  const v1 = parseConv2d(p);
  const v1BN = parseBatchNormV8(p);
  void parseActivationNameV8(p);
  const v2 = parseMatMul(p);
  const v2Bias = parseMatBias(p);
  void parseActivationNameV8(p);
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
    },
    policy: {
      p1,
      g1,
      g1BN,
      gpoolToBias,
      p1BN,
      p2,
      passMul,
    },
    value: {
      v1,
      v1BN,
      v2,
      v2Bias,
      v3,
      v3Bias,
      sv3,
      sv3Bias,
      ownership,
    },
  };
}
