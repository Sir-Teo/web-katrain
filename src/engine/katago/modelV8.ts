import * as tf from '@tensorflow/tfjs';
import type {
  ActivationKind,
  ParsedBatchNorm,
  ParsedConv2d,
  ParsedMatBias,
  ParsedMatMul,
} from './binModelParser';

type TfBn = { scale: tf.Tensor4D; bias: tf.Tensor4D };

type TfConv = {
  kernelY: number;
  kernelX: number;
  inChannels: number;
  outChannels: number;
  dilationY: number;
  dilationX: number;
  filter: tf.Tensor4D;
};

type TfMatMul = {
  inChannels: number;
  outChannels: number;
  w: tf.Tensor2D;
};

type TfMatBias = {
  channels: number;
  b: tf.Tensor2D; // [1,channels]
};

function makeBn(bn: ParsedBatchNorm): TfBn {
  const scale = tf.tensor4d(bn.mergedScale, [1, 1, 1, bn.channels]);
  const bias = tf.tensor4d(bn.mergedBias, [1, 1, 1, bn.channels]);
  return { scale, bias };
}

function makeConv(conv: ParsedConv2d): TfConv {
  // File weights are in [kY,kX,inC,outC] which matches tf.conv2d filter format.
  const filter = tf.tensor4d(conv.weights, [conv.kernelY, conv.kernelX, conv.inChannels, conv.outChannels]);
  return {
    kernelY: conv.kernelY,
    kernelX: conv.kernelX,
    inChannels: conv.inChannels,
    outChannels: conv.outChannels,
    dilationY: conv.dilationY,
    dilationX: conv.dilationX,
    filter,
  };
}

function makeMatMul(mm: ParsedMatMul): TfMatMul {
  const w = tf.tensor2d(mm.weights, [mm.inChannels, mm.outChannels]);
  return { inChannels: mm.inChannels, outChannels: mm.outChannels, w };
}

function makeMatBias(bias: ParsedMatBias): TfMatBias {
  const b = tf.tensor2d(bias.weights, [1, bias.channels]);
  return { channels: bias.channels, b };
}

function applyActivation4D(x: tf.Tensor4D, kind: ActivationKind): tf.Tensor4D {
  if (kind === 'identity') return x;
  if (kind === 'relu') return tf.relu(x) as tf.Tensor4D;
  // mish: x * tanh(softplus(x))
  return tf.mul(x, tf.tanh(tf.softplus(x))) as tf.Tensor4D;
}

function applyActivation2D(x: tf.Tensor2D, kind: ActivationKind): tf.Tensor2D {
  if (kind === 'identity') return x;
  if (kind === 'relu') return tf.relu(x) as tf.Tensor2D;
  return tf.mul(x, tf.tanh(tf.softplus(x))) as tf.Tensor2D;
}

function bnAct(x: tf.Tensor4D, bn: TfBn, activation: ActivationKind): tf.Tensor4D {
  const y = tf.add(tf.mul(x, bn.scale), bn.bias) as tf.Tensor4D;
  return applyActivation4D(y, activation);
}

function conv2d(x: tf.Tensor4D, conv: TfConv): tf.Tensor4D {
  return tf.conv2d(x, conv.filter, 1, 'same', 'NHWC', [conv.dilationY, conv.dilationX]) as tf.Tensor4D;
}

function poolRowsGPool(x: tf.Tensor4D): tf.Tensor2D {
  // KataGo gpool: concat(mean, mean * (sqrt(div)-14)*0.1, max). For 19x19 board div=361 => sqrt=19 => factor=0.5.
  const mean = tf.mean(x, [1, 2]) as tf.Tensor2D; // [N,C]
  const max = tf.max(x, [1, 2]) as tf.Tensor2D; // [N,C]
  return tf.concat([mean, mean.mul(0.5), max], 1) as tf.Tensor2D;
}

