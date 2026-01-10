import * as tf from '@tensorflow/tfjs';
import type {
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

function bnRelu(x: tf.Tensor4D, bn: TfBn): tf.Tensor4D {
  return tf.relu(tf.add(tf.mul(x, bn.scale), bn.bias)) as tf.Tensor4D;
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

export type ParsedKataGoModelV8 = {
  modelName: string;
  modelVersion: number;
  numInputChannels: number;
  numInputGlobalChannels: number;
  trunk: {
    numBlocks: number;
    trunkNumChannels: number;
    midNumChannels: number;
    regularNumChannels: number;
    gpoolNumChannels: number;
    conv1: ParsedConv2d;
    ginput: ParsedMatMul;
    blocks: Array<
      | {
          kind: 'ordinary';
          preBN: ParsedBatchNorm;
          w1: ParsedConv2d;
          midBN: ParsedBatchNorm;
          w2: ParsedConv2d;
        }
      | {
          kind: 'gpool';
          preBN: ParsedBatchNorm;
          w1a: ParsedConv2d;
          w1b: ParsedConv2d;
          gpoolBN: ParsedBatchNorm;
          w1r: ParsedMatMul;
          midBN: ParsedBatchNorm;
          w2: ParsedConv2d;
        }
    >;
    tipBN: ParsedBatchNorm;
  };
  policy: {
    p1: ParsedConv2d;
    g1: ParsedConv2d;
    g1BN: ParsedBatchNorm;
    gpoolToBias: ParsedMatMul;
    p1BN: ParsedBatchNorm;
    p2: ParsedConv2d;
    passMul: ParsedMatMul;
  };
  value: {
    v1: ParsedConv2d;
    v1BN: ParsedBatchNorm;
    v2: ParsedMatMul;
    v2Bias: ParsedMatBias;
    v3: ParsedMatMul;
    v3Bias: ParsedMatBias;
    sv3: ParsedMatMul;
    sv3Bias: ParsedMatBias;
    ownership: ParsedConv2d;
  };
};

export class KataGoModelV8Tf {
  readonly modelName: string;
  readonly modelVersion: number;

  private readonly trunkConv1: TfConv;
  private readonly trunkGInput: TfMatMul;
  private readonly trunkBlocks: Array<
    | { kind: 'ordinary'; preBN: TfBn; w1: TfConv; midBN: TfBn; w2: TfConv }
    | { kind: 'gpool'; preBN: TfBn; w1a: TfConv; w1b: TfConv; gpoolBN: TfBn; w1r: TfMatMul; midBN: TfBn; w2: TfConv }
  >;
  private readonly trunkTipBN: TfBn;

  private readonly p1: TfConv;
  private readonly g1: TfConv;
  private readonly g1BN: TfBn;
  private readonly gpoolToBias: TfMatMul;
  private readonly p1BN: TfBn;
  private readonly p2: TfConv;
  private readonly passMul: TfMatMul;

  private readonly v1: TfConv;
  private readonly v1BN: TfBn;
  private readonly v2: TfMatMul;
  private readonly v2Bias: TfMatBias;
  private readonly v3: TfMatMul;
  private readonly v3Bias: TfMatBias;
  private readonly sv3: TfMatMul;
  private readonly sv3Bias: TfMatBias;
  private readonly ownership: TfConv;

  constructor(parsed: ParsedKataGoModelV8) {
    this.modelName = parsed.modelName;
    this.modelVersion = parsed.modelVersion;

    this.trunkConv1 = makeConv(parsed.trunk.conv1);
    this.trunkGInput = makeMatMul(parsed.trunk.ginput);
    this.trunkBlocks = parsed.trunk.blocks.map((b) => {
      if (b.kind === 'ordinary') {
        return { kind: 'ordinary', preBN: makeBn(b.preBN), w1: makeConv(b.w1), midBN: makeBn(b.midBN), w2: makeConv(b.w2) };
      }
      return {
        kind: 'gpool',
        preBN: makeBn(b.preBN),
        w1a: makeConv(b.w1a),
        w1b: makeConv(b.w1b),
        gpoolBN: makeBn(b.gpoolBN),
        w1r: makeMatMul(b.w1r),
        midBN: makeBn(b.midBN),
        w2: makeConv(b.w2),
      };
    });
    this.trunkTipBN = makeBn(parsed.trunk.tipBN);

    this.p1 = makeConv(parsed.policy.p1);
    this.g1 = makeConv(parsed.policy.g1);
    this.g1BN = makeBn(parsed.policy.g1BN);
    this.gpoolToBias = makeMatMul(parsed.policy.gpoolToBias);
    this.p1BN = makeBn(parsed.policy.p1BN);
    this.p2 = makeConv(parsed.policy.p2);
    this.passMul = makeMatMul(parsed.policy.passMul);

    this.v1 = makeConv(parsed.value.v1);
    this.v1BN = makeBn(parsed.value.v1BN);
    this.v2 = makeMatMul(parsed.value.v2);
    this.v2Bias = makeMatBias(parsed.value.v2Bias);
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
      const g1Out2 = bnRelu(g1Out, this.g1BN);
      const g1Concat = poolRowsGPool(g1Out2); // [N, 96]
      const g1Bias = tf.matMul(g1Concat, this.gpoolToBias.w) as tf.Tensor2D; // [N, p1C]
      p1Out = p1Out.add(g1Bias.reshape([g1Bias.shape[0]!, 1, 1, g1Bias.shape[1]!]));
      const p1Out2 = bnRelu(p1Out, this.p1BN);
      const policy = conv2d(p1Out2, this.p2); // [N,19,19,1]
      const policyPass = tf.matMul(g1Concat, this.passMul.w) as tf.Tensor2D; // [N,1]

      // Value head
      const v1Out = conv2d(trunk, this.v1);
      const v1Out2 = bnRelu(v1Out, this.v1BN);
      const v1Mean = poolRowsValueHead(v1Out2); // [N,96]
      let v2Out = tf.matMul(v1Mean, this.v2.w) as tf.Tensor2D; // [N,64]
      v2Out = v2Out.add(this.v2Bias.b);
      v2Out = tf.relu(v2Out) as tf.Tensor2D;
      let value = tf.matMul(v2Out, this.v3.w) as tf.Tensor2D; // [N,3]
      value = value.add(this.v3Bias.b);
      let scoreValue = tf.matMul(v2Out, this.sv3.w) as tf.Tensor2D; // [N,4]
      scoreValue = scoreValue.add(this.sv3Bias.b);

      const ownership = conv2d(v1Out2, this.ownership); // [N,19,19,1]

      return { policy, policyPass, value, scoreValue, ownership };
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
      const v1Out2 = bnRelu(v1Out, this.v1BN);
      const v1Mean = poolRowsValueHead(v1Out2);
      let v2Out = tf.matMul(v1Mean, this.v2.w) as tf.Tensor2D;
      v2Out = v2Out.add(this.v2Bias.b);
      v2Out = tf.relu(v2Out) as tf.Tensor2D;
      let value = tf.matMul(v2Out, this.v3.w) as tf.Tensor2D;
      value = value.add(this.v3Bias.b);
      let scoreValue = tf.matMul(v2Out, this.sv3.w) as tf.Tensor2D;
      scoreValue = scoreValue.add(this.sv3Bias.b);
      return { value, scoreValue };
    });
  }

  private forwardTrunk(spatial: tf.Tensor4D, global: tf.Tensor2D): tf.Tensor4D {
    let trunk = conv2d(spatial, this.trunkConv1);
    const ginput = tf.matMul(global, this.trunkGInput.w) as tf.Tensor2D;
    trunk = trunk.add(ginput.reshape([ginput.shape[0]!, 1, 1, ginput.shape[1]!]));

    for (const block of this.trunkBlocks) {
      if (block.kind === 'ordinary') {
        const a = bnRelu(trunk, block.preBN);
        const b = conv2d(a, block.w1);
        const c = bnRelu(b, block.midBN);
        const d = conv2d(c, block.w2);
        trunk = trunk.add(d);
        continue;
      }

      const a = bnRelu(trunk, block.preBN);
      let regularOut = conv2d(a, block.w1a);
      const gpoolOut = conv2d(a, block.w1b);
      const gpoolOut2 = bnRelu(gpoolOut, block.gpoolBN);
      const gpoolConcat = poolRowsGPool(gpoolOut2);
      const gpoolBias = tf.matMul(gpoolConcat, block.w1r.w) as tf.Tensor2D;
      regularOut = regularOut.add(gpoolBias.reshape([gpoolBias.shape[0]!, 1, 1, gpoolBias.shape[1]!]));
      const c = bnRelu(regularOut, block.midBN);
      const d = conv2d(c, block.w2);
      trunk = trunk.add(d);
    }

    return bnRelu(trunk, this.trunkTipBN);
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

    for (const block of this.trunkBlocks) {
      tensors.push(block.preBN.scale, block.preBN.bias);
      if (block.kind === 'ordinary') {
        tensors.push(block.w1.filter, block.midBN.scale, block.midBN.bias, block.w2.filter);
      } else {
        tensors.push(block.w1a.filter, block.w1b.filter, block.gpoolBN.scale, block.gpoolBN.bias, block.w1r.w, block.midBN.scale, block.midBN.bias, block.w2.filter);
      }
    }

    tf.dispose(tensors);
  }
}