function poolRowsValueHead(x: tf.Tensor4D): tf.Tensor2D {
  // KataGo value pooling: concat(mean, mean * (sqrt(div)-14)*0.1, mean * (((sqrt(div)-14)^2)*0.01 - 0.1)).
  // For 19x19 div=361 => sqrt=19 => factors 0.5 and 0.15.
  const mean = tf.mean(x, [1, 2]) as tf.Tensor2D; // [N,C]
  return tf.concat([mean, mean.mul(0.5), mean.mul(0.15)], 1) as tf.Tensor2D;
}

export type ParsedTrunkBlock =
  | {
      kind: 'ordinary';
      preBN: ParsedBatchNorm;
      preActivation: ActivationKind;
      w1: ParsedConv2d;
      midBN: ParsedBatchNorm;
      midActivation: ActivationKind;
      w2: ParsedConv2d;
    }
  | {
      kind: 'gpool';
      preBN: ParsedBatchNorm;
      preActivation: ActivationKind;
      w1a: ParsedConv2d;
      w1b: ParsedConv2d;
      gpoolBN: ParsedBatchNorm;
      gpoolActivation: ActivationKind;
      w1r: ParsedMatMul;
      midBN: ParsedBatchNorm;
      midActivation: ActivationKind;
      w2: ParsedConv2d;
    }
  | {
      kind: 'nested_bottleneck';
      numBlocks: number;
      preBN: ParsedBatchNorm;
      preActivation: ActivationKind;
      preConv: ParsedConv2d;
      blocks: ParsedTrunkBlock[];
      postBN: ParsedBatchNorm;
      postActivation: ActivationKind;
      postConv: ParsedConv2d;
    };

export type ParsedKataGoModelV8 = {
  modelName: string;
  modelVersion: number;
  numInputChannels: number;
  numInputGlobalChannels: number;
  postProcessParams: {
    tdScoreMultiplier: number;
    scoreMeanMultiplier: number;
    scoreStdevMultiplier: number;
    leadMultiplier: number;
    varianceTimeMultiplier: number;
    shorttermValueErrorMultiplier: number;
    shorttermScoreErrorMultiplier: number;
    outputScaleMultiplier: number;
  };
  policyOutChannels: number;
  scoreValueChannels: number;
  trunk: {
    numBlocks: number;
    trunkNumChannels: number;
    midNumChannels: number;
    regularNumChannels: number;
    gpoolNumChannels: number;
    conv1: ParsedConv2d;
    ginput: ParsedMatMul;
    blocks: ParsedTrunkBlock[];
    tipBN: ParsedBatchNorm;
    tipActivation: ActivationKind;
  };
  policy: {
    p1: ParsedConv2d;
    g1: ParsedConv2d;
    g1BN: ParsedBatchNorm;
    g1Activation: ActivationKind;
    gpoolToBias: ParsedMatMul;
    p1BN: ParsedBatchNorm;
    p1Activation: ActivationKind;
    p2: ParsedConv2d;
    passMul: ParsedMatMul;
  };
  value: {
    v1: ParsedConv2d;
    v1BN: ParsedBatchNorm;
    v1Activation: ActivationKind;
    v2: ParsedMatMul;
    v2Bias: ParsedMatBias;
    v2Activation: ActivationKind;
    v3: ParsedMatMul;
    v3Bias: ParsedMatBias;
    sv3: ParsedMatMul;
    sv3Bias: ParsedMatBias;
    ownership: ParsedConv2d;
  };
};

type TfTrunkBlock =
  | {
      kind: 'ordinary';
      preBN: TfBn;
      preActivation: ActivationKind;
      w1: TfConv;
      midBN: TfBn;
      midActivation: ActivationKind;
      w2: TfConv;
    }
  | {
      kind: 'gpool';
      preBN: TfBn;
      preActivation: ActivationKind;
      w1a: TfConv;
      w1b: TfConv;
      gpoolBN: TfBn;
      gpoolActivation: ActivationKind;
      w1r: TfMatMul;
      midBN: TfBn;
      midActivation: ActivationKind;
      w2: TfConv;
    }
  | {
      kind: 'nested_bottleneck';
      numBlocks: number;
      preBN: TfBn;
      preActivation: ActivationKind;
      preConv: TfConv;
      blocks: TfTrunkBlock[];
      postBN: TfBn;
      postActivation: ActivationKind;
      postConv: TfConv;
    };

export class KataGoModelV8Tf {
  readonly modelName: string;
  readonly modelVersion: number;
  readonly postProcessParams: ParsedKataGoModelV8['postProcessParams'];
  readonly policyOutChannels: number;
  readonly scoreValueChannels: number;

  private readonly trunkConv1: TfConv;
  private readonly trunkGInput: TfMatMul;
  private readonly trunkBlocks: TfTrunkBlock[];
  private readonly trunkTipBN: TfBn;
  private readonly trunkTipActivation: ActivationKind;

  private readonly p1: TfConv;
  private readonly g1: TfConv;
  private readonly g1BN: TfBn;
  private readonly g1Activation: ActivationKind;
  private readonly gpoolToBias: TfMatMul;
  private readonly p1BN: TfBn;
  private readonly p1Activation: ActivationKind;
  private readonly p2: TfConv;
  private readonly passMul: TfMatMul;

  private readonly v1: TfConv;
  private readonly v1BN: TfBn;
  private readonly v1Activation: ActivationKind;
  private readonly v2: TfMatMul;
  private readonly v2Bias: TfMatBias;
  private readonly v2Activation: ActivationKind;
  private readonly v3: TfMatMul;
  private readonly v3Bias: TfMatBias;
  private readonly sv3: TfMatMul;
  private readonly sv3Bias: TfMatBias;
  private readonly ownership: TfConv;

  constructor(parsed: ParsedKataGoModelV8) {
    this.modelName = parsed.modelName;
    this.modelVersion = parsed.modelVersion;
    this.postProcessParams = parsed.postProcessParams;
    this.policyOutChannels = parsed.policyOutChannels;
    this.scoreValueChannels = parsed.scoreValueChannels;

    this.trunkConv1 = makeConv(parsed.trunk.conv1);
    this.trunkGInput = makeMatMul(parsed.trunk.ginput);
    const toTfBlock = (b: ParsedTrunkBlock): TfTrunkBlock => {
      if (b.kind === 'ordinary') {
        return {
          kind: 'ordinary',
          preBN: makeBn(b.preBN),
          preActivation: b.preActivation,
          w1: makeConv(b.w1),
          midBN: makeBn(b.midBN),
          midActivation: b.midActivation,
          w2: makeConv(b.w2),
        };
      }
      if (b.kind === 'gpool') {
        return {
          kind: 'gpool',
          preBN: makeBn(b.preBN),
          preActivation: b.preActivation,
          w1a: makeConv(b.w1a),
          w1b: makeConv(b.w1b),
          gpoolBN: makeBn(b.gpoolBN),
          gpoolActivation: b.gpoolActivation,
          w1r: makeMatMul(b.w1r),
          midBN: makeBn(b.midBN),
          midActivation: b.midActivation,
          w2: makeConv(b.w2),
        };
      }
      return {
        kind: 'nested_bottleneck',
        numBlocks: b.numBlocks,
        preBN: makeBn(b.preBN),
        preActivation: b.preActivation,
        preConv: makeConv(b.preConv),
        blocks: b.blocks.map(toTfBlock),
        postBN: makeBn(b.postBN),
        postActivation: b.postActivation,
        postConv: makeConv(b.postConv),
      };
    };
    this.trunkBlocks = parsed.trunk.blocks.map(toTfBlock);
    this.trunkTipBN = makeBn(parsed.trunk.tipBN);
    this.trunkTipActivation = parsed.trunk.tipActivation;

    this.p1 = makeConv(parsed.policy.p1);
    this.g1 = makeConv(parsed.policy.g1);
    this.g1BN = makeBn(parsed.policy.g1BN);
    this.g1Activation = parsed.policy.g1Activation;
    this.gpoolToBias = makeMatMul(parsed.policy.gpoolToBias);
    this.p1BN = makeBn(parsed.policy.p1BN);
    this.p1Activation = parsed.policy.p1Activation;
    this.p2 = makeConv(parsed.policy.p2);
    this.passMul = makeMatMul(parsed.policy.passMul);

    this.v1 = makeConv(parsed.value.v1);
    this.v1BN = makeBn(parsed.value.v1BN);
    this.v1Activation = parsed.value.v1Activation;
    this.v2 = makeMatMul(parsed.value.v2);
    this.v2Bias = makeMatBias(parsed.value.v2Bias);
    this.v2Activation = parsed.value.v2Activation;
    this.v3 = makeMatMul(parsed.value.v3);
    this.v3Bias = makeMatBias(parsed.value.v3Bias);
    this.sv3 = makeMatMul(parsed.value.sv3);
    this.sv3Bias = makeMatBias(parsed.value.sv3Bias);
    this.ownership = makeConv(parsed.value.ownership);
  }

  forward(spatial: tf.Tensor4D, global: tf.Tensor2D): {
    policy: tf.Tensor4D;
    policyPass: tf.Tensor2D;
    value: tf.Tensor2D;
    scoreValue: tf.Tensor2D;
    ownership: tf.Tensor4D;
  } {
    return tf.tidy(() => {
      const trunk = this.forwardTrunk(spatial, global);

      // Policy head
      let p1Out = conv2d(trunk, this.p1);
      const g1Out = conv2d(trunk, this.g1);
      const g1Out2 = bnAct(g1Out, this.g1BN, this.g1Activation);
      const g1Concat = poolRowsGPool(g1Out2); // [N, g1C*3]
      const g1Bias = tf.matMul(g1Concat, this.gpoolToBias.w) as tf.Tensor2D; // [N, p1C]
      p1Out = p1Out.add(g1Bias.reshape([g1Bias.shape[0], 1, 1, g1Bias.shape[1]])) as tf.Tensor4D;
      const p1Out2 = bnAct(p1Out, this.p1BN, this.p1Activation);

      let policy = conv2d(p1Out2, this.p2); // [N,19,19,policyOutChannels]
      let policyPass = tf.matMul(g1Concat, this.passMul.w) as tf.Tensor2D; // [N,policyOutChannels]
      if (this.policyOutChannels > 1) {
        policy = policy.slice([0, 0, 0, 0], [policy.shape[0], policy.shape[1], policy.shape[2], 1]) as tf.Tensor4D;
        policyPass = policyPass.slice([0, 0], [policyPass.shape[0], 1]) as tf.Tensor2D;
      }

      // Value head
      const v1Out = conv2d(trunk, this.v1);
      const v1Out2 = bnAct(v1Out, this.v1BN, this.v1Activation);
      const v1Mean = poolRowsValueHead(v1Out2); // [N,96]
      let v2Out = tf.matMul(v1Mean, this.v2.w) as tf.Tensor2D; // [N,64]
      v2Out = v2Out.add(this.v2Bias.b) as tf.Tensor2D;
      v2Out = applyActivation2D(v2Out, this.v2Activation);
      let value = tf.matMul(v2Out, this.v3.w) as tf.Tensor2D; // [N,3]
      value = value.add(this.v3Bias.b) as tf.Tensor2D;
      let scoreValue = tf.matMul(v2Out, this.sv3.w) as tf.Tensor2D; // [N,scoreValueChannels]
      scoreValue = scoreValue.add(this.sv3Bias.b) as tf.Tensor2D;
      if (this.scoreValueChannels > 4) {
        scoreValue = scoreValue.slice([0, 0], [scoreValue.shape[0], 4]) as tf.Tensor2D;
      }

      const ownership = conv2d(v1Out2, this.ownership); // [N,19,19,1]

      return { policy, policyPass, value, scoreValue, ownership };
    });
  }

  forwardPolicyValue(spatial: tf.Tensor4D, global: tf.Tensor2D): {
    policy: tf.Tensor4D;
    policyPass: tf.Tensor2D;
    value: tf.Tensor2D;
    scoreValue: tf.Tensor2D;
  } {
    return tf.tidy(() => {
      const trunk = this.forwardTrunk(spatial, global);

      let p1Out = conv2d(trunk, this.p1);
      const g1Out = conv2d(trunk, this.g1);
      const g1Out2 = bnAct(g1Out, this.g1BN, this.g1Activation);
      const g1Concat = poolRowsGPool(g1Out2);
      const g1Bias = tf.matMul(g1Concat, this.gpoolToBias.w) as tf.Tensor2D;
      p1Out = p1Out.add(g1Bias.reshape([g1Bias.shape[0], 1, 1, g1Bias.shape[1]])) as tf.Tensor4D;
      const p1Out2 = bnAct(p1Out, this.p1BN, this.p1Activation);

      let policy = conv2d(p1Out2, this.p2);
      let policyPass = tf.matMul(g1Concat, this.passMul.w) as tf.Tensor2D;
      if (this.policyOutChannels > 1) {
        policy = policy.slice([0, 0, 0, 0], [policy.shape[0], policy.shape[1], policy.shape[2], 1]) as tf.Tensor4D;
        policyPass = policyPass.slice([0, 0], [policyPass.shape[0], 1]) as tf.Tensor2D;
      }

      const v1Out = conv2d(trunk, this.v1);
      const v1Out2 = bnAct(v1Out, this.v1BN, this.v1Activation);
      const v1Mean = poolRowsValueHead(v1Out2);
      let v2Out = tf.matMul(v1Mean, this.v2.w) as tf.Tensor2D;
      v2Out = v2Out.add(this.v2Bias.b) as tf.Tensor2D;
      v2Out = applyActivation2D(v2Out, this.v2Activation);
      let value = tf.matMul(v2Out, this.v3.w) as tf.Tensor2D;
      value = value.add(this.v3Bias.b) as tf.Tensor2D;
      let scoreValue = tf.matMul(v2Out, this.sv3.w) as tf.Tensor2D;
      scoreValue = scoreValue.add(this.sv3Bias.b) as tf.Tensor2D;
      if (this.scoreValueChannels > 4) {
        scoreValue = scoreValue.slice([0, 0], [scoreValue.shape[0], 4]) as tf.Tensor2D;
      }

      return { policy, policyPass, value, scoreValue };
    });
  }

  forwardValueOnly(
    spatial: tf.Tensor4D,
    global: tf.Tensor2D
  ): {
    value: tf.Tensor2D;
    scoreValue: tf.Tensor2D;
  } {
    return tf.tidy(() => {
      const trunk = this.forwardTrunk(spatial, global);
      const v1Out = conv2d(trunk, this.v1);
      const v1Out2 = bnAct(v1Out, this.v1BN, this.v1Activation);
      const v1Mean = poolRowsValueHead(v1Out2);
      let v2Out = tf.matMul(v1Mean, this.v2.w) as tf.Tensor2D;
      v2Out = v2Out.add(this.v2Bias.b) as tf.Tensor2D;
      v2Out = applyActivation2D(v2Out, this.v2Activation);
      let value = tf.matMul(v2Out, this.v3.w) as tf.Tensor2D;
      value = value.add(this.v3Bias.b) as tf.Tensor2D;
      let scoreValue = tf.matMul(v2Out, this.sv3.w) as tf.Tensor2D;
      scoreValue = scoreValue.add(this.sv3Bias.b) as tf.Tensor2D;
      if (this.scoreValueChannels > 4) {
        scoreValue = scoreValue.slice([0, 0], [scoreValue.shape[0], 4]) as tf.Tensor2D;
      }
      return { value, scoreValue };
    });
  }

  private forwardTrunk(spatial: tf.Tensor4D, global: tf.Tensor2D): tf.Tensor4D {
    let trunk = conv2d(spatial, this.trunkConv1);
    const ginput = tf.matMul(global, this.trunkGInput.w) as tf.Tensor2D;
    trunk = trunk.add(ginput.reshape([ginput.shape[0], 1, 1, ginput.shape[1]])) as tf.Tensor4D;
    trunk = this.applyBlockStack(trunk, this.trunkBlocks);
    return bnAct(trunk, this.trunkTipBN, this.trunkTipActivation);
  }

  private applyBlockStack(trunk: tf.Tensor4D, blocks: TfTrunkBlock[]): tf.Tensor4D {
    for (const block of blocks) {
      if (block.kind === 'ordinary') {
        const a = bnAct(trunk, block.preBN, block.preActivation);
        const b = conv2d(a, block.w1);
        const c = bnAct(b, block.midBN, block.midActivation);
        const d = conv2d(c, block.w2);
        trunk = trunk.add(d) as tf.Tensor4D;
        continue;
      }

      if (block.kind === 'gpool') {
        const a = bnAct(trunk, block.preBN, block.preActivation);
        let regularOut = conv2d(a, block.w1a);
        const gpoolOut = conv2d(a, block.w1b);
        const gpoolOut2 = bnAct(gpoolOut, block.gpoolBN, block.gpoolActivation);
        const gpoolConcat = poolRowsGPool(gpoolOut2);
        const gpoolBias = tf.matMul(gpoolConcat, block.w1r.w) as tf.Tensor2D;
        regularOut = regularOut.add(gpoolBias.reshape([gpoolBias.shape[0], 1, 1, gpoolBias.shape[1]])) as tf.Tensor4D;
        const c = bnAct(regularOut, block.midBN, block.midActivation);
        const d = conv2d(c, block.w2);
        trunk = trunk.add(d) as tf.Tensor4D;
        continue;
      }

      // nested_bottleneck
      const a = bnAct(trunk, block.preBN, block.preActivation);
      let mid = conv2d(a, block.preConv);
      mid = this.applyBlockStack(mid, block.blocks);
      const c = bnAct(mid, block.postBN, block.postActivation);
      const d = conv2d(c, block.postConv);
      trunk = trunk.add(d) as tf.Tensor4D;
    }
    return trunk;
  }

  dispose(): void {
    const tensors: tf.Tensor[] = [
      this.trunkConv1.filter,
      this.trunkGInput.w,
      this.trunkTipBN.scale,
      this.trunkTipBN.bias,
      this.p1.filter,
      this.g1.filter,
      this.g1BN.scale,
      this.g1BN.bias,
      this.gpoolToBias.w,
      this.p1BN.scale,
      this.p1BN.bias,
      this.p2.filter,
      this.passMul.w,
      this.v1.filter,
      this.v1BN.scale,
      this.v1BN.bias,
      this.v2.w,
      this.v2Bias.b,
      this.v3.w,
      this.v3Bias.b,
      this.sv3.w,
      this.sv3Bias.b,
      this.ownership.filter,
    ];

    const pushBlockTensors = (block: TfTrunkBlock): void => {
      tensors.push(block.preBN.scale, block.preBN.bias);
      if (block.kind === 'ordinary') {
        tensors.push(block.w1.filter, block.midBN.scale, block.midBN.bias, block.w2.filter);
        return;
      }
      if (block.kind === 'gpool') {
        tensors.push(
          block.w1a.filter,
          block.w1b.filter,
          block.gpoolBN.scale,
          block.gpoolBN.bias,
          block.w1r.w,
          block.midBN.scale,
          block.midBN.bias,
          block.w2.filter
        );
        return;
      }
      tensors.push(block.preConv.filter);
      for (const inner of block.blocks) pushBlockTensors(inner);
      tensors.push(block.postBN.scale, block.postBN.bias, block.postConv.filter);
    };

    for (const block of this.trunkBlocks) pushBlockTensors(block);

    tf.dispose(tensors);
  }
}
